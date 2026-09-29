// LANE L1 (real earth): NASA GIBS WMS URL building and the imagery-date
// fallback chain. Pure — no three, no React, no fetch — so the date math and
// URL shape are unit-testable without a browser or a network call.
//
// Verified working today (2026-09-27, curl, 200 + `image/jpeg` +
// `access-control-allow-origin: *` on every layer below):
//   VIIRS_SNPP_CorrectedReflectance_TrueColor  (day, dated, has swath gaps)
//   MODIS_Terra_CorrectedReflectance_TrueColor (day fallback, dated)
//   BlueMarble_ShadedRelief_Bathymetry         (static, no TIME — gap fill)
//   VIIRS_Black_Marble                         (static, no TIME — city lights)
//   GHRSST_L4_MUR_Sea_Ice_Concentration        (dated, gap-free PNG — polar fill)

export const GIBS_WMS_ENDPOINT = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export const VIIRS_TRUE_COLOR = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
export const MODIS_TERRA_TRUE_COLOR = "MODIS_Terra_CorrectedReflectance_TrueColor";
export const BLUE_MARBLE_BASE = "BlueMarble_ShadedRelief_Bathymetry";
export const BLACK_MARBLE_NIGHT = "VIIRS_Black_Marble";
// A Level-4 analysis: gap-free by construction (passive microwave sees
// through polar night), unlike VIIRS reflectance, which has no data wherever
// the sun is low. It lags a day or two, hence the older dates below.
export const MUR_SEA_ICE = "GHRSST_L4_MUR_Sea_Ice_Concentration";
// Static greyscale hillshade from ASTER GDEM (verified 200, CORS *, ~32 KB at
// 1024 px). Flat land reads 0.564 (measured over the Deccan plateau), so
// the shader treats that as neutral and only lights or shades slopes.
export const ASTER_RELIEF = "ASTER_GDEM_Greyscale_Shaded_Relief";
export const RELIEF_NEUTRAL = 0.564;

export interface GibsSize {
  width: number;
  height: number;
}

/** `now` minus `daysAgo` whole days, as the UTC calendar date GIBS's TIME
 *  param wants (YYYY-MM-DD). Whole-day subtraction on the epoch millisecond,
 *  never local-timezone field math, so a Pune (UTC+5:30) "now" near midnight
 *  UTC still lands on the correct UTC day. */
export function isoDateUTC(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** LANE V1 (wave 7, step A): the rounded-down WMTS Time instant for a
 *  subdaily (PT10M) GIBS layer — `now` minus `lagMin` (GIBS's own publish
 *  lag, verified per layer against its GetCapabilities Dimension Default
 *  today), floored to the nearest `stepMin` boundary. Floors on the epoch
 *  millisecond (never local-timezone field math, same reasoning as
 *  `isoDateUTC` above), so the result is always exactly on a `stepMin`
 *  boundary regardless of what second `now` itself falls on. No milliseconds
 *  in the output — GIBS's own Time dimension values never carry them. */
export function subdailyInstantUTC(now: Date, stepMin: number, lagMin: number): string {
  const stepMs = stepMin * 60_000;
  const laggedMs = now.getTime() - lagMin * 60_000;
  const roundedMs = Math.floor(laggedMs / stepMs) * stepMs;
  return new Date(roundedMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** A GIBS WMS GetMap URL. `time` omitted entirely for the two static layers
 *  (BlueMarble, Black Marble) — sending a TIME on those either errors or is
 *  silently ignored depending on the layer, so simplest is to never send one. */
export function gibsGetMapUrl(layer: string, size: GibsSize, time?: string, transparentPng = false): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(size.width),
    HEIGHT: String(size.height),
    FORMAT: transparentPng ? "image/png" : "image/jpeg",
  });
  if (transparentPng) params.set("TRANSPARENT", "true");
  if (time) params.set("TIME", time);
  return `${GIBS_WMS_ENDPOINT}?${params.toString()}`;
}

export interface ImageryAttempt {
  url: string;
  /** Human line for the status card / attribution — "source, date". */
  detail: string;
}

/** The day-imagery fallback chain for `now` (living-earth spec item 1):
 *  yesterday UTC's VIIRS true colour first (today's swath is incomplete),
 *  then the day before, then MODIS Terra as a different satellite entirely
 *  in case VIIRS itself is the thing that's down. In order; the caller tries
 *  each until one loads. */
export function dayImageryAttempts(now: Date, size: GibsSize): ImageryAttempt[] {
  const yesterday = isoDateUTC(now, 1);
  const dayBefore = isoDateUTC(now, 2);
  return [
    { url: gibsGetMapUrl(VIIRS_TRUE_COLOR, size, yesterday), detail: `NASA GIBS VIIRS true colour, ${yesterday}` },
    { url: gibsGetMapUrl(VIIRS_TRUE_COLOR, size, dayBefore), detail: `NASA GIBS VIIRS true colour, ${dayBefore}` },
    { url: gibsGetMapUrl(MODIS_TERRA_TRUE_COLOR, size, yesterday), detail: `NASA GIBS MODIS Terra true colour, ${yesterday}` },
  ];
}

/** Static Blue Marble base: gap fill for the daily mosaic's swath holes and
 *  polar night, and (via its own land/ocean colour) the sun-glint mask. */
export function gapFillUrl(size: GibsSize): string {
  return gibsGetMapUrl(BLUE_MARBLE_BASE, size);
}

/** Static ASTER GDEM hillshade: relief shading on land. */
export function reliefUrl(size: GibsSize): string {
  return gibsGetMapUrl(ASTER_RELIEF, size);
}

/** Static VIIRS Black Marble: night-side city lights. */
export function nightLightsUrl(size: GibsSize): string {
  return gibsGetMapUrl(BLACK_MARBLE_NIGHT, size);
}

/** Real sea ice for the polar no-data cap: the MUR L4 concentration map as
 *  a transparent PNG (alpha 0 off the ice), two then three days back. The
 *  shader draws ice only where VIIRS itself has no data. */
export function seaIceAttempts(now: Date, size: GibsSize): ImageryAttempt[] {
  return [2, 3].map((daysAgo) => {
    const date = isoDateUTC(now, daysAgo);
    return { url: gibsGetMapUrl(MUR_SEA_ICE, size, date, true), detail: `GHRSST MUR sea ice, ${date}` };
  });
}

export interface ImagerySource {
  date: string;
  source: string;
}

/** The shape of `navigator.connection` (Network Information API) this
 *  decision reads — a structural subset, not the real (Chromium-only, `lib
 *  dom` doesn't ship it) `NetworkInformation` type, so a plain object test
 *  stub type-checks with no DOM lib gymnastics. */
export interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Should EarthImagery.tsx's T1 progressive upgrade (swapping the 2048 day
 * texture for a ~2+ MB 4096x2048 one, once idle) actually fire? Audit fix,
 * 2026-09-28: it used to run unconditionally on every T1 session, spending
 * the extra download on Data Saver and slow connections that asked NOT to
 * pay for it.
 *
 * `tier !== 1` is always false: the caller already gates this to T1 only
 * (T2/T3 never reach the idle() callback at all), but the check is repeated
 * here so the decision is total and correct on its own, not only correct at
 * its one real call site.
 *
 * `connection` is `navigator.connection`, `undefined` when the Network
 * Information API doesn't exist at all (desktop Safari, Firefox, as of this
 * writing) — there is no signal to act on there, so behaviour is unchanged:
 * the upgrade proceeds exactly as it always did. Skipped when `saveData` is
 * true, or when `effectiveType` is present and isn't `"4g"` (`effectiveType`
 * itself can be absent even when the rest of the API exists, per the spec —
 * treated the same as "no opinion", not as "slow").
 */
export function shouldUpgradeHiDay(tier: 1 | 2 | 3, connection: ConnectionLike | undefined): boolean {
  if (tier !== 1) return false;
  if (!connection) return true;
  if (connection.saveData) return false;
  if (connection.effectiveType !== undefined && connection.effectiveType !== "4g") return false;
  return true;
}

/** What the day side IS showing for `now`, for integration's attribution
 *  line — the intended best-case source, not necessarily which fallback rung
 *  a failed fetch actually landed on (that live detail is
 *  `useGlobe.getState().status.earth?.detail`, set from the same strings as
 *  `dayImageryAttempts` above). */
export function describeImagerySource(now: Date): ImagerySource {
  return { date: isoDateUTC(now, 1), source: "NASA GIBS VIIRS SNPP Corrected Reflectance (True Color)" };
}
