// WAVE 9 LANE S3 (Open-Meteo marine layer for the hover readout). Same "pure
// fetch + parse" split as aurora.ts/quake.ts -- no React, no three, testable
// with a plain fetch mock (useLiveSignal.test.ts's own pattern).
//
// Feed: https://marine-api.open-meteo.com/v1/marine -- Open-Meteo, CC BY
// 4.0, keyless, CORS "*" (curl-confirmed live 2026-09-30 with an Origin
// header, same sibling-subdomain family as the already-wired
// api.open-meteo.com). `current=` returns just the latest reading, so no
// history-array math is needed for a hover chip.
//
// Inland points come back with every `current.*` field `null` (curl-
// confirmed for a Pune coordinate) -- the wave/swell model simply has no sea
// there, not a feed failure, so a null reading means "no marine data here",
// never an error.
export const MARINE_HOST = "https://marine-api.open-meteo.com/v1/marine";

export interface MarineReading {
  waveHeightM: number;
  swellHeightM: number;
  swellPeriodS: number;
}

interface RawMarineCurrent {
  wave_height?: number | null;
  swell_wave_height?: number | null;
  swell_wave_period?: number | null;
}
interface RawMarine {
  current?: RawMarineCurrent;
}

export function marineUrl(lat: number, lon: number): string {
  return `${MARINE_HOST}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=wave_height,swell_wave_height,swell_wave_period`;
}

/** `null` on a landlocked point (the feed's own null-current answer) or any
 *  shape that isn't the real response -- no marine row rather than a wrong
 *  one (house "absent, not faked" rule, same as parseQuakes/parseOvationGrid). */
export function parseMarine(json: unknown): MarineReading | null {
  const c = (json as RawMarine | null)?.current;
  if (!c || typeof c.wave_height !== "number" || typeof c.swell_wave_height !== "number" || typeof c.swell_wave_period !== "number") return null;
  return { waveHeightM: c.wave_height, swellHeightM: c.swell_wave_height, swellPeriodS: c.swell_wave_period };
}

export async function fetchMarine(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<MarineReading | null> {
  const res = await fetchImpl(marineUrl(lat, lon));
  if (!res.ok) return null;
  return parseMarine(await res.json());
}

/** The hover chip's one line -- names the reading, the source names itself
 *  in the chip's own row label (HoverReadout.tsx), not repeated per value. */
export function marineLabel(reading: MarineReading): string {
  return `${reading.waveHeightM.toFixed(1)} m waves, ${reading.swellHeightM.toFixed(1)} m swell @ ${reading.swellPeriodS.toFixed(0)} s`;
}
