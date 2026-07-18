// ============================================================================
//  Mapování WMO weather code -> Meteocons ikona (den/noc) + český popis
//  Ikony: @bybas/weather-icons (Meteocons, MIT), stažené lokálně v icons/w/.
//   - statické:   icons/w/{name}.svg
//   - animované:  icons/w/anim/{name}.svg
// ============================================================================

// code -> { d:<denní ikona>, n:<noční ikona>, t:<popis> }
const MAP = {
  0:  { d: "clear-day",              n: "clear-night",              t: "Jasno" },
  1:  { d: "partly-cloudy-day",      n: "partly-cloudy-night",      t: "Skoro jasno" },
  2:  { d: "partly-cloudy-day",      n: "partly-cloudy-night",      t: "Polojasno" },
  3:  { d: "overcast-day",           n: "overcast-night",           t: "Zataženo" },
  45: { d: "fog-day",                n: "fog-night",                t: "Mlha" },
  48: { d: "fog",                    n: "fog",                      t: "Namrzající mlha" },
  51: { d: "partly-cloudy-day-drizzle", n: "partly-cloudy-night-drizzle", t: "Slabé mrholení" },
  53: { d: "drizzle",                n: "drizzle",                  t: "Mrholení" },
  55: { d: "drizzle",                n: "drizzle",                  t: "Silné mrholení" },
  56: { d: "sleet",                  n: "sleet",                    t: "Namrzající mrholení" },
  57: { d: "sleet",                  n: "sleet",                    t: "Namrzající mrholení" },
  61: { d: "partly-cloudy-day-rain", n: "partly-cloudy-night-rain", t: "Slabý déšť" },
  63: { d: "rain",                   n: "rain",                     t: "Déšť" },
  65: { d: "rain",                   n: "rain",                     t: "Silný déšť" },
  66: { d: "sleet",                  n: "sleet",                    t: "Namrzající déšť" },
  67: { d: "sleet",                  n: "sleet",                    t: "Silný namrzající déšť" },
  71: { d: "partly-cloudy-day-snow", n: "partly-cloudy-night-snow", t: "Slabé sněžení" },
  73: { d: "snow",                   n: "snow",                     t: "Sněžení" },
  75: { d: "snow",                   n: "snow",                     t: "Silné sněžení" },
  77: { d: "snow",                   n: "snow",                     t: "Sněhová zrna" },
  80: { d: "partly-cloudy-day-rain", n: "partly-cloudy-night-rain", t: "Slabé přeháňky" },
  81: { d: "rain",                   n: "rain",                     t: "Přeháňky" },
  82: { d: "rain",                   n: "rain",                     t: "Silné přeháňky" },
  85: { d: "partly-cloudy-day-snow", n: "partly-cloudy-night-snow", t: "Sněhové přeháňky" },
  86: { d: "snow",                   n: "snow",                     t: "Silné sněhové přeháňky" },
  95: { d: "thunderstorms-day",      n: "thunderstorms-night",      t: "Bouřka" },
  96: { d: "thunderstorms-rain",     n: "thunderstorms-rain",       t: "Bouřka s krupobitím" },
  99: { d: "thunderstorms-rain",     n: "thunderstorms-rain",       t: "Silná bouřka s kroupami" },
};

const UNKNOWN = { d: "cloudy", n: "cloudy", t: "—" };

function entry(code) {
  return MAP[code] ?? UNKNOWN;
}

// Název ikony (basename bez přípony) pro daný kód a den/noc.
export function wmoIconName(code, isDay = true) {
  const e = entry(code);
  return isDay ? e.d : e.n;
}

// Cesta k SVG. animated=true -> animovaná varianta (pro hero).
export function iconUrl(name, animated = false) {
  return animated ? `icons/w/anim/${name}.svg` : `icons/w/${name}.svg`;
}

// Zkratka: přímo URL ikony pro WMO kód.
export function wmoIconUrl(code, isDay = true, animated = false) {
  return iconUrl(wmoIconName(code, isDay), animated);
}

export function wmoText(code) {
  return entry(code).t;
}
