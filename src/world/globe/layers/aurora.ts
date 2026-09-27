// LANE L7 (live earth events). Pure OVATION aurora-probability-grid parsing
// plus the lon/lat <-> texel indexing auroraOval.tsx builds a DataTexture
// from, and the planetary Kp parser for the health-detail row. No three, no
// React — the DataTexture object itself is glue, built in the component.
//
// Feeds:
//  https://services.swpc.noaa.gov/json/ovation_aurora_latest.json (nowcast,
//  updates roughly every 5 min — the same cadence this lane polls quakes at)
//  https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
export const AURORA_POLL_MS = 5 * 60_000;
export const KP_POLL_MS = 15 * 60_000; // Kp is a 3-hour index; 15 min is a comfortable margin, not a race

export const AURORA_GRID_WIDTH = 360; // one texel per integer degree of longitude, 0..359
export const AURORA_GRID_HEIGHT = 181; // one texel per integer degree of latitude, -90..90 inclusive

export interface AuroraGrid {
  width: number;
  height: number;
  /** Row-major, y=0 at lat -90, y=height-1 at lat +90; one byte per texel,
   *  0-255 scaled from OVATION's 0-100 probability. Cells the feed didn't
   *  report (this lane's fixture is deliberately sparse — see its own
   *  comment) default to 0, same as "feed says nothing here" would mean. */
  data: Uint8Array;
}

interface RawOvation {
  coordinates?: unknown;
}

/** Texel index for a (lon, lat) pair in degrees — longitude wraps (so -10
 *  and 350 land on the same texel), latitude clamps (so a caller passing
 *  90.4 from float error doesn't walk off the array). Exported so the
 *  fragment shader's own lon/lat -> uv math (auroraOval.tsx) can be checked
 *  against the exact same rule this parser used to fill the grid. */
export function auroraGridIndex(lonDeg: number, latDeg: number): number {
  const x = ((Math.round(lonDeg) % AURORA_GRID_WIDTH) + AURORA_GRID_WIDTH) % AURORA_GRID_WIDTH;
  const y = Math.max(0, Math.min(AURORA_GRID_HEIGHT - 1, Math.round(latDeg) + 90));
  return y * AURORA_GRID_WIDTH + x;
}

/** `null` on a feed that isn't the real shape — no texture is built, the
 *  layer draws no aurora rather than a wrong one. */
export function parseOvationGrid(json: unknown): AuroraGrid | null {
  const raw = json as RawOvation | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.coordinates)) return null;
  const data = new Uint8Array(AURORA_GRID_WIDTH * AURORA_GRID_HEIGHT);
  for (const c of raw.coordinates) {
    if (!Array.isArray(c) || c.length < 3) continue;
    const [lon, lat, prob] = c as [number, number, number];
    if (typeof lon !== "number" || typeof lat !== "number" || typeof prob !== "number") continue;
    data[auroraGridIndex(lon, lat)] = Math.round(Math.max(0, Math.min(100, prob)) * 2.55);
  }
  return { width: AURORA_GRID_WIDTH, height: AURORA_GRID_HEIGHT, data };
}

interface RawKpRow {
  time_tag?: string;
  Kp?: number;
}

export interface KpReading {
  kp: number;
  timeIso: string;
}

/** The feed's own last row is the latest reading (it's a plain time-ordered
 *  array, oldest first — same shape NOAA has shipped this endpoint in for
 *  years). `null` on anything that isn't that shape or is empty. */
export function parseLatestKp(json: unknown): KpReading | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const last = json[json.length - 1] as RawKpRow;
  if (typeof last?.Kp !== "number" || typeof last?.time_tag !== "string") return null;
  return { kp: last.Kp, timeIso: last.time_tag };
}

/** The health-detail row's exact wording (task 6: "Kp 3.33, aurora oval live"). */
export function kpDetail(reading: KpReading): string {
  return `Kp ${reading.kp.toFixed(2)}, aurora oval live`;
}
