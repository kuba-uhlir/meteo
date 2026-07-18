# 🌤️ Meteo Vícemilice — mobilní dashboard PWS

Osobní meteo dashboard pro stanici **Vícemilice (IBUOVI30)** — živá data z Weather
Underground + předpověď z Open-Meteo. Postaveno jako **PWA** (Progressive Web App):
mobile-first, instalovatelné na plochu, běží na celou obrazovku, funguje i offline
(poslední data).

Čistá statická verze — **žádný build, žádný server**. Vanilla JS (ES moduly) + Chart.js.
Stačí nahrát složku na web. Vzhled: aurora hero, prosklené dlaždice, gradientové grafy,
barevné/animované ikony počasí ([Meteocons](https://bas.dev/work/meteocons), MIT).

---

## ✨ Co umí

- **Aktuální stav** (velké dlaždice): teplota + pocitová, vlhkost, rosný bod, tlak
  s trendovou šipkou, vítr (rychlost/náraz/směr + růžice), srážky (intenzita + úhrn),
  UV index (s barevnou kvalitou), sluneční záření, nadm. výška, stanice, čas.
- **Dnešní přehled**: min / max / průměr teploty, vlhkosti, tlaku, větru.
- **Předpověď (Open-Meteo)**: hodinová (24 h, scrollovací pás), denní na 7 dní
  (ikona, min/max, srážky, vítr), východ/západ slunce.
- **Grafy historie** s přepínačem **24 h / 7 dní / 30 dní**: teplota + rosný bod,
  vlhkost, tlak, vítr + nárazy, srážky, sluneční záření + UV. Interaktivní tooltip.
- **PWA + instalace na plochu**: banner „Nainstalovat aplikaci" (Android/Chrome přes
  `beforeinstallprompt`, na iOS Safari návod *Sdílet → Přidat na plochu*), service worker,
  offline shell + poslední data.
- **Design**: tmavý/světlý motiv (přepínač), zaoblené karty, dynamické barvy podle
  hodnot, pull-to-refresh, tlačítko obnovit, auto-refresh každých 5 min.

---

## 🚀 Spuštění lokálně

PWA (ES moduly + service worker) potřebuje **HTTP server**, ne `file://`. Nejjednodušeji:

```bash
# v kořeni projektu
python -m http.server 8765
# otevři http://127.0.0.1:8765
```

Nebo cokoli jiného (`npx serve`, `php -S localhost:8765`, …).

---

## ⚙️ Konfigurace

Vše je v [`config.js`](config.js):

```js
STATION_ID: "IBUOVI30",
API_KEY:    "131b5fe6169f47129b5fe6169f871206",
LAT: 49.141831, LON: 17.020185,   // pro předpověď (Open-Meteo)
OM_MODEL: "",                     // "" = best_match; nebo "icon_d2", "meteofrance_arome_france_hd"
AUTO_REFRESH_MS: 5*60*1000,       // auto-refresh
CACHE_TTL_MS: 60*1000,            // lokální cache odpovědí
```

> ⚠️ **Bezpečnost klíče:** Toto je statická verze — `API_KEY` je viditelný komukoli
> ve zdrojáku stránky. Klíč je jen pro čtení jedné PWS, takže riziko je nízké.
> Kdo chce klíč schovat, ať přejde na variantu s proxy (viz níže).

---

## 🌐 Nasazení na vlastní subdoménu

Je to statika — nahraj celou složku na web (subdoména, kořen webu, `public_html`, …):

```
index.html  config.js  manifest.webmanifest  sw.js
css/  js/  vendor/  icons/
```

Podmínky pro plnou funkci PWA:
- **HTTPS** (service worker jinak neběží; `localhost` je výjimka).
- Soubory servírované se správnými MIME typy (`.js` jako `application/javascript`,
  `.webmanifest` jako `application/manifest+json`). Běžné webservery to umí samy.
- Aplikace používá jen **relativní cesty**, takže funguje i v podadresáři
  (`https://meteo.tvujweb.cz/` i `https://tvujweb.cz/meteo/`).

`scripts/make_icons.py` generuje PWA ikony (spouštět není nutné — ikony jsou přiložené).

---

## 📡 Zdroje dat a endpointy

**Weather Underground PWS** (`https://api.weather.com/v2/pws`, `apiKey` v query, `units=m`):

| Účel | Endpoint |
|------|----------|
| Aktuální | `observations/current` |
| Historie 24 h | `observations/all/1day` |
| Historie 7 dní | `observations/all/7day` → *fallback* `history/hourly` po dnech |
| Historie 30 dní | `history/daily` po dnech |

**Open-Meteo** (`https://api.open-meteo.com/v1/forecast`, bez klíče) — hodinová + denní
předpověď, `weather_code` (WMO) mapovaný na ikonu a český popis.

### ⚠️ Poznámka k WU historii (důležité)
Endpoint `observations/all/7day` je občas **blokovaný na CDN (Akamai „Access Denied", HTTP
401)** — a protože chybová stránka nemá CORS hlavičku, prohlížeč to hlásí jako „Failed to
fetch". Blokace bývá vázaná na IP/síť. Proto je 7denní pohled řešený **odolně**:

1. zkusí rychlý `observations/all/7day` (1 request),
2. když selže, **složí data z `history/hourly` po jednotlivých dnech** (7 requestů).

30denní pohled jede rovnou přes `history/daily` (30 denních agregátů). Když stanice pro
starší dny nemá data (WU vrací `204`), graf ukáže jen dostupné dny — appka nespadne.

---

## 🔒 Volitelně: varianta s proxy (schovaný klíč)

Pokud bys klíč nechtěl mít veřejný, přidej lehký proxy endpoint (Node/Express nebo
serverless na Vercel/Netlify), který drží klíč na serveru a frontend volá jen jeho:

```
GET /api/current
GET /api/history?range=1day|7day|30day
```

Proxy volá WU s klíčem z env proměnné, přidá cache 60–120 s (šetří denní limit) a vrací
JSON dál. Ve frontendu by pak stačilo v `js/api.js` přepnout base URL na `/api/...`.
Předpověď z Open-Meteo klíč nepotřebuje, ta může zůstat přímo.

---

## 🗂️ Struktura

```
index.html                 # kostra UI
config.js                  # STATION_ID, API_KEY, souřadnice, chování
manifest.webmanifest       # PWA manifest
sw.js                      # service worker (offline shell)
css/styles.css             # styly (mobile-first, motivy)
js/
  app.js                   # orchestrace, render, refresh, motiv, pull-to-refresh
  api.js                   # WU + Open-Meteo, cache, ošetření chyb, fallbacky historie
  charts.js                # 6 grafů (Chart.js)
  wmo.js                   # WMO weather code -> ikona + český popis
  format.js                # jednotky, směr větru, tlakový trend, čas, barvy
vendor/chart.umd.min.js    # Chart.js (lokálně, kvůli offline)
icons/                     # PWA ikony aplikace (192, 512, maskable)
  w/                       # ikony počasí (Meteocons) — statické
  w/anim/                  # animované ikony počasí (pro hero)
scripts/make_icons.py      # generátor PWA ikon (bez závislostí)
scripts/fetch_weather_icons.sh  # (re)stažení Meteocons ikon
```

## 🎨 Ikony (atribuce)
Ikony počasí i metrik jsou [Meteocons](https://bas.dev/work/meteocons) od Bas Miliuse
(balíček npm `@bybas/weather-icons`, **licence MIT**), stažené lokálně do `icons/w/`
(fungují offline, bez CDN). Přemapování na WMO kódy je v `js/wmo.js`. Chceš-li ikony
znovu stáhnout nebo přidat další, spusť `scripts/fetch_weather_icons.sh`.

## 📲 Instalace na plochu (návod pro tebe)
- **Android / Chrome:** otevři web → nahoře vyskočí banner **Instalovat**, nebo menu
  prohlížeče → *Přidat na plochu / Instalovat aplikaci*.
- **iPhone / Safari:** tlačítko **Sdílet** → **Přidat na plochu**.
- Po instalaci běží na celou obrazovku jako nativní appka (bez adresního řádku).
- Podmínka: web musí běžet přes **HTTPS** (na `localhost` to jde taky).

---

## 🧯 Chybové stavy

Aplikace ošetřuje: chybějící/špatný klíč, prázdná data, výpadek API / CORS, blokaci WU
historie. Při výpadku ukáže **poslední uložená data** (localStorage) s upozorněním,
jinak jasnou hlášku v UI.
