// ============================================================================
//  Pomocné formátovací funkce (jednotky, směr větru, tlakový trend, čas)
// ============================================================================

// --- Číselné hodnoty s ošetřením null/undefined ---
export function num(v, digits = 0, dash = "—") {
  if (v === null || v === undefined || Number.isNaN(v)) return dash;
  return Number(v).toFixed(digits);
}

// --- Směr větru: stupně -> světová strana (16 sektorů) ---
const DIRS = ["S", "SSV", "SV", "VSV", "V", "VJV", "JV", "JJV",
              "J", "JJZ", "JZ", "ZJZ", "Z", "ZSZ", "SZ", "SSZ"];

export function windDir(deg) {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return "—";
  const idx = Math.round((deg % 360) / 22.5) % 16;
  return DIRS[idx];
}

// --- Tlakový trend: číslo/pole -> symbol + popis ---
export function pressureTrend(trend) {
  const t = Number(trend);
  if (Number.isNaN(t) || t === 0) return { icon: "→", label: "setrvalý", cls: "steady" };
  if (t > 0) return { icon: "↑", label: "stoupá", cls: "rising" };
  return { icon: "↓", label: "klesá", cls: "falling" };
}

// --- Barevný akcent podle teploty (°C) -> CSS proměnná / hodnota ---
export function tempColor(t) {
  if (t === null || t === undefined || Number.isNaN(t)) return "var(--accent)";
  if (t <= -10) return "#4d7cff";
  if (t <= 0)   return "#5aa9ff";
  if (t <= 10)  return "#43c6db";
  if (t <= 18)  return "#4fd18b";
  if (t <= 25)  return "#f4c430";
  if (t <= 30)  return "#ff9f43";
  return "#ff5c5c";
}

// --- Kvalita UV indexu -> barva + popis ---
export function uvLevel(uv) {
  const u = Number(uv);
  if (Number.isNaN(u)) return { label: "—", color: "var(--muted)" };
  if (u < 3)  return { label: "nízký",       color: "#4fd18b" };
  if (u < 6)  return { label: "střední",     color: "#f4c430" };
  if (u < 8)  return { label: "vysoký",      color: "#ff9f43" };
  if (u < 11) return { label: "velmi vysoký",color: "#ff5c5c" };
  return { label: "extrémní", color: "#b26bff" };
}

// --- Čas: "2026-07-18 15:43:03" -> "15:43" ---
export function hhmm(local) {
  if (!local) return "—";
  const m = String(local).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
}

// --- ISO "2026-07-18T15:30" -> "15:00" ---
export function isoHour(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
}

// --- Krátký den v týdnu z ISO data "2026-07-18" ---
const DOW = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
export function shortDow(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return DOW[d.getDay()];
}

// --- Relativní čas "před 3 min" z lokálního timestampu ---
export function ago(local) {
  if (!local) return "";
  const t = new Date(String(local).replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((Date.now() - t) / 60000);
  if (diff < 1) return "právě teď";
  if (diff === 1) return "před 1 min";
  if (diff < 60) return `před ${diff} min`;
  const h = Math.round(diff / 60);
  return `před ${h} h`;
}
