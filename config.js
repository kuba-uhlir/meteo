// ============================================================================
//  Konfigurace meteo dashboardu
// ----------------------------------------------------------------------------
//  POZOR: Toto je STATICKÁ verze bez serveru, takže API_KEY je viditelný
//  komukoli, kdo si otevře zdrojový kód stránky. Klíč je určený jen pro čtení
//  dat z jedné PWS stanice, takže riziko je nízké, ale ber to na vědomí.
//  Pokud budeš chtít klíč schovat, přepni na variantu s proxy (viz README).
// ============================================================================

export const CONFIG = {
  // --- Weather Underground PWS ---
  STATION_ID: "IBUOVI30",
  API_KEY: "131b5fe6169f47129b5fe6169f871206",
  WU_BASE: "https://api.weather.com/v2/pws",

  // --- Lokalita (pro předpověď z Open-Meteo) ---
  LAT: 49.141831,
  LON: 17.020185,
  TIMEZONE: "Europe/Prague",
  LOCATION_NAME: "Vícemilice",

  // --- Open-Meteo ---
  OM_BASE: "https://api.open-meteo.com/v1/forecast",
  // Volitelně vysokorozlišovací model pro střední Evropu:
  //   "icon_d2" (DWD), "meteofrance_arome_france_hd", nebo "" pro best_match.
  OM_MODEL: "",

  // --- Chování aplikace ---
  AUTO_REFRESH_MS: 5 * 60 * 1000, // auto-refresh každých 5 minut
  CACHE_TTL_MS: 60 * 1000,        // lokální cache odpovědí (60 s)
};
