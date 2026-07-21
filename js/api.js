// ============================================================================
//  API vrstva: Weather Underground PWS + Open-Meteo
//  - jednoduchá in-memory cache (TTL) proti zbytečnému vyčerpání limitu klíče
//  - localStorage cache posledních dat pro offline / rychlý první render
//  - jednotné ošetření chyb (chybějící klíč, prázdná data, výpadek API)
// ============================================================================

import { CONFIG } from "../config.js";

const memCache = new Map(); // key -> { ts, data }

function lsKey(key) { return "meteo_cache_" + key; }

// Uloží poslední úspěšná data i do localStorage (offline fallback).
function persist(key, data) {
  try {
    localStorage.setItem(lsKey(key), JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* localStorage plný / nedostupný — ignorujeme */ }
}

export function loadPersisted(key) {
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    return JSON.parse(raw); // { ts, data }
  } catch (_) { return null; }
}

async function fetchJson(url, cacheKey) {
  // in-memory cache
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CONFIG.CACHE_TTL_MS) {
    return cached.data;
  }

  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    // Síťová chyba / CORS / offline
    const err = new Error("Data se teď nepodařilo načíst (dočasný výpadek nebo offline). Zkusím to znovu.");
    err.kind = "network";
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error("Neplatný nebo chybějící API klíč (WU).");
    err.kind = "auth";
    throw err;
  }
  if (res.status === 204) {
    const err = new Error("API nevrátilo žádná data.");
    err.kind = "empty";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Chyba API: HTTP ${res.status}.`);
    err.kind = "http";
    throw err;
  }

  const data = await res.json();
  memCache.set(cacheKey, { ts: Date.now(), data });
  persist(cacheKey, data);
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
  const data = await fetchJson(url, "current");
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
  const data = await fetchJson(url, "hist_" + range);
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
  const today = yyyymmdd(0);
  const toFetch = [];   // { i, date, key }
  const result = new Array(days).fill(null); // index podle i (0 = dnes)

  for (let i = 0; i < days; i++) {
    const date = yyyymmdd(i);
    const key = `hist_${kind}_${date}`;
    if (date !== today) {
      const p = loadPersisted(key);
      if (p?.data?.observations?.length) { result[i] = p.data.observations; continue; }
    }
    toFetch.push({ i, date, key });
  }

  const fetchOne = ({ i, date, key }) => {
    const url = `${CONFIG.WU_BASE}/history/${kind}` +
      `?stationId=${encodeURIComponent(CONFIG.STATION_ID)}` +
      `&date=${date}&format=json&units=m&apiKey=${encodeURIComponent(CONFIG.API_KEY)}`;
    return fetchJson(url, key)
      .then((d) => { result[i] = Array.isArray(d?.observations) ? d.observations : []; })
      .catch(() => { result[i] = []; }); // 204 / chyba dne — přeskoč
  };

  // dávky po 6 (šetrné k WAF)
  const BATCH = 6;
  for (let s = 0; s < toFetch.length; s += BATCH) {
    await Promise.all(toFetch.slice(s, s + BATCH).map(fetchOne));
  }

  // seřaď od nejstaršího po nejnovější (i = days-1 .. 0)
  const out = [];
  for (let i = days - 1; i >= 0; i--) if (result[i]) out.push(...result[i]);
  return out;
}

// --- Hlavní vstup pro grafy (jednoduchý původní model) ---
//  range: "1day" | "7day" | "30day"
//   - 24h a 7 dní: přímo rychlá historie WU (observations/all/{range}) = 1 request
//   - 30 dní: denní agregáty (history/daily po dnech, cachované) — na vyžádání
export async function getHistory(range) {
  if (!configOk()) {
    const err = new Error("Chybí STATION_ID nebo API_KEY v config.js.");
    err.kind = "config";
    throw err;
  }

  if (range === "30day") {
    const byDay = await getHistoryByDays("daily", 30);
    if (!byDay.length) {
      const err = new Error("30denní historii se nepodařilo načíst.");
      err.kind = "empty";
      throw err;
    }
    return byDay;
  }

  // 1day / 7day — přímé volání WU rychlé historie
  return getRapidHistory(range);
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

  const data = await fetchJson(url, "forecast");
  if (!data?.hourly || !data?.daily) {
    const err = new Error("Předpověď se nepodařilo načíst.");
    err.kind = "empty";
    throw err;
  }
  return data;
}
