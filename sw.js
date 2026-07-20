// ============================================================================
//  Service worker — základní offline podpora pro PWA
//  Strategie:
//   - App shell (same-origin HTML/CSS/JS/ikony/Chart.js): stale-while-revalidate
//     — hned vrátí z cache (rychlý start i offline), na pozadí stáhne aktuální
//     verzi a přepíše cache. Změny nahrané na server se tak projeví při dalším
//     otevření (bez nutnosti bumpovat verzi cache).
//   - API požadavky (weather.com / open-meteo, cross-origin) SW *neřeší* —
//     nechá je projít rovnou na síť. Offline fallback posledních dat zajišťuje
//     localStorage v api.js. (Kdyby SW cross-origin fetch obaloval, hrozí
//     respondWith(undefined) u nezakešovaného požadavku = falešná síťová chyba.)
// ============================================================================

const CACHE = "meteo-shell-v8";
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/api.js",
  "./js/charts.js",
  "./js/wmo.js",
  "./js/format.js",
  "./vendor/chart.umd.min.js",
  "./vendor/luxon.min.js",
  "./vendor/chartjs-adapter-luxon.umd.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Cross-origin (API, CDN) neobalujeme — ať jde přímo na síť.
  if (url.origin !== self.location.origin) return;

  // App shell (same-origin): stale-while-revalidate.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => cached || cache.match("./index.html"));
    // Máme-li cache, vrať ji hned; síť běží na pozadí a obnoví cache.
    return cached || network;
  })());
});
