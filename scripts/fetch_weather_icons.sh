#!/usr/bin/env bash
# ============================================================================
#  Stáhne sadu Meteocons ikon (@bybas/weather-icons, MIT) do icons/w/.
#   - statické:   design/fill/export/wi_<name>.svg  -> icons/w/<name>.svg
#   - animované:  production/fill/all/<name>.svg     -> icons/w/anim/<name>.svg
#  Spouštět z kořene projektu:  bash scripts/fetch_weather_icons.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p icons/w icons/w/anim

B="https://cdn.jsdelivr.net/npm/@bybas/weather-icons@2.0.0"

# Podmínkové ikony (animovaná + statická verze)
CONDS="clear-day clear-night partly-cloudy-day partly-cloudy-night overcast-day \
overcast-night cloudy fog-day fog-night fog drizzle partly-cloudy-day-drizzle \
partly-cloudy-night-drizzle rain partly-cloudy-day-rain partly-cloudy-night-rain \
sleet partly-cloudy-day-sleet partly-cloudy-night-sleet snow partly-cloudy-day-snow \
partly-cloudy-night-snow thunderstorms-day thunderstorms-night thunderstorms-rain hail mist"

# Metrické / UI ikony (jen statické)
METRICS="humidity windsock barometer raindrop raindrops uv-index sunrise sunset \
thermometer compass pressure-high-alt pressure-low-alt umbrella"

for name in $CONDS; do
  curl -sf "$B/production/fill/all/$name.svg" -o "icons/w/anim/$name.svg"
  curl -sf "$B/design/fill/export/wi_$name.svg" -o "icons/w/$name.svg"
done
for name in $METRICS; do
  curl -sf "$B/design/fill/export/wi_$name.svg" -o "icons/w/$name.svg"
done

echo "Hotovo: $(ls icons/w/*.svg | wc -l) statických, $(ls icons/w/anim/*.svg | wc -l) animovaných."
