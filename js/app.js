// ============================================================================
//  Hlavní aplikační logika — meteo dashboard (mockup design)
// ============================================================================

import { CONFIG } from "../config.js";
import { getCurrent, getHistory, getForecast, loadPersisted } from "./api.js";
import { renderMainChart, renderCharts, renderDetailChart, refreshChartTheme } from "./charts.js";
import { wmoIconUrl, wmoText } from "./wmo.js";
import { num, windDir, pressureTrend, uvLevel, hhmm, isoHour, shortDow, ago } from "./format.js";

const el = (id) => document.getElementById(id);
const DROP = '<svg viewBox="0 0 24 24"><path d="M12 2s7 8 7 13a7 7 0 1 1-14 0c0-5 7-13 7-13z" fill="currentColor"/></svg>';

let currentRange = "1day";
let refreshTimer = null;
let heroCondition = { code: null, isDay: true };
let lastCurrent = null;           // poslední aktuální pozorování (pro detail)
const histStore = {};             // cache načtené historie podle rozsahu
let detailMetric = null;
let detailRange = "7day";

// ---------------------------------------------------------------------------
//  Aktuální stav
// ---------------------------------------------------------------------------
function renderCurrent(o) {
  lastCurrent = o;
  const m = o.metric || {};
  const temp = m.temp;
  const feels = m.heatIndex ?? m.windChill ?? temp;

  el("hero-place").textContent = o.neighborhood || CONFIG.LOCATION_NAME;
  el("hero-temp").textContent = num(temp, 0);
  el("hero-feels").textContent = num(feels, 0);
  el("hero-date").textContent = formatDate(o.obsTimeLocal);
  applyHeroIcon(o);

  setTile("t-humidity", `${num(o.humidity, 0)}<span>%</span>`);
  setTile("t-dewpt", `${num(m.dewpt, 0)}<span>°</span>`);
  setTile("t-pressure", `${num(m.pressure, 0)}<span>hPa</span>`);
  setTile("t-wind", `${num(m.windSpeed, 0)}<span>km/h</span>`);
  el("wind-dir-txt").textContent = windDir(o.winddir);
  setTile("t-uv", `${num(o.uv, 1)}`);
  setTile("t-precip-total", `${num(m.precipTotal, 1)}<span>mm</span>`);

  // Tlakový trend
  const pt = pressureTrend(m.pressureTrend);
  const pEl = el("t-pressure-trend");
  pEl.textContent = pt.icon;
  pEl.className = "tile-corner trend " + pt.cls;

  // Směr větru (šipka ukazuje, KAM vítr fouká = winddir + 180°)
  const arrow = el("wind-arrow");
  if (arrow && o.winddir != null) arrow.style.transform = `rotate(${(o.winddir + 180) % 360}deg)`;

  // UV úroveň
  const uv = uvLevel(o.uv);
  const uvEl = el("t-uv-level");
  uvEl.textContent = uv.label;
  uvEl.style.color = uv.color;

  el("foot-station").textContent = `${o.stationID || CONFIG.STATION_ID} · ${num(m.elev, 0)} m n.m.`;
  hideError();
}

function setTile(id, html) { const n = el(id); if (n) n.innerHTML = html; }

function applyHeroIcon(o) {
  let code = heroCondition.code, isDay = heroCondition.isDay;
  if (code === null) {
    // Odhad z WU dat, dokud nedorazí předpověď
    isDay = isDaytime();
    const m = o?.metric || {};
    if (m.precipRate > 0.5) code = 63;
    else if (m.precipRate > 0) code = 61;
    else if (o?.solarRadiation != null && isDay && o.solarRadiation < 120) code = 3;
    else if (o?.humidity >= 95) code = 45;
    else code = 0;
  }
  el("hero-icon").src = wmoIconUrl(code, isDay, true); // animovaná
}

function isDaytime() { const h = new Date().getHours(); return h >= 6 && h < 21; }

function formatDate(local) {
  if (!local) return "";
  const d = new Date(String(local).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "long" });
  return `${date}, ${hhmm(local)} · ${ago(local)}`;
}

// ---------------------------------------------------------------------------
//  Předpověď (Open-Meteo)
// ---------------------------------------------------------------------------
function renderForecast(data) {
  if (data.current) {
    heroCondition = { code: data.current.weather_code, isDay: data.current.is_day === 1 };
    el("hero-icon").src = wmoIconUrl(heroCondition.code, heroCondition.isDay, true);
  }

  // Hodinová: od teď 24 h
  const H = data.hourly;
  const now = Date.now();
  const idx = [];
  for (let i = 0; i < H.time.length; i++) {
    if (new Date(H.time[i]).getTime() < now - 3600e3) continue;
    idx.push(i);
    if (idx.length >= 24) break;
  }
  el("forecast-hourly").innerHTML = idx.map((i) => `
    <div class="hour">
      <div class="hour-time">${isoHour(H.time[i])}</div>
      <img class="hour-ic" src="${wmoIconUrl(H.weather_code[i], H.is_day[i] === 1)}" alt="" />
      <div class="hour-temp">${num(H.temperature_2m[i], 0)}°</div>
      <div class="hour-pop">${DROP}${num(H.precipitation_probability[i], 0)}%</div>
    </div>`).join("");

  // Denní: 7 dní s teplotním pruhem
  const D = data.daily;
  const mins = D.temperature_2m_min, maxs = D.temperature_2m_max;
  const wkMin = Math.min(...mins), wkMax = Math.max(...maxs);
  const span = Math.max(1, wkMax - wkMin);
  el("forecast-daily").innerHTML = D.time.map((day, i) => {
    const l = ((mins[i] - wkMin) / span) * 100;
    const r = ((maxs[i] - wkMin) / span) * 100;
    return `
    <div class="day">
      <div class="day-name">${i === 0 ? "Dnes" : `<span>${shortDow(day)}</span>`}</div>
      <img class="day-ic" src="${wmoIconUrl(D.weather_code[i], true)}" alt="" title="${wmoText(D.weather_code[i])}" />
      <div class="day-min">${num(mins[i], 0)}°</div>
      <div class="day-bar"><span style="left:${l}%;right:${100 - r}%"></span></div>
      <div class="day-max">${num(maxs[i], 0)}°</div>
      <div class="day-pop">${num(D.precipitation_probability_max[i], 0)}%</div>
    </div>`;
  }).join("");

  el("sun-rise").textContent = isoHour(D.sunrise[0]);
  el("sun-set").textContent = isoHour(D.sunset[0]);
}

// ---------------------------------------------------------------------------
//  Načítání
// ---------------------------------------------------------------------------
async function loadAll() {
  showLoading(true);
  try { renderCurrent(await getCurrentRetry()); }
  catch (e) { tryPersisted("current", renderCurrent, e); }

  getForecast().then(renderForecast).catch((e) => tryPersisted("forecast", renderForecast, e, true));

  await loadHistory();
  showLoading(false);
  el("last-sync").textContent = "⟳ " + new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

async function loadHistory() {
  const range = currentRange;
  setChartsLoading(true);
  try {
    const hist = await getHistory(range);
    histStore[range] = hist;
    renderMainChart(hist, range);
    renderCharts(hist, range);
    hideError();
  } catch (e) {
    showError(e.message, e.kind);
  } finally { setChartsLoading(false); }
}

// Aktuální data s jedním opakovaným pokusem (přechodné výpadky WU/sítě).
async function getCurrentRetry() {
  try { return await getCurrent(); }
  catch (e) {
    if (e.kind === "network" || e.kind === "http") {
      await new Promise((r) => setTimeout(r, 1500));
      return await getCurrent(); // druhý pokus
    }
    throw e;
  }
}

// Historie pro detail — použij už načtenou (histStore), jinak dotáhni.
async function getHistoryCached(range) {
  if (histStore[range]) return histStore[range];
  const hist = await getHistory(range);
  histStore[range] = hist;
  return hist;
}

function setChartsLoading(on) {
  const note = el("range-note");
  if (!note) return;
  if (on) { note.hidden = false; note.textContent = "Načítám historii…"; }
  else if (note.textContent === "Načítám historii…") note.hidden = true;
}

function tryPersisted(key, renderFn, err, soft = false) {
  const p = loadPersisted(key);
  if (p?.data) {
    try {
      renderFn(key === "current" ? (p.data.observations?.[0] ?? p.data) : p.data);
      showError(`${err.message} (poslední uložená data)`, "warn");
      return;
    } catch (_) {}
  }
  if (!soft) showError(err.message, err.kind);
}

// ---------------------------------------------------------------------------
//  UI stavy
// ---------------------------------------------------------------------------
function showError(msg, kind = "error") {
  const box = el("error-box");
  box.textContent = msg;
  box.className = "error-box " + (kind === "warn" ? "warn" : "err");
  box.hidden = false;
}
function hideError() { const b = el("error-box"); if (b) b.hidden = true; }
function showLoading(on) { el("refresh-btn")?.classList.toggle("spinning", on); }

// ---------------------------------------------------------------------------
//  Přepínač období
// ---------------------------------------------------------------------------
function initRangeSwitch() {
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      loadHistory();
    });
  });
}

// ---------------------------------------------------------------------------
//  Motiv
// ---------------------------------------------------------------------------
function initTheme() {
  applyTheme(localStorage.getItem("meteo_theme") || "dark");
  el("theme-btn")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("meteo_theme", theme);
  el("theme-btn").textContent = theme === "dark" ? "☀️" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0b1020" : "#eef2fa");
  refreshChartTheme();
}

// ---------------------------------------------------------------------------
//  Refresh + auto + pull-to-refresh
// ---------------------------------------------------------------------------
function initRefresh() {
  el("refresh-btn")?.addEventListener("click", () => loadAll());
  const startTimer = () => { clearInterval(refreshTimer); refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadAll();
  }, CONFIG.AUTO_REFRESH_MS); };
  startTimer();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadAll(); });

  const ptr = el("ptr");
  let startY = 0, pulling = false;
  const scroller = document.scrollingElement || document.documentElement;
  window.addEventListener("touchstart", (e) => {
    if (scroller.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      const d = Math.min(dy, 90);
      ptr.style.height = d + "px"; ptr.style.opacity = Math.min(d / 70, 1);
      ptr.classList.toggle("ready", d >= 70);
    }
  }, { passive: true });
  window.addEventListener("touchend", () => {
    if (!pulling) return; pulling = false;
    const ready = ptr.classList.contains("ready");
    ptr.style.height = "0px"; ptr.style.opacity = "0"; ptr.classList.remove("ready");
    if (ready) loadAll();
  });
}

// ---------------------------------------------------------------------------
//  Detail veličiny (bottom-sheet)
// ---------------------------------------------------------------------------
const DETAIL_METRICS = {
  humidity: { label: "Vlhkost", icon: "humidity", unit: "%", digits: 0, colorVar: "--humidity",
    kind: "line", get: (o) => o.humidityAvg, now: (c) => c.humidity, stats: "minmaxavg" },
  wind: { label: "Vítr", icon: "windsock", unit: "km/h", digits: 0, colorVar: "--wind",
    kind: "line", get: (o) => o.metric?.windspeedAvg, get2: (o) => o.metric?.windgustHigh,
    label2: "Nárazy", color2Var: "--uv", now: (c) => c.metric?.windSpeed,
    nowExtra: (c) => `náraz ${num(c.metric?.windGust, 0)} km/h · ${windDir(c.winddir)}`, stats: "windavgmax" },
  pressure: { label: "Tlak", icon: "barometer", unit: "hPa", digits: 0, colorVar: "--pressure",
    kind: "line", get: (o) => o.metric?.pressureMax, now: (c) => c.metric?.pressure, stats: "minmax" },
  dew: { label: "Rosný bod", icon: "raindrop", unit: "°C", digits: 0, colorVar: "--dew",
    kind: "line", get: (o) => o.metric?.dewptAvg, now: (c) => c.metric?.dewpt, stats: "minmaxavg" },
  uv: { label: "UV index", icon: "uv-index", unit: "", digits: 1, colorVar: "--uv",
    kind: "line", get: (o) => o.uvHigh, now: (c) => c.uv, stats: "max" },
  precip: { label: "Srážky", icon: "raindrops", unit: "mm", digits: 1, colorVar: "--rain",
    kind: "precip", now: (c) => c.metric?.precipTotal, stats: "precip" },
};

function fmtVal(v, cfg) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const u = cfg.unit === "°C" ? "°" : (cfg.unit ? " " + cfg.unit : "");
  return `${num(v, cfg.digits ?? 0)}${u}`;
}

function precipDailyTotals(obs) {
  const byDay = new Map();
  (obs || []).forEach((o) => {
    const m = (o.obsTimeLocal || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return;
    const v = Number(o.metric?.precipTotal);
    if (Number.isNaN(v)) return;
    byDay.set(m[0], Math.max(byDay.get(m[0]) ?? 0, v));
  });
  return [...byDay.values()];
}

function renderDetailStats(obs, cfg) {
  const box = el("detail-stats");
  let chips = [];
  if (cfg.stats === "precip") {
    const days = precipDailyTotals(obs);
    const total = days.reduce((a, b) => a + b, 0);
    const maxDay = days.length ? Math.max(...days) : null;
    chips = [["Úhrn celkem", fmtVal(total, cfg)], ["Nejvíc/den", fmtVal(maxDay, cfg)],
             ["Dní se srážkami", String(days.filter((d) => d > 0.05).length)]];
  } else {
    const vals = (obs || []).map(cfg.get).map(Number).filter((v) => !Number.isNaN(v));
    if (vals.length) {
      const min = Math.min(...vals), max = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (cfg.stats === "windavgmax") {
        const g = obs.map(cfg.get2).map(Number).filter((v) => !Number.isNaN(v));
        chips = [["Průměr", fmtVal(avg, cfg)], ["Max náraz", fmtVal(g.length ? Math.max(...g) : max, cfg)], ["Max vítr", fmtVal(max, cfg)]];
      } else if (cfg.stats === "minmax") chips = [["Min", fmtVal(min, cfg)], ["Max", fmtVal(max, cfg)]];
      else if (cfg.stats === "max") chips = [["Max", fmtVal(max, cfg)], ["Průměr", fmtVal(avg, cfg)]];
      else chips = [["Min", fmtVal(min, cfg)], ["Průměr", fmtVal(avg, cfg)], ["Max", fmtVal(max, cfg)]];
    }
  }
  box.innerHTML = chips.map(([l, v]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-val">${v}</div></div>`).join("");
}

async function loadDetail() {
  const cfg = DETAIL_METRICS[detailMetric];
  if (!cfg) return;
  const note = el("detail-note");
  note.hidden = false; note.textContent = "Načítám…";
  try {
    const obs = await getHistoryCached(detailRange);
    renderDetailChart(obs, detailRange, cfg);
    renderDetailStats(obs, cfg);
    note.hidden = true;
  } catch (e) {
    el("detail-stats").innerHTML = "";
    note.hidden = false; note.textContent = e.message;
  }
}

function openDetail(metric) {
  const cfg = DETAIL_METRICS[metric];
  if (!cfg) return;
  detailMetric = metric;
  detailRange = metric === "precip" ? "7day" : "7day"; // výchozí týden
  el("detail-title").textContent = cfg.label;
  el("detail-icon").src = `icons/w/${cfg.icon}.svg`;

  const now = lastCurrent ? cfg.now(lastCurrent) : null;
  const extra = cfg.nowExtra && lastCurrent ? ` · ${cfg.nowExtra(lastCurrent)}` : "";
  el("detail-now").innerHTML = now != null ? `Teď <b>${fmtVal(now, cfg)}</b>${extra}` : "";

  document.querySelectorAll("#detail-seg .seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.drange === detailRange));

  const ov = el("detail-overlay");
  ov.hidden = false;
  void ov.offsetWidth; // vynutit reflow -> transition naběhne (bez závislosti na rAF)
  ov.classList.add("open");
  document.body.style.overflow = "hidden";
  loadDetail();
}

function closeDetail() {
  const ov = el("detail-overlay");
  ov.classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(() => { ov.hidden = true; }, 320);
}

function initDetail() {
  document.querySelectorAll(".tile[data-metric]").forEach((t) => {
    const open = () => openDetail(t.dataset.metric);
    t.addEventListener("click", open);
    t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  document.querySelectorAll("#detail-seg .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#detail-seg .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      detailRange = btn.dataset.drange;
      loadDetail();
    });
  });
  el("detail-close")?.addEventListener("click", closeDetail);
  el("detail-overlay")?.addEventListener("click", (e) => { if (e.target === el("detail-overlay")) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("detail-overlay").hidden) closeDetail();
  });
}

// ---------------------------------------------------------------------------
//  Service worker
// ---------------------------------------------------------------------------
function initSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

// ---------------------------------------------------------------------------
function boot() {
  initTheme();
  initRangeSwitch();
  initRefresh();
  initDetail();
  initSW();
  loadAll();
}
document.addEventListener("DOMContentLoaded", boot);
