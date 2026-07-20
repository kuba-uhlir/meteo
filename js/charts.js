// ============================================================================
//  Grafy (Chart.js + luxon time adapter).
//  Osa X = časová s pevným min/max podle období (24 h / 7 dní / 30 dní),
//  takže vždy pokrývá celé období bez ohledu na to, kolik dat reálně je.
//  Data se vykreslí podle skutečného času; chybějící úsek zůstane prázdný.
// ============================================================================

/* global Chart, luxon */

// Česká jména dnů/měsíců na časové ose a v tooltipu.
if (window.luxon) window.luxon.Settings.defaultLocale = "cs";

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

// Lehké zjemnění hustých 24h dat: průměr do 15min košů (reálné hodnoty, jen
// vyhlazený šum a celočíselné schody). 7d/30d se nechává (už jsou řídká).
function smoothPoints(pts, range) {
  if (range !== "1day" || pts.length < 30) return pts;
  const BUCKET = 15 * 60 * 1000;
  const map = new Map();
  pts.forEach((p) => {
    if (p.y == null) return;
    const b = Math.round(p.x / BUCKET) * BUCKET;
    const e = map.get(b) || { sum: 0, n: 0 };
    e.sum += p.y; e.n++; map.set(b, e);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([x, e]) => ({ x, y: +(e.sum / e.n).toFixed(2) }));
}
// body veličiny se zjemněním podle období
function series(obs, get, range) {
  return smoothPoints(points(obs, get), range);
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
    adapters: { date: { locale: "cs" } }, // česká jména dnů/měsíců
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
    elements: { point: { radius: 0, hitRadius: 14, hoverRadius: 5, hoverBorderWidth: 2 },
                line: { borderWidth: 2.5, cubicInterpolationMode: "monotone" } },
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
        { label: "Teplota", data: series(observations, (o) => o.metric?.tempAvg, range), borderColor: c.temp,
          backgroundColor: withFill(c.temp), fill: true, pointBackgroundColor: c.temp, pointBorderColor: "#fff", order: 1 },
        { label: "Rosný bod", data: series(observations, (o) => o.metric?.dewptAvg, range), borderColor: c.dew,
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

  line("chart-hum", [{ label: "Vlhkost", data: series(observations, (o) => o.humidityAvg, range), borderColor: c.hum, backgroundColor: withFill(c.hum), fill: true }], " %");
  line("chart-press", [{ label: "Tlak", data: series(observations, (o) => o.metric?.pressureMax, range), borderColor: c.press, backgroundColor: withFill(c.press), fill: true }], " hPa");
  line("chart-wind", [
    { label: "Vítr", data: series(observations, (o) => o.metric?.windspeedAvg, range), borderColor: c.wind, backgroundColor: withFill(c.wind), fill: true },
    { label: "Nárazy", data: series(observations, (o) => o.metric?.windgustHigh, range), borderColor: c.gust, fill: false, borderDash: [4, 3] },
  ], " km/h");

  destroy("chart-precip");
  const pel = document.getElementById("chart-precip");
  if (pel) charts["chart-precip"] = precipBarChart(pel, observations, range, c, "Srážky");

  destroy("chart-solar");
  const sel = document.getElementById("chart-solar");
  if (sel) {
    const o = baseOptions(c, { range });
    charts["chart-solar"] = new Chart(sel, {
      type: "line",
      data: { datasets: [
        { label: "Záření W/m²", data: series(observations, (x) => x.solarRadiationHigh, range), borderColor: c.solar, backgroundColor: withFill(c.solar), fill: true, yAxisID: "y" },
        { label: "UV", data: series(observations, (x) => x.uvHigh, range), borderColor: c.uv, fill: false, yAxisID: "y1" },
      ] },
      options: { ...o, scales: {
        x: o.scales.x,
        y: { ...o.scales.y, position: "left" },
        y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: c.tick, font: { size: 10 } } },
      }, plugins: { ...o.plugins, legend: { display: true, labels: { color: c.tick, usePointStyle: true, boxWidth: 8, font: { size: 11 } } } } },
    });
  }
}

// mapa den "YYYY-MM-DD" -> denní úhrn (max kumulativního precipTotal)
function precipDayMap(obs) {
  const map = new Map();
  (obs || []).forEach((o) => {
    const m = (o.obsTimeLocal || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    const v = safe(o.metric?.precipTotal);
    if (!m || v == null) return;
    map.set(m[0], Math.max(map.get(m[0]) ?? 0, v));
  });
  return map;
}

// mapa hodina(ms začátek) -> hodinový přírůstek srážek
function precipHourMap(obs) {
  const byHour = new Map();
  (obs || []).forEach((o) => {
    const ts = tsOf(o);
    const v = safe(o.metric?.precipTotal);
    if (ts == null || v == null) return;
    const h = Math.floor(ts / 3600000) * 3600000;
    byHour.set(h, Math.max(byHour.get(h) ?? 0, v));
  });
  const entries = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const out = new Map();
  let prev = 0;
  for (const [h, cum] of entries) {
    let inc = cum - prev;
    if (inc < 0) inc = cum; // ochrana proti půlnočnímu resetu
    out.set(h, Math.max(0, +inc.toFixed(2)));
    prev = cum;
  }
  return out;
}

// Kompletní koše pro období (aby osa pokryla celé období a sloupce seděly
// pod popisky). Vrací { labels, data, keys(ms) }.
function precipBuckets(obs, range) {
  const labels = [], data = [], keys = [];
  if (range === "1day") {
    const map = precipHourMap(obs);
    const nowH = Math.floor(Date.now() / 3600000) * 3600000;
    for (let h = nowH - 23 * 3600000; h <= nowH; h += 3600000) {
      labels.push(String(new Date(h).getHours()).padStart(2, "0") + ":00");
      data.push(map.get(h) ?? 0);
      keys.push(h);
    }
  } else {
    const days = range === "30day" ? 30 : 7;
    const map = precipDayMap(obs);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      labels.push(`${d.getDate()}.${d.getMonth() + 1}.`);
      data.push(map.get(key) ?? 0);
      keys.push(d.getTime());
    }
  }
  return { labels, data, keys };
}

// Plugin: nad sloupce vypíše hodnotu (mm). Nula / prázdné -> nic.
const barLabelsPlugin = {
  id: "barLabels",
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart;
    const digits = opts?.digits ?? 1;
    const color = cssVar("--text", "#e8ebf2");
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.type !== "bar" || meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const raw = ds.data[i];
        const val = raw && typeof raw === "object" ? raw.y : raw;
        const r = val == null ? 0 : +Number(val).toFixed(digits);
        if (!(r > 0)) return; // 0 nebo prázdné -> nic
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(String(r), bar.x, bar.y - 3);
        ctx.restore();
      });
    });
  },
};

// Sloupcový graf srážek — kategoriální osa X (popisky vycentrované pod sloupci),
// 24h = hodinové, 7d/30d = denní. Popisky mm nad sloupci, nula = nic.
function precipBarChart(el, obs, range, c, label) {
  const { labels, data, keys } = precipBuckets(obs, range);
  const thickness = range === "30day" ? 12 : range === "7day" ? 28 : 10;
  const o = baseOptions(c, { unit: " mm", range });
  o.layout = { padding: { top: 18 } };       // místo pro popisky nad sloupci
  o.scales.y.beginAtZero = true;
  o.scales.x = { // kategoriální osa -> sloupce i popisky vycentrované k sobě
    grid: { color: c.grid, drawTicks: false },
    ticks: { color: c.tick, maxRotation: 0, autoSkip: true,
             maxTicksLimit: range === "1day" ? 7 : range === "7day" ? 7 : 8, font: { size: 10 } },
  };
  o.plugins.barLabels = { digits: 1 };
  // tooltip: český den/čas podle původního timestampu
  o.plugins.tooltip.callbacks = {
    title: (items) => {
      const t = keys[items[0]?.dataIndex ?? 0];
      if (!window.luxon || t == null) return items[0]?.label ?? "";
      return window.luxon.DateTime.fromMillis(t).toFormat(range === "1day" ? "d.M. HH:mm" : "ccc d.M.");
    },
    label: (x) => ` ${x.dataset.label}: ${x.parsed.y ?? "—"} mm`,
  };
  return new Chart(el, {
    type: "bar",
    data: { labels, datasets: [{ label, data, backgroundColor: c.precip, borderRadius: range === "1day" ? 3 : 5, maxBarThickness: thickness }] },
    options: o,
    plugins: [barLabelsPlugin],
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
    label: cfg.label, data: series(obs, cfg.get, range), borderColor: color,
    backgroundColor: withFill(color), fill: true, pointBackgroundColor: color, pointBorderColor: "#fff",
  }];
  if (cfg.get2) {
    const col2 = cssVar(cfg.color2Var || "--uv", "#fbbf24");
    datasets.push({ label: cfg.label2, data: series(obs, cfg.get2, range), borderColor: col2, fill: false, borderDash: [4, 3] });
  }
  charts["detail-chart"] = new Chart(el, {
    type: "line", data: { datasets },
    options: baseOptions(c, { unit: cfg.unit ? " " + cfg.unit : "", legend: !!cfg.get2, range }),
  });
}

// Srážky: 24h = hodinové srážky, 7d/30d = denní úhrn — vždy sloupce s popisky.
function renderPrecipDetail(el, obs, range, c) {
  const label = range === "1day" ? "Srážky za hodinu" : "Denní úhrn";
  charts["detail-chart"] = precipBarChart(el, obs, range, c, label);
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
