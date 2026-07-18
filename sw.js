// ============================================================================
//  Service worker — základní offline podpora pro PWA
//  Strategie:
//   - App shell (same-origin HTML/CSS/JS/ikony/Chart.js): cache-first
//     (rychlý start i offline).
//   - API požadavky (weather.com / open-meteo, cross-origin) SW *neřeší* —
//     nechá je projít rovnou na síť. Offline fallback posledních dat zajišťuje
//     localStorage v api.js. (Kdyby SW cross-origin fetch obaloval, hrozí
//     respondWith(undefined) u nezakešovaného požadavku = falešná síťová chyba.)
// ============================================================================

const CACHE = "meteo-shell-v4";
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

  // App shell (same-origin): cache-first, s doplněním cache za běhu.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
