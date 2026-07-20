// ============================================================================
//  Grafy (Chart.js + luxon time adapter).
//  Osa X = časová s pevným min/max podle období (24 h / 7 dní / 30 dní),
//  takže vždy pokrývá celé období bez ohledu na to, kolik dat reálně je.
//  Data se vykreslí podle skutečného času; chybějící úsek zůstane prázdný.
// ============================================================================

/* global Chart */

const charts = {};

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function colors() {
  return {
    grid: cssVar("--chart-grid", "rgba(255,255,255,0.06)"),
    tick: cssVar("--muted", "#93a0bd"),
    temp: cssVar("--temp", "#fb923c"),
    dew: cssVar("--dew", "#34d399"),
    hum: cssVar("--humidity", "#38bdf8"),
    press: cssVar("--pressure", "#c084fc"),
    wind: cssVar("--wind", "#a5b4fc"),
    gust: cssVar("--uv", "#fbbf24"),
    precip: cssVar("--rain", "#22d3ee"),
    solar: cssVar("--uv", "#fbbf24"),
    uv: cssVar("--temp", "#fb923c"),
  };
}

// obsTimeLocal "2026-07-18 16:07:03" -> epoch ms (v lokálním čase prohlížeče)
function tsOf(o) {
  const s = (o.obsTimeLocal || "").replace(" ", "T");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
function safe(v) {
  return (v === null || v === undefined || Number.isNaN(Number(v))) ? null : Number(v);
}
// pole {x,y} bodů z pozorování (přeskočí body bez času)
function points(obs, get) {
  return (obs || []).map((o) => ({ x: tsOf(o), y: safe(get(o)) })).filter((p) => p.x != null);
}

const DAY = 24 * 3600 * 1000;
function periodBounds(range) {
  const max = Date.now();
  const days = range === "30day" ? 30 : range === "7day" ? 7 : 1;
  return { min: max - days * DAY, max };
}

function hexA(color, alpha) {
  const c = color.trim();
  if (c.startsWith("#")) {
    const h = c.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return c;
}
function gradient(ctx, area, color) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hexA(color, 0.35));
  g.addColorStop(1, hexA(color, 0.02));
  return g;
}
const withFill = (color) => (ctx) => {
  const { ctx: cx, chartArea } = ctx.chart;
  return chartArea ? gradient(cx, chartArea, color) : hexA(color, 0.2);
};

// Časová osa X s pevným rozsahem podle období.
function xTimeScale(c, range) {
  const { min, max } = periodBounds(range);
  const unit = range === "1day" ? "hour" : "day";
  return {
    type: "time", min, max,
    time: {
      unit,
      displayFormats: { hour: "HH:mm", day: "d.M." },
      tooltipFormat: range === "1day" ? "d.M. HH:mm" : "ccc d.M.",
    },
    grid: { color: c.grid, drawTicks: false },
    ticks: {
      color: c.tick, maxRotation: 0, autoSkip: true, source: "auto",
      maxTicksLimit: range === "1day" ? 7 : range === "7day" ? 8 : 8,
      font: { size: 10 },
    },
  };
}

function baseOptions(c, { unit = "", legend = false, range = "1day" } = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: c.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(15,20,35,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
        titleColor: "#fff", bodyColor: "#e6e8ee", padding: 10, cornerRadius: 10, displayColors: true,
        usePointStyle: true, boxPadding: 4,
        callbacks: { label: (x) => ` ${x.dataset.label}: ${x.parsed.y ?? "—"}${unit}` },
      },
    },
    scales: {
      x: xTimeScale(c, range),
      y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 10 }, maxTicksLimit: 5 } },
    },
    elements: { point: { radius: 0, hitRadius: 14, hoverRadius: 5, hoverBorderWidth: 2 }, line: { borderWidth: 2.5, tension: 0.4 } },
  };
}

function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ---- HLAVNÍ GRAF: teplota + rosný bod ----
export function renderMainChart(observations, range) {
  const c = colors();
  destroy("chart-main");
  const el = document.getElementById("chart-main");
  if (!el) return;

  const opts = baseOptions(c, { unit: "°", range });
  opts.scales.y.ticks.callback = (v) => v + "°";

  charts["chart-main"] = new Chart(el, {
    type: "line",
    data: {
      datasets: [
        { label: "Teplota", data: points(observations, (o) => o.metric?.tempAvg), borderColor: c.temp,
          backgroundColor: withFill(c.temp), fill: true, pointBackgroundColor: c.temp, pointBorderColor: "#fff", order: 1 },
        { label: "Rosný bod", data: points(observations, (o) => o.metric?.dewptAvg), borderColor: c.dew,
          backgroundColor: withFill(c.dew), fill: true, pointBackgroundColor: c.dew, pointBorderColor: "#fff", order: 2 },
      ],
    },
    options: opts,
  });
}

// ---- OSTATNÍ GRAFY (Další grafy) ----
export function renderCharts(observations, range) {
  const c = colors();
  const line = (id, datasets, unit) => {
    destroy(id);
    const el = document.getElementById(id);
    if (!el) return;
    charts[id] = new Chart(el, { type: "line", data: { datasets }, options: baseOptions(c, { unit, legend: datasets.length > 1, range }) });
  };

  line("chart-hum", [{ label: "Vlhkost", data: points(observations, (o) => o.humidityAvg), borderColor: c.hum, backgroundColor: withFill(c.hum), fill: true }], " %");
  line("chart-press", [{ label: "Tlak", data: points(observations, (o) => o.metric?.pressureMax), borderColor: c.press, backgroundColor: withFill(c.press), fill: true }], " hPa");
  line("chart-wind", [
    { label: "Vítr", data: points(observations, (o) => o.metric?.windspeedAvg), borderColor: c.wind, backgroundColor: withFill(c.wind), fill: true },
    { label: "Nárazy", data: points(observations, (o) => o.metric?.windgustHigh), borderColor: c.gust, fill: false, borderDash: [4, 3] },
  ], " km/h");

  destroy("chart-precip");
  const pel = document.getElementById("chart-precip");
  if (pel) charts["chart-precip"] = new Chart(pel, {
    type: "bar",
    data: { datasets: [{ label: "Srážky", data: precipByDay(observations), backgroundColor: c.precip, borderRadius: 4, maxBarThickness: range === "30day" ? 10 : 26 }] },
    options: baseOptions(c, { unit: " mm", range }),
  });

  destroy("chart-solar");
  const sel = document.getElementById("chart-solar");
  if (sel) {
    const o = baseOptions(c, { range });
    charts["chart-solar"] = new Chart(sel, {
      type: "line",
      data: { datasets: [
        { label: "Záření W/m²", data: points(observations, (x) => x.solarRadiationHigh), borderColor: c.solar, backgroundColor: withFill(c.solar), fill: true, yAxisID: "y" },
        { label: "UV", data: points(observations, (x) => x.uvHigh), borderColor: c.uv, fill: false, yAxisID: "y1" },
      ] },
      options: { ...o, scales: {
        x: o.scales.x,
        y: { ...o.scales.y, position: "left" },
        y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: c.tick, font: { size: 10 } } },
      }, plugins: { ...o.plugins, legend: { display: true, labels: { color: c.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } } } },
    });
  }
}

// Denní úhrn srážek -> body {x: poledne dne, y: úhrn}. Úhrn dne = max kumul. precipTotal.
function precipByDay(obs) {
  const map = new Map();
  (obs || []).forEach((o) => {
    const m = (o.obsTimeLocal || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return;
    const v = safe(o.metric?.precipTotal);
    if (v == null) return;
    map.set(m[0], Math.max(map.get(m[0]) ?? 0, v));
  });
  return [...map.entries()].map(([k, v]) => {
    const [y, mo, d] = k.split("-").map(Number);
    return { x: new Date(y, mo - 1, d, 12, 0, 0).getTime(), y: v };
  });
}

// ---- DETAIL GRAF (bottom-sheet) ----
export function renderDetailChart(observations, range, cfg) {
  const c = colors();
  destroy("detail-chart");
  const el = document.getElementById("detail-chart");
  if (!el) return;
  const obs = observations || [];

  if (cfg.kind === "precip") return renderPrecipDetail(el, obs, range, c);

  const color = cssVar(cfg.colorVar, "#7aa2ff");
  const datasets = [{
    label: cfg.label, data: points(obs, cfg.get), borderColor: color,
    backgroundColor: withFill(color), fill: true, pointBackgroundColor: color, pointBorderColor: "#fff",
  }];
  if (cfg.get2) {
    const col2 = cssVar(cfg.color2Var || "--uv", "#fbbf24");
    datasets.push({ label: cfg.label2, data: points(obs, cfg.get2), borderColor: col2, fill: false, borderDash: [4, 3] });
  }
  charts["detail-chart"] = new Chart(el, {
    type: "line", data: { datasets },
    options: baseOptions(c, { unit: cfg.unit ? " " + cfg.unit : "", legend: !!cfg.get2, range }),
  });
}

// Srážky: 24h = kumulativní úhrn v čase, 7d/30d = denní úhrn (sloupce).
function renderPrecipDetail(el, obs, range, c) {
  if (range === "1day") {
    charts["detail-chart"] = new Chart(el, {
      type: "line",
      data: { datasets: [{ label: "Úhrn (kumulativně dnes)", data: points(obs, (o) => o.metric?.precipTotal), borderColor: c.precip, backgroundColor: withFill(c.precip), fill: true, pointBackgroundColor: c.precip, pointBorderColor: "#fff" }] },
      options: baseOptions(c, { unit: " mm", range }),
    });
    return;
  }
  charts["detail-chart"] = new Chart(el, {
    type: "bar",
    data: { datasets: [{ label: "Denní úhrn", data: precipByDay(obs), backgroundColor: c.precip, borderRadius: 5, maxBarThickness: range === "30day" ? 12 : 30 }] },
    options: baseOptions(c, { unit: " mm", range }),
  });
}

export function refreshChartTheme() {
  const c = colors();
  Object.values(charts).forEach((ch) => {
    if (!ch) return;
    if (ch.options.scales?.x) { ch.options.scales.x.grid.color = c.grid; ch.options.scales.x.ticks.color = c.tick; }
    if (ch.options.scales?.y) { ch.options.scales.y.grid.color = c.grid; ch.options.scales.y.ticks.color = c.tick; }
    ch.update("none");
  });
}
