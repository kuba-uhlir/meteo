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
    const err = new Error("Nelze se připojit k API (offline nebo CORS).");
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
async function getHistoryByDays(kind, days) {
  const reqs = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = yyyymmdd(i);
    const url = `${CONFIG.WU_BASE}/history/${kind}` +
      `?stationId=${encodeURIComponent(CONFIG.STATION_ID)}` +
      `&date=${date}&format=json&units=m&apiKey=${encodeURIComponent(CONFIG.API_KEY)}`;
    reqs.push(
      fetchJson(url, `hist_${kind}_${date}`)
        .then((d) => (Array.isArray(d?.observations) ? d.observations : []))
        .catch(() => []) // jednotlivý den může chybět (204) — přeskoč
    );
  }
  const parts = await Promise.all(reqs);
  return parts.flat();
}

// --- Hlavní vstup pro grafy: podle rozsahu vybere endpoint + fallback ---
//  range: "1day" | "7day" | "30day"
export async function getHistory(range) {
  if (!configOk()) {
    const err = new Error("Chybí STATION_ID nebo API_KEY v config.js.");
    err.kind = "config";
    throw err;
  }

  if (range === "1day") {
    // Primárně rychlý all/1day; fallback hodinová historie dneška.
    try {
      const obs = await getRapidHistory("1day");
      if (obs.length) return obs;
    } catch (_) { /* zkus fallback */ }
    return getHistoryByDays("hourly", 1);
  }

  if (range === "7day") {
    // Primárně all/7day (1 request). Když je blokovaný/prázdný -> složit po dnech.
    try {
      const obs = await getRapidHistory("7day");
      if (obs.length) return obs;
    } catch (_) { /* fallback níže */ }
    const byDay = await getHistoryByDays("hourly", 7);
    if (!byDay.length) {
      const err = new Error("7denní historii se nepodařilo načíst (WU vrátil blokaci nebo prázdno).");
      err.kind = "empty";
      throw err;
    }
    return byDay;
  }

  if (range === "30day") {
    // Denní agregáty za posledních 30 dní (history/daily po dnech).
    const byDay = await getHistoryByDays("daily", 30);
    if (!byDay.length) {
      const err = new Error("30denní historii se nepodařilo načíst.");
      err.kind = "empty";
      throw err;
    }
    return byDay;
  }

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
