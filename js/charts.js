// ============================================================================
//  Grafy (Chart.js). Hlavní graf = teplota + rosný bod (gradient, tooltip),
//  ostatní (vlhkost, tlak, vítr, srážky, záření) v rozbalovací sekci.
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

function labelFor(o, range) {
  const local = o.obsTimeLocal || "";
  const m = local.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return local;
  const [, , mo, d, hh, mm] = m;
  if (range === "1day") return `${hh}:${mm}`;
  if (range === "30day") return `${d}.${mo}.`;
  return `${d}.${mo} ${hh}h`;
}
function safe(v) {
  return (v === null || v === undefined || Number.isNaN(Number(v))) ? null : Number(v);
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

function baseOptions(c, { unit = "", legend = false } = {}) {
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
      x: { grid: { color: c.grid, drawTicks: false }, ticks: { color: c.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 5, font: { size: 10 } } },
      y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 10 }, maxTicksLimit: 5 } },
    },
    elements: { point: { radius: 0, hitRadius: 14, hoverRadius: 5, hoverBorderWidth: 2 }, line: { borderWidth: 2.5, tension: 0.4 } },
  };
}

function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ---- HLAVNÍ GRAF: teplota + rosný bod ----
export function renderMainChart(observations, range) {
  const c = colors();
  const obs = observations || [];
  const labels = obs.map((o) => labelFor(o, range));
  const temp = obs.map((o) => safe(o.metric?.tempAvg));
  const dew = obs.map((o) => safe(o.metric?.dewptAvg));

  destroy("chart-main");
  const el = document.getElementById("chart-main");
  if (!el) return;

  const opts = baseOptions(c, { unit: "°" });
  // Jemnější osy jako v mockupu
  opts.scales.y.ticks.callback = (v) => v + "°";
  opts.scales.x.ticks.maxTicksLimit = 5;
  opts.plugins.tooltip.callbacks = {
    title: (items) => items[0]?.label ?? "",
    label: (x) => ` ${x.dataset.label}: ${x.parsed.y ?? "—"}°`,
  };

  charts["chart-main"] = new Chart(el, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Teplota", data: temp, borderColor: c.temp,
          backgroundColor: (ctx) => { const {ctx: cx, chartArea} = ctx.chart; return chartArea ? gradient(cx, chartArea, c.temp) : hexA(c.temp, 0.2); },
          fill: true, pointBackgroundColor: c.temp, pointBorderColor: "#fff", order: 1 },
        { label: "Rosný bod", data: dew, borderColor: c.dew,
          backgroundColor: (ctx) => { const {ctx: cx, chartArea} = ctx.chart; return chartArea ? gradient(cx, chartArea, c.dew) : hexA(c.dew, 0.15); },
          fill: true, pointBackgroundColor: c.dew, pointBorderColor: "#fff", order: 2 },
      ],
    },
    options: opts,
  });
}

// ---- OSTATNÍ GRAFY ----
export function renderCharts(observations, range) {
  const c = colors();
  const obs = observations || [];
  const labels = obs.map((o) => labelFor(o, range));
  const M = (p) => obs.map((o) => safe(o.metric?.[p]));
  const T = (p) => obs.map((o) => safe(o[p]));

  const line = (id, datasets, unit) => {
    destroy(id);
    const el = document.getElementById(id);
    if (!el) return;
    charts[id] = new Chart(el, { type: "line", data: { labels, datasets }, options: baseOptions(c, { unit, legend: datasets.length > 1 }) });
  };
  const withFill = (color) => (ctx) => { const {ctx: cx, chartArea} = ctx.chart; return chartArea ? gradient(cx, chartArea, color) : hexA(color, 0.2); };

  line("chart-hum", [{ label: "Vlhkost", data: T("humidityAvg"), borderColor: c.hum, backgroundColor: withFill(c.hum), fill: true }], " %");
  line("chart-press", [{ label: "Tlak", data: M("pressureMax"), borderColor: c.press, backgroundColor: withFill(c.press), fill: true }], " hPa");
  line("chart-wind", [
    { label: "Vítr", data: M("windspeedAvg"), borderColor: c.wind, backgroundColor: withFill(c.wind), fill: true },
    { label: "Nárazy", data: M("windgustHigh"), borderColor: c.gust, fill: false, borderDash: [4, 3] },
  ], " km/h");

  destroy("chart-precip");
  const pel = document.getElementById("chart-precip");
  if (pel) charts["chart-precip"] = new Chart(pel, {
    type: "bar", data: { labels, datasets: [{ label: "Srážky", data: M("precipTotal"), backgroundColor: c.precip, borderRadius: 4, maxBarThickness: 14 }] },
    options: baseOptions(c, { unit: " mm" }),
  });

  destroy("chart-solar");
  const sel = document.getElementById("chart-solar");
  if (sel) {
    const o = baseOptions(c);
    charts["chart-solar"] = new Chart(sel, {
      type: "line",
      data: { labels, datasets: [
        { label: "Záření W/m²", data: T("solarRadiationHigh"), borderColor: c.solar, backgroundColor: withFill(c.solar), fill: true, yAxisID: "y" },
        { label: "UV", data: T("uvHigh"), borderColor: c.uv, fill: false, yAxisID: "y1" },
      ] },
      options: { ...o, scales: {
        x: o.scales.x,
        y: { ...o.scales.y, position: "left" },
        y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: c.tick, font: { size: 10 } } },
      }, plugins: { ...o.plugins, legend: { display: true, labels: { color: c.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } } } },
    });
  }
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
