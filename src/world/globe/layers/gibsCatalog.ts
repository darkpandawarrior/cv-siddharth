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
import { isoDateUTC } from "./gibs.ts";
import type { TileMatrixSetId } from "./tileMatrix.ts";

export type DateRule =
  | { kind: "static" }
  /** GIBS's own published lag before a day's mosaic is complete — verified
   *  per layer against its GetCapabilities `<Dimension>` `Default` value,
   *  not assumed to be a uniform "yesterday" for every product. */
  | { kind: "daily"; lagDays: number };

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
];

export const GIBS_OVERLAYS: GibsCatalogEntry[] = [
  {
    id: "IMERG_Precipitation_Rate",
    title: "Precipitation rate",
    description: "Half-hourly rain and snow rate, merged from satellite and gauge data.",
    format: "png",
    matrixSet: "2km",
    maxLevel: 5,
    dateRule: { kind: "daily", lagDays: 3 },
    legend: {
      unit: "mm/hr",
      stops: [
        { color: "#0b1d51", label: "0" },
        { color: "#2e6f95", label: "2" },
        { color: "#3ddc84", label: "8" },
        { color: "#f0883e", label: "20" },
        { color: "#ff5c5c", label: "50+" },
      ],
    },
    attribution: "NASA GIBS / GPM IMERG",
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
];

export const GIBS_CATALOG: Record<string, GibsCatalogEntry> = Object.fromEntries([...GIBS_BASES, ...GIBS_OVERLAYS].map((e) => [e.id, e]));

/** The calendar date (UTC) a dated layer's tiles should ask for right now —
 *  `undefined` for a static layer, which never takes a Time path segment. */
export function catalogDate(entry: GibsCatalogEntry, now: Date): string | undefined {
  return entry.dateRule.kind === "static" ? undefined : isoDateUTC(now, entry.dateRule.lagDays);
}

/** A short human line for the layer panel / legend: "NASA GIBS, 2026-09-26"
 *  for a dated layer, just the attribution for a static one. */
export function catalogDateLabel(entry: GibsCatalogEntry, now: Date): string {
  const date = catalogDate(entry, now);
  return date ? `${entry.attribution}, ${date}` : entry.attribution;
}

/** The WMTS REST tile URL for one tile. Static layers omit the {Time} path
 *  segment entirely (confirmed in GetCapabilities' own ResourceURL templates
 *  — sending a date there either errors or is ignored depending on the
 *  layer, same rationale gibs.ts's WMS builder already documents). */
export function tileUrl(entry: GibsCatalogEntry, level: number, row: number, col: number, now: Date): string {
  const date = catalogDate(entry, now);
  const timeSegment = date ? `${date}/` : "";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${entry.id}/default/${timeSegment}${entry.matrixSet}/${level}/${row}/${col}.${entry.format}`;
}
