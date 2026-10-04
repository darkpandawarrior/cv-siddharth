// WAVE 2 LANE W1 (deep zoom): the curated NASA GIBS layer catalog — bases and
// overlays LayerCatalog.tsx lists and TileLayer.tsx draws. Pure data plus the
// WMTS tile URL builder; no three, no React.
//
// Every entry below was curled once against the real endpoint (2026-09-27/28,
// a fixed in-range tile per its own matrix set) and kept only on a 200 with
// `access-control-allow-origin: *` — see this lane's report for the exact
// curl transcript. Two things that name-matched the brief's own suggested
// list did NOT survive that check and are deliberately absent:
//  - every VIIRS/MODIS "Thermal_Anomalies" (fires) layer on this endpoint is
//    `application/vnd.mapbox-vector-tile` only (confirmed in GetCapabilities)
//    — there is no raster PNG/JPEG fire-hotspot layer to tile here. This
//    engine draws image tiles, not vector features, so a fires OVERLAY isn't
//    offered; the VIIRS false-colour BASE below (BandsM11-I2-I1) is GIBS's
//    own standard composite for spotting active fire glow and burn scars,
//    which is the nearest honest substitute without shipping an MVT parser
//    for one overlay (ponytail: no new rendering path for a single layer;
//    upgrade path is a real vector-tile decoder if more MVT layers turn up).
//  - the reference layers (labels/borders/coastlines) ride "15.625m", not
//    "31.25m" — GetCapabilities names it plainly; "31.25m" is a different,
//    unrelated (mostly Landsat/ASTER/SAR) matrix set on this same endpoint.
import { isoDateUTC, subdailyInstantUTC } from "./gibs.ts";
import type { TileMatrixSetId } from "./tileMatrix.ts";

export type DateRule =
  | { kind: "static" }
  /** GIBS's own published lag before a day's mosaic is complete — verified
   *  per layer against its GetCapabilities `<Dimension>` `Default` value,
   *  not assumed to be a uniform "yesterday" for every product. */
  | { kind: "daily"; lagDays: number }
  /** LANE V1 (wave 7, step A): GOES/Himawari's own PT10M rolling window —
   *  verified today (2026-09-29) against each layer's own GetCapabilities
   *  `<Dimension>` `Default`/`Value`, same per-layer-not-assumed spirit as
   *  `daily` above. `lagMin` is deliberately generous (40min, not the ~20min
   *  the Default value showed today) so a normal publish-latency jitter
   *  never 404s on the very first request — TileLayer.tsx's own step-back
   *  retry exists for the genuine "this frame truly isn't published yet"
   *  case, not as the everyday path. */
  | { kind: "subdaily"; stepMin: number; lagMin: number };

export interface LegendStop {
  color: string;
  label: string;
}

export interface Legend {
  unit: string;
  stops: LegendStop[];
}

export interface GibsCatalogEntry {
  id: string;
  title: string;
  description: string;
  format: "jpg" | "png";
  matrixSet: TileMatrixSetId;
  maxLevel: number;
  dateRule: DateRule;
  legend?: Legend;
  attribution: string;
  /** IMERG has separate rain and snow colour scales, in the same unit. */
  snowLegend?: Legend;
  /** LANE V1 (wave 7, step B): which WMTS endpoint/URL shape `tileUrl` below
   *  builds. `undefined` (every existing entry) means NASA GIBS, unchanged —
   *  this field only exists so `tileUrl` can dispatch without every one of
   *  the ~20 entries above needing to spell out "gibs" by hand. */
  provider?: "eox";
}

export const GIBS_BASES: GibsCatalogEntry[] = [
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    title: "VIIRS true colour",
    description: "Daily true-colour mosaic from Suomi NPP, 250m at the equator.",
    format: "jpg",
    matrixSet: "250m",
    maxLevel: 8,
    dateRule: { kind: "daily", lagDays: 1 },
    attribution: "NASA GIBS / VIIRS SNPP",
  },
  {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    title: "MODIS Terra true colour",
    description: "Daily true-colour mosaic from Terra, a second satellite entirely from VIIRS.",
    format: "jpg",
    matrixSet: "250m",
    maxLevel: 8,
    dateRule: { kind: "daily", lagDays: 1 },
    attribution: "NASA GIBS / MODIS Terra",
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
    title: "VIIRS false colour (fire / burn scars)",
    description: "SWIR-NIR-Red composite: active fire glow reads hot orange, burn scars read dark red-brown.",
    format: "jpg",
    matrixSet: "250m",
    maxLevel: 8,
    dateRule: { kind: "daily", lagDays: 1 },
    attribution: "NASA GIBS / VIIRS SNPP",
  },
  {
    id: "BlueMarble_ShadedRelief_Bathymetry",
    title: "Blue Marble",
    description: "Static cloud-free composite with shaded relief and ocean bathymetry.",
    format: "jpg",
    matrixSet: "500m",
    maxLevel: 7,
    dateRule: { kind: "static" },
    attribution: "NASA GIBS / Blue Marble Next Generation",
  },
  // LANE V1 (wave 7, step B): EOX's deep-zoom Sentinel-2 mosaic — a genuinely
  // different provider/endpoint (see `provider` and `tileUrl` below) and
  // matrix (WGS84, 256px tiles, tileMatrix.ts's own EOX_LEVELS), not a GIBS
  // layer at all.
  //
  // LICENCE CORRECTION (re-verified today, 2026-09-29, against EOX's live
  // WMTSCapabilities.xml — https://tiles.maps.eox.at/wmts/1.0.0/
  // WMTSCapabilities.xml): the brief's premise that "s2cloudless-2020" is
  // CC BY 4.0 is WRONG. Every year-suffixed layer (2017 through 2025,
  // INCLUDING 2020) carries "Creative Commons Attribution-NonCommercial-
  // ShareAlike 4.0" in its own <ows:Abstract> today — CC BY-NC-SA, which this
  // repo's own licence gate forbids ("no CC-BY-NC data", globe-lanes.md).
  // Only the un-suffixed "s2cloudless" layer (2016 Sentinel-2 data) is
  // actually "Creative Commons Attribution 4.0 International License" (plain
  // CC BY, no NC, no SA) — confirmed the same way. That is the layer below;
  // "2020" never shipped. If a future EOX capabilities document ever
  // relicenses a year-suffixed layer as plain CC BY, upgrading this entry to
  // it is a one-line id/attribution/description change, not a redesign.
  {
    id: "s2cloudless",
    title: "2016 cloud-free mosaic",
    description:
      "Sentinel-2 cloudless composite (EOX IT Services, 2016 imagery, CC BY 4.0) as the deep-zoom base: about 10m per pixel at maximum zoom, versus 250m for the daily mosaics above. A fixed year, not today's imagery.",
    format: "jpg",
    matrixSet: "WGS84",
    maxLevel: 17,
    dateRule: { kind: "static" },
    attribution: "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0",
    provider: "eox",
  },
];

export const GIBS_OVERLAYS: GibsCatalogEntry[] = [
  {
    id: "IMERG_Precipitation_Rate",
    title: "Precipitation rate",
    description: "Daily satellite precipitation from GPM IMERG, not live radar. Rain and snow have separate colour scales; transparent pixels mean no data or less than 0.1 mm/hr.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    // Verified 2026-09-30: Default 2026-09-29, latest period P1D.
    // The source observations are half-hourly; THIS GIBS feed is daily.
    dateRule: { kind: "daily", lagDays: 1 },
    legend: {
      unit: "mm/hr",
      stops: [
        { color: "#00764e", label: "0.1" },
        { color: "#009424", label: "0.2" },
        { color: "#45c000", label: "0.5" },
        { color: "#c3e400", label: "1.0" },
        { color: "#ffb006", label: "2.0" },
        { color: "#ff4730", label: "5.0" },
        { color: "#e70000", label: "10.0" },
        { color: "#9c0000", label: "20.0" },
        { color: "#330000", label: "≥ 53.0" },
      ],
    },
    snowLegend: {
      unit: "mm/hr",
      stops: [
        { color: "#b1faee", label: "0.1" },
        { color: "#8febf1", label: "0.2" },
        { color: "#66abdc", label: "0.5" },
        { color: "#4f73c4", label: "1.0" },
        { color: "#4048d2", label: "2.0" },
        { color: "#5f2fe4", label: "5.0" },
        { color: "#770bd1", label: "10.0" },
        { color: "#770792", label: "20.0" },
        { color: "#3a0330", label: "≥ 53.0" },
      ],
    },
    attribution: "NASA GIBS / GPM IMERG",
  },
  {
    id: "OMPS_Ozone_Total_Column",
    title: "Total-column ozone",
    description: "Daily total-column ozone from Suomi NPP OMPS, in Dobson units. Swath gaps are transparent, not zero ozone.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    // Verified 2026-09-30: Default 2026-09-30, latest period P1D.
    dateRule: { kind: "daily", lagDays: 0 },
    legend: {
      unit: "DU",
      stops: [
        { color: "#5e4fa2", label: "< 100.0" },
        { color: "#5db8a9", label: "150.0" },
        { color: "#93d3a4", label: "200.0" },
        { color: "#c8e99e", label: "250.0" },
        { color: "#eeee93", label: "300.0" },
        { color: "#fdd783", label: "350.0" },
        { color: "#fdae61", label: "400.0" },
        { color: "#f57748", label: "450.0" },
        { color: "#9e0142", label: "≥ 500.0" },
      ],
    },
    attribution: "NASA GIBS / OMPS Suomi NPP",
  },
  {
    id: "GHRSST_L4_MUR_Sea_Surface_Temperature",
    title: "Sea surface temperature",
    description: "Daily analysis blending satellite and in-situ ocean temperature readings.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "daily", lagDays: 3 },
    legend: {
      unit: "°C",
      stops: [
        { color: "#0b1d51", label: "-2" },
        { color: "#5ee6ff", label: "10" },
        { color: "#3ddc84", label: "20" },
        { color: "#f0883e", label: "28" },
        { color: "#ff5c5c", label: "32+" },
      ],
    },
    attribution: "NASA GIBS / GHRSST MUR L4",
  },
  {
    id: "MODIS_Combined_Value_Added_AOD",
    title: "Aerosol optical depth",
    description: "Smoke, dust and haze density combined from Terra and Aqua.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "daily", lagDays: 2 },
    legend: {
      unit: "AOD 550nm",
      stops: [
        { color: "#3ddc84", label: "0" },
        { color: "#f0883e", label: "0.5" },
        { color: "#ff5c5c", label: "1.0+" },
      ],
    },
    attribution: "NASA GIBS / MODIS Combined MAIAC",
  },
  {
    id: "MODIS_Terra_NDSI_Snow_Cover",
    title: "Snow cover",
    description: "Normalised-difference snow index from Terra, daily.",
    format: "png",
    matrixSet: "500m",
    maxLevel: 7,
    dateRule: { kind: "daily", lagDays: 1 },
    legend: {
      unit: "NDSI",
      stops: [
        { color: "#2e6f95", label: "low" },
        { color: "#c9d4d0", label: "mid" },
        { color: "#ffffff", label: "high" },
      ],
    },
    attribution: "NASA GIBS / MODIS Terra",
  },
  {
    id: "MODIS_Terra_Cloud_Top_Temp_Day",
    title: "Cloud-top temperature",
    description: "Infrared cloud-top temperature by day, a proxy for storm height and intensity.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "daily", lagDays: 1 },
    legend: {
      unit: "K",
      stops: [
        { color: "#ff5c5c", label: "300" },
        { color: "#f0883e", label: "260" },
        { color: "#5ee6ff", label: "220" },
        { color: "#db61ff", label: "190" },
      ],
    },
    attribution: "NASA GIBS / MODIS Terra",
  },
  {
    id: "Reference_Labels_15m",
    title: "Place labels",
    description: "Country, city and feature names.",
    format: "png",
    matrixSet: "15.625m",
    maxLevel: 12,
    dateRule: { kind: "static" },
    attribution: "NASA GIBS reference layer",
  },
  {
    id: "Reference_Features_15m",
    title: "Political borders",
    description: "Country and administrative boundary lines.",
    format: "png",
    matrixSet: "15.625m",
    maxLevel: 12,
    dateRule: { kind: "static" },
    attribution: "NASA GIBS reference layer",
  },
  {
    id: "Coastlines_15m",
    title: "Coastlines",
    description: "Land/ocean boundary line work, independent of any day's imagery.",
    format: "png",
    matrixSet: "15.625m",
    maxLevel: 12,
    dateRule: { kind: "static" },
    attribution: "NASA GIBS reference layer",
  },
  // LANE V1 (wave 7, step A): near-live geostationary imagery, PT10M rolling
  // window, verified today (2026-09-29, curl: 200, image/png,
  // access-control-allow-origin: *, tiles 110-460KB, the Default value
  // advanced 10 minutes during the check). COVERAGE CAVEAT (every entry's own
  // description repeats it, per the brief — a visitor toggling on just one of
  // these needs the caveat without having read the others): GIBS has no
  // Meteosat, so Europe, Africa and India are not covered by ANY of the seven
  // below, and Pune sits near Himawari's own western edge.
  {
    id: "GOES-East_ABI_Band13_Clean_Infrared",
    title: "GOES-East infrared",
    description:
      "Near-live clean infrared (cloud-top temperature) over the Americas and the Atlantic, updated every 10 minutes. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-East ABI Band13 Clean Infrared",
  },
  {
    id: "GOES-West_ABI_Band13_Clean_Infrared",
    title: "GOES-West infrared",
    description:
      "Near-live clean infrared over the Pacific and the western Americas, updated every 10 minutes. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-West ABI Band13 Clean Infrared",
  },
  {
    id: "Himawari_AHI_Band13_Clean_Infrared",
    title: "Himawari infrared",
    description:
      "Near-live clean infrared over East Asia and Australia, updated every 10 minutes. No Meteosat on this endpoint: Europe, Africa and India are not covered, and Pune sits near this satellite's own western edge.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / Himawari AHI Band13 Clean Infrared",
  },
  {
    id: "GOES-East_ABI_GeoColor",
    title: "GOES-East true colour",
    description:
      "Near-live true-colour (day) / infrared (night) composite over the Americas and the Atlantic, updated every 10 minutes. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-East ABI GeoColor",
  },
  {
    id: "GOES-West_ABI_GeoColor",
    title: "GOES-West true colour",
    description:
      "Near-live true-colour (day) / infrared (night) composite over the Pacific and the western Americas, updated every 10 minutes. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-West ABI GeoColor",
  },
  {
    id: "GOES-East_ABI_FireTemp",
    title: "GOES-East fire temperature",
    description:
      "Near-live fire/hotspot detection over the Americas, updated every 10 minutes — the keyless substitute for FIRMS (which needs an API key this site doesn't hold). No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-East ABI FireTemp",
  },
  {
    id: "GOES-West_ABI_FireTemp",
    title: "GOES-West fire temperature",
    description:
      "Near-live fire/hotspot detection over the Pacific and the western Americas, updated every 10 minutes — the keyless substitute for FIRMS. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    attribution: "NASA GIBS / GOES-West ABI FireTemp",
  },
  // LANE S1 (wave 9): six new GIBS overlays from the earth-observation source
  // sweep (audit-2026-09-30/sources-eo.md) — re-curled live today (2026-09-29
  // UTC, matching sources-eo.md's own method) rather than trusted from the
  // audit alone; every lagDays value below is the REAL gap between today's
  // GetCapabilities Default and today's date for that product, not copied
  // blind from the audit's slightly earlier check. Legend stops reuse this
  // catalog's own established palette (the same hex values AOD/cloud-
  // top-temp already use above) rather than inventing a new one per layer.
  {
    id: "MODIS_Aqua_L2_Chlorophyll_A",
    title: "Ocean chlorophyll",
    description:
      "Near-real-time chlorophyll-a concentration from Aqua: algal blooms and coastal upwelling read green and yellow against dark open ocean, GIBS's lowest-latency ocean product.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "daily", lagDays: 1 },
    legend: {
      unit: "mg/m³",
      stops: [
        { color: "#0b1d51", label: "0.01" },
        { color: "#2e6f95", label: "0.3" },
        { color: "#3ddc84", label: "1" },
        { color: "#f0883e", label: "5" },
        { color: "#ff5c5c", label: "20+" },
      ],
    },
    attribution: "NASA GIBS / MODIS Aqua",
  },
  {
    id: "MODIS_Terra_L3_Land_Surface_Temp_Daily_Day",
    title: "Land surface temperature (day)",
    description: "Daytime land-surface temperature from Terra: hot deserts and cities glow orange-red, a heat story the ocean-only sea surface temperature overlay above can't tell.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "daily", lagDays: 2 },
    legend: {
      unit: "°C",
      stops: [
        { color: "#5ee6ff", label: "-10" },
        { color: "#3ddc84", label: "10" },
        { color: "#f0883e", label: "30" },
        { color: "#ff5c5c", label: "50+" },
      ],
    },
    attribution: "NASA GIBS / MODIS Terra",
  },
  {
    id: "MODIS_Terra_L3_NDVI_16Day",
    title: "Vegetation index",
    description:
      "16-day composite vegetation greenness from Terra, 250m — the finest resolution overlay here. Forest bands read deep green, deserts read pale; a genuine measured index, not photographic green. Published with a real compositing lag, not today's imagery.",
    format: "png",
    matrixSet: "250m",
    maxLevel: 8,
    dateRule: { kind: "daily", lagDays: 31 },
    legend: {
      unit: "NDVI",
      stops: [
        { color: "#c9d4d0", label: "-0.1" },
        { color: "#f0883e", label: "0.2" },
        { color: "#3ddc84", label: "0.9" },
      ],
    },
    attribution: "NASA GIBS / MODIS Terra",
  },
  {
    id: "GPW_Population_Density_2020",
    title: "Population density",
    description: "Gridded Population of the World v4, a fixed 2020 census-modelled year, not today's imagery — a demographic layer independent of night-lights brightness or built-up-area extent.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "static" },
    legend: {
      unit: "people/km²",
      stops: [
        { color: "#0b1d51", label: "0" },
        { color: "#2e6f95", label: "100" },
        { color: "#f0883e", label: "1000" },
        { color: "#ff5c5c", label: "10000+" },
      ],
    },
    attribution: "NASA GIBS / CIESIN GPW v4 (2020)",
  },
  {
    id: "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    title: "Soil moisture",
    description: "Daily gap-filled (model-analyzed) surface soil moisture from SMAP: pairs with the precipitation overlay above for a drought/monsoon story, no swath holes to explain.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "daily", lagDays: 3 },
    legend: {
      unit: "m³/m³",
      stops: [
        { color: "#f0883e", label: "0.05" },
        { color: "#2e6f95", label: "0.2" },
        { color: "#5ee6ff", label: "0.4+" },
      ],
    },
    attribution: "NASA GIBS / SMAP L4",
  },
  {
    id: "GOES-East_ABI_Dust",
    title: "GOES-East dust / smoke",
    description:
      "Near-live IR-derived dust and smoke detection over the Americas and the Atlantic, updated every 10 minutes, day and night unlike the true-colour GeoColor layer above. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    legend: {
      unit: "dust signal",
      stops: [
        { color: "#0b1d51", label: "none" },
        { color: "#f0883e", label: "light" },
        { color: "#db61ff", label: "heavy" },
      ],
    },
    attribution: "NASA GIBS / GOES-East ABI Dust",
  },
  {
    id: "GOES-West_ABI_Dust",
    title: "GOES-West dust / smoke",
    description:
      "Near-live IR-derived dust and smoke detection over the Pacific and the western Americas, updated every 10 minutes, day and night. No Meteosat on this endpoint: Europe, Africa and India are not covered.",
    format: "png",
    matrixSet: "1km",
    maxLevel: 6,
    dateRule: { kind: "subdaily", stepMin: 10, lagMin: 40 },
    legend: {
      unit: "dust signal",
      stops: [
        { color: "#0b1d51", label: "none" },
        { color: "#f0883e", label: "light" },
        { color: "#db61ff", label: "heavy" },
      ],
    },
    attribution: "NASA GIBS / GOES-West ABI Dust",
  },
];

export const GIBS_CATALOG: Record<string, GibsCatalogEntry> = Object.fromEntries([...GIBS_BASES, ...GIBS_OVERLAYS].map((e) => [e.id, e]));

/** The calendar date (UTC) a dated layer's tiles should ask for right now, OR
 *  (for a `subdaily` layer) the full rounded-down ISO instant — `undefined`
 *  for a static layer, which never takes a Time path segment. */
export function catalogDate(entry: GibsCatalogEntry, now: Date): string | undefined {
  if (entry.dateRule.kind === "static") return undefined;
  if (entry.dateRule.kind === "daily") return isoDateUTC(now, entry.dateRule.lagDays);
  return subdailyInstantUTC(now, entry.dateRule.stepMin, entry.dateRule.lagMin);
}

/** A short human line for the layer panel / legend: "NASA GIBS, 2026-09-26"
 *  for a daily layer, "NASA GIBS, 00:20 UTC" for a subdaily one (the frame's
 *  own UTC time, not the full instant — this line sits in a narrow panel
 *  column), just the attribution for a static one. */
export function catalogDateLabel(entry: GibsCatalogEntry, now: Date): string {
  const date = catalogDate(entry, now);
  if (!date) return entry.attribution;
  if (entry.dateRule.kind === "subdaily") return `${entry.attribution}, ${date.slice(11, 16)} UTC`;
  return `${entry.attribution}, ${date}`;
}

/** The WMTS REST tile URL for one tile. Static GIBS layers omit the {Time}
 *  path segment entirely (confirmed in GetCapabilities' own ResourceURL
 *  templates — sending a date there either errors or is ignored depending on
 *  the layer, same rationale gibs.ts's WMS builder already documents).
 *  `provider: "eox"` entries (LANE V1, wave 7 step B) are a different
 *  endpoint entirely, with their own path shape and no Time segment at all
 *  (s2cloudless is a fixed-year mosaic, verified against EOX's own
 *  WMTSCapabilities.xml today). */
export function tileUrl(entry: GibsCatalogEntry, level: number, row: number, col: number, now: Date): string {
  if (entry.provider === "eox") {
    return `https://tiles.maps.eox.at/wmts/1.0.0/${entry.id}/default/${entry.matrixSet}/${level}/${row}/${col}.${entry.format}`;
  }
  const date = catalogDate(entry, now);
  const timeSegment = date ? `${date}/` : "";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${entry.id}/default/${timeSegment}${entry.matrixSet}/${level}/${row}/${col}.${entry.format}`;
}
