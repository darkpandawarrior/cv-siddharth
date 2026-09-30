// LANE V7 (wave 7, "How it's built" panel, Cesium Sandcastle pattern): the
// single source HowItsBuilt.tsx renders from. Every shader string below is
// the literal exported constant a layer compiles (imported, never retyped),
// so drift is structurally impossible; every provenance endpoint/licence
// below is the literal exported constant or builder function the same layer
// calls to fetch, for the same reason (howItsBuiltData.test.ts proves both).
import { GLOBE_RADIUS } from "../geoMath.ts";
import { VERT, ATMO_FRAG, OCEAN_FRAG } from "../layers/sun.ts";
import { CLOUD_FRAG } from "../layers/cloudShader.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "../layers/earthImageryShader.ts";
import { GIBS_CATALOG, GIBS_OVERLAYS, tileUrl } from "../layers/gibsCatalog.ts";
import { dayImageryAttempts, gapFillUrl, reliefUrl, nightLightsUrl, seaIceAttempts, describeImagerySource, type GibsSize } from "../layers/gibs.ts";
import { LIBERTY_STYLE_URL, PANORAMAX_SEARCH_ENDPOINT } from "../streetPhotos.ts";
import { mapsExport } from "../../../data/generated/mapsPlaces.ts";
import { ADSB_URL, FORECAST_URL, QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, NHC_CONE_LAYER_IDS, nhcConeUrl } from "../layers/feedUrls.ts";
import { TLE_SOURCE, TLE_STATIONS_URL, TLE_VISUAL_URL } from "../layers/tleSource.ts";

import { DAYLIGHT_FRAG, ECLIPSE_GSFC_NOTE, BLOOM_THRESHOLD, BLOOM_INTENSITY } from "../layers/layerKeys.ts";
import { XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL } from "../layers/solarFlare.ts";
import { MARINE_HOST } from "../layers/marine.ts";
import { AIR_QUALITY_HOST } from "../layers/airQuality.ts";
import { FLOOD_HOST } from "../layers/flood.ts";
import astronomyPackage from "../../../../node_modules/astronomy-engine/package.json";
import r3PostPackage from "../../../../node_modules/@react-three/postprocessing/package.json";
import postPackage from "../../../../node_modules/postprocessing/package.json";

export interface ShaderSource {
  name: string;
  code: string;
}

export interface Provenance {
  label: string;
  endpoint: string;
  fetchedAt?: string;
  licence: string;
  licenceUrl?: string;
}

export interface HowItsBuiltEntry {
  id: string;
  title: string;
  description?: string;
  shaders: ShaderSource[];
  provenance: Provenance[];
}

// The same 2048x1024 request size EarthImagery.tsx's own T2/T3 texture load
// uses (its T1 hi-res upgrade is 4096x2048) -- close enough for an honest
// illustrative endpoint; the exact pixel size never changes the URL's host,
// path or TIME segment, which is what the test below actually checks.
const SIZE: GibsSize = { width: 2048, height: 1024 };

function gibsProvenance(id: string, now: Date): Provenance {
  const entry = GIBS_CATALOG[id];
  return { label: entry.title, endpoint: tileUrl(entry, 0, 0, 0, now), licence: entry.attribution };
}

/** `now` defaults live so the panel always shows today's real GIBS date
 *  segment; the test below freezes it to prove the SAME functions produce
 *  the SAME strings, not to pin one date forever. */
export function buildHowItsBuiltEntries(now: Date = new Date()): HowItsBuiltEntry[] {
  const day = dayImageryAttempts(now, SIZE)[0];
  const ice = seaIceAttempts(now, SIZE)[0];
  const src = describeImagerySource(now);

  return [
    { id: "daylight", title: "Daylight: golden hour and waking cities", description: "Computed from the subsolar point, not fetched", shaders: [{ name: "fragment", code: DAYLIGHT_FRAG }], provenance: [] },
    { id: "eclipse", title: "Eclipse paths", description: ECLIPSE_GSFC_NOTE, shaders: [], provenance: [
      { label: "astronomy-engine", endpoint: "https://github.com/cosinekitty/astronomy", licence: astronomyPackage.license },
      { label: "NASA GSFC cross-check", endpoint: "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html", licence: "NASA US government public domain" },
    ] },
    { id: "bloom", title: "Bloom: night lights", description: `Luminance threshold ${BLOOM_THRESHOLD}, intensity ${BLOOM_INTENSITY}. Imagery only, tiers 1 and 2.`, shaders: [], provenance: [
      { label: "@react-three/postprocessing", endpoint: "https://github.com/pmndrs/react-postprocessing", licence: r3PostPackage.license },
      { label: "postprocessing", endpoint: "https://github.com/pmndrs/postprocessing", licence: postPackage.license },
    ] },
    { id: "space-weather", title: "Space weather: GOES X-ray, proton flux and solar wind", shaders: [], provenance: [XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL].map((endpoint) => ({ label: "NOAA SWPC", endpoint, licence: "NOAA US government public domain" })) },
    { id: "aircraft", title: "Aircraft: local ADS-B cluster", shaders: [], provenance: [{ label: "adsb.lol", endpoint: ADSB_URL, licence: "adsb.lol, ODbL 1.0" }] },
    { id: "wind", title: "Wind: 10 m global model grid", shaders: [], provenance: [{ label: "Open-Meteo", endpoint: FORECAST_URL, licence: "CC BY 4.0, Open-Meteo.com", licenceUrl: "https://open-meteo.com/en/licence" }] },
    { id: "marine", title: "Marine: waves and swell", shaders: [], provenance: [{ label: "Open-Meteo marine", endpoint: MARINE_HOST, licence: "CC BY 4.0, Open-Meteo.com", licenceUrl: "https://open-meteo.com/en/licence" }] },
    { id: "air-quality", title: "Air quality: CAMS model", shaders: [], provenance: [{ label: "Open-Meteo / CAMS", endpoint: AIR_QUALITY_HOST, licence: "CC BY 4.0, Open-Meteo.com / CAMS", licenceUrl: "https://open-meteo.com/en/licence" }] },
    { id: "flood", title: "Flood: GloFAS river discharge model", shaders: [], provenance: [{ label: "Open-Meteo / GloFAS", endpoint: FLOOD_HOST, licence: "CC BY 4.0, Open-Meteo.com / GloFAS", licenceUrl: "https://open-meteo.com/en/licence" }] },
    { id: "gibs-overlays", title: "GIBS imagery overlays (complete catalogue)", shaders: [], provenance: GIBS_OVERLAYS.map((entry) => gibsProvenance(entry.id, now)) },
    { id: "tides-cape-meteors", title: "Tides, atmospheric instability and approximate meteor radiants", shaders: [], provenance: [
      { label: "NOAA CO-OPS (stations within 50 km, US coastal coverage, MLLW datum, UTC)", endpoint: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter", licence: "NOAA US government public domain" },
      { label: "Open-Meteo hourly CAPE (atmospheric instability proxy, not lightning)", endpoint: "https://api.open-meteo.com/v1/forecast", licence: "CC BY 4.0, https://open-meteo.com/en/docs" },
      { label: "IMO 2026 Table 5, scientific numeric facts; approximate annual windows and peak radiants", endpoint: "https://imo.net/files/meteor-shower/cal2026.pdf", licence: "Facts transcribed with citation, no copyrighted prose or artwork reproduced; parent bodies from NASA and AMS" },
    ] },
    {
      id: "satellites",
      title: "Satellites (CelesTrak GP elements, propagated with SGP4)",
      shaders: [],
      provenance: [TLE_STATIONS_URL, TLE_VISUAL_URL].map((endpoint) => ({ label: TLE_SOURCE, endpoint, licence: "CelesTrak orbital data, shown with attribution" })),
    },
    {
      id: "keyless-ocean-volcano-sun",
      title: "Ocean observations, weekly volcanic reports and solar disc",
      shaders: [],
      provenance: [
        { label: "NOAA NDBC latest observations (sampled 200 stations maximum, 10 min cache)", endpoint: "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt", licence: "NOAA NWS public domain; https://www.weather.gov/disclaimer" },
        { label: "Smithsonian GVP / USGS weekly report (6 hour cache, report week shown)", endpoint: "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml", licence: "US government employee product; https://volcano.si.edu/gvp_termsofuse.cfm" },
        { label: "Helioviewer / NASA SDO AIA 171 (256 px PNG, 30 min cache)", endpoint: "https://api.helioviewer.org/v2/takeScreenshot/", licence: "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams; https://sdo.gsfc.nasa.gov/data/rules.php" },
      ],
    },
    {
      id: "earth-imagery",
      title: `Earth imagery (photoreal earth style, radius ${GLOBE_RADIUS} world units = 6,371 km)`,
      shaders: [
        { name: "vertex (shared with every earth style)", code: VERT },
        { name: "fragment", code: EARTH_IMAGERY_FRAG },
      ],
      provenance: [
        { label: "Day imagery", endpoint: day.url, fetchedAt: src.date, licence: "NASA GIBS / VIIRS SNPP Corrected Reflectance, US government, public domain" },
        { label: "Gap fill (swath holes, polar night)", endpoint: gapFillUrl(SIZE), licence: "NASA GIBS / Blue Marble Next Generation, public domain" },
        { label: "Relief (land hillshade)", endpoint: reliefUrl(SIZE), licence: "NASA GIBS / ASTER GDEM, public domain" },
        { label: "Night lights (city glow)", endpoint: nightLightsUrl(SIZE), licence: "NASA GIBS / VIIRS Black Marble, public domain" },
        { label: "Sea ice (polar no-data fill)", endpoint: ice.url, fetchedAt: ice.detail, licence: "NASA GIBS / GHRSST L4 MUR, public domain" },
      ],
    },
    {
      id: "clouds",
      title: "Cloud shell",
      shaders: [{ name: "fragment", code: CLOUD_FRAG }],
      provenance: [{ label: "Cloud mask, cut from the same day-imagery texture above", endpoint: day.url, fetchedAt: src.date, licence: "NASA GIBS / VIIRS SNPP Corrected Reflectance, public domain" }],
    },
    {
      id: "ocean",
      title: "Ocean (dot-matrix earth style)",
      shaders: [{ name: "fragment", code: OCEAN_FRAG }],
      provenance: [],
    },
    {
      id: "atmosphere",
      title: "Atmosphere: twilight limb + inner haze",
      shaders: [
        { name: "fragment (outer shell, Rayleigh limb reddening)", code: ATMO_FRAG },
        { name: "fragment (inner haze)", code: INNER_HAZE_FRAG },
      ],
      provenance: [
        {
          label: "Rayleigh scattering coefficients (reference constants, no code taken)",
          endpoint: "https://github.com/ebruneton/precomputed_atmospheric_scattering",
          licence: "BSD-3-Clause",
        },
      ],
    },
    {
      id: "hazards",
      title: "Earth events and space weather (live feeds, fetched in the browser)",
      shaders: [],
      provenance: [
        { label: "Earthquakes, last 24 hours", endpoint: QUAKES_URL, licence: "USGS, US government, public domain" },
        { label: "Natural events (fires, storms, volcanoes)", endpoint: EONET_URL, licence: "NASA EONET, US government, public domain" },
        { label: "Disaster alerts", endpoint: GDACS_URL, licence: "GDACS (UN and European Commission), shown with attribution under its terms" },
        { label: "Aurora oval", endpoint: OVATION_URL, licence: "NOAA SWPC OVATION, US government, public domain" },
        { label: "Planetary Kp index", endpoint: KP_URL, licence: "NOAA SWPC, US government, public domain" },
        { label: "Upcoming launches", endpoint: LAUNCHES_URL, licence: "The Space Devs Launch Library 2, free tier (15 requests an hour), with attribution" },
        { label: `Hurricane forecast cones (${NHC_CONE_LAYER_IDS.length} NHC slots, one query each)`, endpoint: nhcConeUrl(NHC_CONE_LAYER_IDS[0]), licence: "NOAA National Hurricane Center, US government, public domain" },
      ],
    },
    {
      id: "deep-zoom-base",
      title: "Deep-zoom base (maximum zoom)",
      shaders: [],
      provenance: [gibsProvenance("s2cloudless", now)],
    },
    {
      id: "street-level",
      title: "Street level (My Maps places' street-level entry point)",
      shaders: [],
      provenance: [
        { label: "Basemap tiles", endpoint: LIBERTY_STYLE_URL, licence: "OpenFreeMap / OpenStreetMap contributors, ODbL" },
        { label: "Street-level photos", endpoint: PANORAMAX_SEARCH_ENDPOINT, licence: "Panoramax, CC BY-SA" },
      ],
    },
    {
      id: "guide-places",
      title: "My Maps places (Local Guide contributions)",
      description: "Exact place pins and names, star ratings, review text and month-level dates from the owner export.",
      shaders: [],
      provenance: [
        {
          label: "Places, reviews, photos",
          endpoint: "local snapshot, no live endpoint (a data build step, not a browser fetch)",
          fetchedAt: mapsExport,
          licence: "Google Maps Takeout, owner export: exact place pins and names, star ratings, review text, month-level dates",
        },
      ],
    },
  ];
}
