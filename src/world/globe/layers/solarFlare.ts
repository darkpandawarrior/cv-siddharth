// LANE S2 (wave 9, space weather): pure parsing for the GOES X-ray flare
// class, the NOAA proton (S-scale) radiation storm level, and the solar-wind
// speed/Bz summary readings. No three, no React — same "pure logic in *.ts,
// glue in the component" split aurora.ts already uses for OVATION/Kp.
//
// Feeds (all `services.swpc.noaa.gov`, already CSP-allowed and already
// fetched directly by aurora.ts's own OVATION/Kp calls — see
// src/world/globe/layers/feedUrls.ts for that established host):
//  https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json
//   (time-ordered array, one row per satellite per energy channel per
//   minute; the long 0.1-0.8nm channel is the one GOES flare class is
//   conventionally read from)
//  https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json
//   (same shape, multiple energy thresholds; the NOAA S-scale is read off
//   the >=10 MeV channel)
//  https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json
//   (single-element array, latest IMF reading: `bt`, `bz_gsm`)
//  https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json
//   (single-element array, latest reading: `proton_speed`)
export const XRAY_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json";
export const PROTON_URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json";
export const SOLAR_WIND_MAG_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json";
export const SOLAR_WIND_SPEED_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json";

// The xray/proton feeds update every minute; a 5 min poll (aurora.ts's own
// OVATION cadence) is a comfortable margin, not a race. The two single-
// reading summary endpoints change on the same cadence, so they share it.
export const SPACE_WEATHER_POLL_MS = 5 * 60_000;

const XRAY_LONG_CHANNEL = "0.1-0.8nm"; // the channel GOES flare class is conventionally read from
const PROTON_CHANNEL = ">=10 MeV"; // the channel the NOAA S-scale is defined against

interface RawXrayRow {
  time_tag?: string;
  flux?: number;
  energy?: string;
}

export interface FlareReading {
  /** e.g. "M1.2", "X5.8", "A0.0" — GOES class letter + one-decimal mantissa. */
  flareClass: string;
  /** Raw long-channel flux, W/m^2 — kept alongside the class for a caller
   *  that wants the number, not just the letter. */
  flux: number;
  timeIso: string;
}

/** GOES flare-class thresholds, W/m^2 long-channel (0.1-0.8nm) flux, in
 *  descending order so the first threshold a flux clears wins. Standard
 *  convention (spaceweather agencies worldwide read the same table): A <
 *  1e-7, B 1e-7..1e-6, C 1e-6..1e-5, M 1e-5..1e-4, X >= 1e-4, with the
 *  mantissa being flux / threshold. */
const FLARE_THRESHOLDS: readonly [string, number][] = [
  ["X", 1e-4],
  ["M", 1e-5],
  ["C", 1e-6],
  ["B", 1e-7],
  ["A", 1e-8],
];

export function classifyFlare(flux: number): string {
  for (const [letter, threshold] of FLARE_THRESHOLDS) {
    if (flux >= threshold) return `${letter}${(flux / threshold).toFixed(1)}`;
  }
  return "A0.0"; // below even A1.0 — reported as the class floor, not a negative/undefined mantissa
}

/** The feed is a plain time-ordered array (oldest first, same convention
 *  aurora.ts's parseLatestKp relies on) mixing satellites and energy
 *  channels in one list — the latest LONG-channel row (by `time_tag`, not
 *  array position, since two satellites can interleave) is the reading a
 *  flare class is read from. `null` on anything that isn't that shape. */
export function parseLatestFlare(json: unknown): FlareReading | null {
  if (!Array.isArray(json)) return null;
  let best: RawXrayRow | null = null;
  for (const row of json as RawXrayRow[]) {
    if (row?.energy !== XRAY_LONG_CHANNEL || typeof row.flux !== "number" || typeof row.time_tag !== "string") continue;
    if (!best || row.time_tag > best.time_tag!) best = row;
  }
  if (!best) return null;
  return { flareClass: classifyFlare(best.flux!), flux: best.flux!, timeIso: best.time_tag! };
}

export interface ProtonReading {
  /** "S0".."S5", the NOAA Radiation Storm scale. */
  scale: string;
  fluxPfu: number;
  timeIso: string;
}

/** NOAA S-scale thresholds, particle flux units (protons/cm^2-s-sr) at
 *  >=10 MeV, descending. Below S1's threshold reads "S0" (no storm). */
const PROTON_THRESHOLDS: readonly [string, number][] = [
  ["S5", 100000],
  ["S4", 10000],
  ["S3", 1000],
  ["S2", 100],
  ["S1", 10],
];

export function protonScale(fluxPfu: number): string {
  for (const [scale, threshold] of PROTON_THRESHOLDS) {
    if (fluxPfu >= threshold) return scale;
  }
  return "S0";
}

/** Same "latest row of the named channel, by time_tag" rule as
 *  parseLatestFlare — this feed carries 8 energy channels per satellite per
 *  minute, and only >=10 MeV is the S-scale's own defined channel. */
export function parseLatestProton(json: unknown): ProtonReading | null {
  if (!Array.isArray(json)) return null;
  let best: RawXrayRow | null = null;
  for (const row of json as RawXrayRow[]) {
    if (row?.energy !== PROTON_CHANNEL || typeof row.flux !== "number" || typeof row.time_tag !== "string") continue;
    if (!best || row.time_tag > best.time_tag!) best = row;
  }
  if (!best) return null;
  return { scale: protonScale(best.flux!), fluxPfu: best.flux!, timeIso: best.time_tag! };
}

interface RawSolarWindSpeedRow {
  proton_speed?: number;
  time_tag?: string;
}

export interface SolarWindSpeedReading {
  speedKmS: number;
  timeIso: string;
}

/** These two summary/*.json endpoints are single-element arrays, not a
 *  time series (sources-live.md: "61 bytes, single latest reading") — the
 *  one element IS the latest reading, no scan needed. `null` on anything
 *  that isn't that shape. */
export function parseSolarWindSpeed(json: unknown): SolarWindSpeedReading | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[0] as RawSolarWindSpeedRow;
  if (typeof row?.proton_speed !== "number" || typeof row.time_tag !== "string") return null;
  return { speedKmS: row.proton_speed, timeIso: row.time_tag };
}

interface RawSolarWindMagRow {
  bt?: number;
  bz_gsm?: number;
  time_tag?: string;
}

export interface SolarWindMagReading {
  bt: number;
  bz: number;
  timeIso: string;
}

export function parseSolarWindMag(json: unknown): SolarWindMagReading | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[0] as RawSolarWindMagRow;
  if (typeof row?.bt !== "number" || typeof row.bz_gsm !== "number" || typeof row.time_tag !== "string") return null;
  return { bt: row.bt, bz: row.bz_gsm, timeIso: row.time_tag };
}

/** The compact readout line SpaceWeather.tsx renders and the feed item's own
 *  `detail` reuses verbatim — one wording, two consumers, same reasoning as
 *  aurora.ts's own kpDetail(). Each part is optional (a partial feed outage
 *  still shows what did load, never a fabricated placeholder for what
 *  didn't). */
export function spaceWeatherDetail(flare: FlareReading | null, proton: ProtonReading | null, wind: SolarWindSpeedReading | null, mag: SolarWindMagReading | null): string {
  const parts: string[] = [];
  if (flare) parts.push(`X-ray ${flare.flareClass}`);
  if (proton) parts.push(`protons ${proton.scale}`);
  if (wind) parts.push(`wind ${Math.round(wind.speedKmS)} km/s`);
  if (mag) parts.push(`Bz ${mag.bz.toFixed(0)} nT`);
  return parts.join(" · ");
}
