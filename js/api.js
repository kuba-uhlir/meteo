// ============================================================================
//  API vrstva: Weather Underground PWS + Open-Meteo
//  - jednoduchá in-memory cache (TTL) proti zbytečnému vyčerpání limitu klíče
//  - localStorage cache posledních dat pro offline / rychlý první render
//  - jednotné ošetření chyb (chybějící klíč, prázdná data, výpadek API)
// ============================================================================

import { CONFIG } from "../config.js";

const memCache = new Map(); // key -> { ts, data }

// TTL podle typu dat (ms) — jak dlouho brát z cache bez dotazu na API.
const TTL = {
  current: 3 * 60 * 1000,             // aktuální data — 3 min
  todayHistory: 5 * 60 * 1000,        // historie dneška (roste) — 5 min
  forecast: 20 * 60 * 1000,           // předpověď — 20 min
  pastDay: 3650 * 24 * 3600 * 1000,   // hotový minulý den — prakticky napořád
};

function lsKey(key) { return "meteo_cache_" + key; }

function persist(key, data) {
  try { localStorage.setItem(lsKey(key), JSON.stringify({ ts: Date.now(), data })); }
  catch (_) { /* localStorage plný/nedostupný */ }
}

export function loadPersisted(key) {
  try { const raw = localStorage.getItem(lsKey(key)); return raw ? JSON.parse(raw) : null; }
  catch (_) { return null; }
}

// Čerstvá cache (mem + localStorage) do stáří ttl.
function cacheFresh(key, ttl) {
  const now = Date.now();
  const mem = memCache.get(key);
  if (mem && now - mem.ts < ttl) return mem.data;
  const p = loadPersisted(key);
  if (p && now - p.ts < ttl) { memCache.set(key, { ts: p.ts, data: p.data }); return p.data; }
  return null;
}
// Jakákoli uložená data (ignoruje stáří) — fallback při chybě/limitu.
function cacheAny(key) {
  const mem = memCache.get(key);
  if (mem) return mem.data;
  const p = loadPersisted(key);
  return p ? p.data : null;
}
function cacheSet(key, data) {
  memCache.set(key, { ts: Date.now(), data });
  persist(key, data);
}

// fetch + cache. ttl = jak dlouho servírovat z cache bez dotazu.
// Při chybě (rate-limit, výpadek, 401) vrátí poslední známá data místo chyby.
async function fetchJson(url, key, ttl = 0) {
  const fresh = cacheFresh(key, ttl);
  if (fresh) return fresh;

  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (_) {
    const stale = cacheAny(key);
    if (stale) return stale;
    const err = new Error("Data se nepodařilo načíst (offline nebo výpadek).");
    err.kind = "network";
    throw err;
  }

  if (res.status === 204) { const empty = { observations: [] }; cacheSet(key, empty); return empty; }

  if (!res.ok) {
    const stale = cacheAny(key);
    if (stale) return stale; // radši poslední data než chyba (limit/blokace)
    let err;
    if (res.status === 429) { err = new Error("Překročen limit API. Zkusím to za chvíli."); err.kind = "rate"; }
    else if (res.status === 401 || res.status === 403) { err = new Error("Neplatný/blokovaný klíč nebo překročen limit API."); err.kind = "auth"; }
    else { err = new Error(`Chyba API: HTTP ${res.status}.`); err.kind = "http"; }
    throw err;
  }

  const data = await res.json();
  cacheSet(key, data);
  return data;
}

// --- Kontrola konfigurace klíče ---
export function configOk() {
  return CONFIG.API_KEY && CONFIG.API_KEY.length > 10 &&
         CONFIG.STATION_ID && CONFIG.STATION_ID.length > 2;
}

// --- Weather Underground: aktuální pozorování ---
export async function getCurrent() {
  if (!configOk()) {
    const err = new Error("Chybí STATION_ID nebo API_KEY v config.js.");
    err.kind = "config";
    throw err;
  }
  const url = `${CONFIG.WU_BASE}/observations/current` +
    `?stationId=${encodeURIComponent(CONFIG.STATION_ID)}` +
    `&format=json&units=m&apiKey=${encodeURIComponent(CONFIG.API_KEY)}`;
  const data = await fetchJson(url, "current", TTL.current);
  const obs = data?.observations?.[0];
  if (!obs) {
    const err = new Error("Stanice nevrátila aktuální data.");
    err.kind = "empty";
    throw err;
  }
  return obs;
}

// --- WU rychlá historie (observations/all/{1day|7day}) ---
async function getRapidHistory(range) {
  const url = `${CONFIG.WU_BASE}/observations/all/${range}` +
    `?stationId=${encodeURIComponent(CONFIG.STATION_ID)}` +
    `&format=json&units=m&apiKey=${encodeURIComponent(CONFIG.API_KEY)}`;
  const data = await fetchJson(url, "hist_" + range, TTL.todayHistory);
  return Array.isArray(data?.observations) ? data.observations : [];
}

// YYYYMMDD pro N-tý den zpět (0 = dnes) v lokálním čase.
function yyyymmdd(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Sloučí historii po jednotlivých dnech (fallback, když je all/7day blokovaný).
//  kind = "hourly" (hodinové záznamy) | "daily" (denní agregát)
//  Optimalizace proti rate-limitu WU:
//   - minulé dny jsou neměnné -> berou se z localStorage cache (žádný request)
//   - jen dnešek se stahuje vždy čerstvě
//   - zbylé nezakešované dny se stahují po malých dávkách (ne 30 naráz)
async function getHistoryByDays(kind, days) {
  const result = new Array(days).fill(null); // index i (0 = dnes)
  const toFetch = [];
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = yyyymmdd(i);
    const key = `hist_${kind}_${date}`;
    if (i >= 1) {
      // Minulý den je neměnný -> použij cache jen když byla uložena PO konci
      // toho dne (tj. den je kompletní). dayEnd = 00:00 následujícího dne.
      const dayEnd = midnight.getTime() - (i - 1) * 86400000;
      const p = loadPersisted(key);
      if (p?.data && p.ts >= dayEnd) { result[i] = p.data.observations || []; continue; }
    }
    toFetch.push({ i, date, key, isToday: i === 0 });
  }

  const fetchOne = ({ i, date, key, isToday }) => {
    const url = `${CONFIG.WU_BASE}/history/${kind}` +
      `?stationId=${encodeURIComponent(CONFIG.STATION_ID)}` +
      `&date=${date}&format=json&units=m&apiKey=${encodeURIComponent(CONFIG.API_KEY)}`;
    return fetchJson(url, key, isToday ? TTL.todayHistory : 0)
      .then((d) => { result[i] = Array.isArray(d?.observations) ? d.observations : []; })
      .catch(() => { result[i] = []; });
  };

  // dávky po 5 s malou pauzou (šetrné k limitu API)
  const BATCH = 5;
  for (let s = 0; s < toFetch.length; s += BATCH) {
    await Promise.all(toFetch.slice(s, s + BATCH).map(fetchOne));
    if (s + BATCH < toFetch.length) await new Promise((r) => setTimeout(r, 250));
  }

  const out = [];
  for (let i = days - 1; i >= 0; i--) if (result[i]) out.push(...result[i]);
  return out;
}

// --- Hlavní vstup pro grafy ---
//  range: "1day" | "7day" | "30day"
//   - 24h: observations/all/1day (1 request)
//   - 7 dní: history/hourly po dnech (all/7day vrací 401 -> nepoužitelný)
//   - 30 dní: history/daily po dnech
//  Minulé dny se cachují napořád (fetchne se jen dnešek), takže po prvním
//  načtení je 7d/30d prakticky zdarma.
export async function getHistory(range) {
  if (!configOk()) {
    const err = new Error("Chybí STATION_ID nebo API_KEY v config.js.");
    err.kind = "config";
    throw err;
  }

  if (range === "1day") return getRapidHistory("1day");

  const obs = range === "30day"
    ? await getHistoryByDays("daily", 30)
    : await getHistoryByDays("hourly", 7);
  if (!obs.length) {
    const err = new Error(`${range === "30day" ? "30denní" : "7denní"} historii se nepodařilo načíst.`);
    err.kind = "empty";
    throw err;
  }
  return obs;
}

// --- Open-Meteo: předpověď (hodinová + denní) ---
export async function getForecast() {
  const hourly = [
    "temperature_2m", "apparent_temperature", "relative_humidity_2m",
    "dew_point_2m", "precipitation", "precipitation_probability",
    "weather_code", "wind_speed_10m", "wind_gusts_10m",
    "wind_direction_10m", "pressure_msl", "cloud_cover", "uv_index",
    "is_day",
  ].join(",");
  const daily = [
    "weather_code", "temperature_2m_max", "temperature_2m_min",
    "apparent_temperature_max", "apparent_temperature_min",
    "precipitation_sum", "precipitation_probability_max",
    "wind_speed_10m_max", "wind_gusts_10m_max", "uv_index_max",
    "sunrise", "sunset",
  ].join(",");

  let url = `${CONFIG.OM_BASE}` +
    `?latitude=${CONFIG.LAT}&longitude=${CONFIG.LON}` +
    `&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}` +
    `&forecast_days=7&hourly=${hourly}&daily=${daily}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day`;
  if (CONFIG.OM_MODEL) url += `&models=${encodeURIComponent(CONFIG.OM_MODEL)}`;

  const data = await fetchJson(url, "forecast", TTL.forecast);
  if (!data?.hourly || !data?.daily) {
    const err = new Error("Předpověď se nepodařilo načíst.");
    err.kind = "empty";
    throw err;
  }
  return data;
}
