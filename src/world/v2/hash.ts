/**
 * Deterministic noise, extracted verbatim from four duplicated copies
 * (districtWest.ts, resolve.ts, gps.ts, corpusData.ts — living-ledger-spec
 * §3.2). All four re-export from here now, so this is the one place either
 * function is defined; every call site's output is unchanged.
 *
 * Never Math.random: a scattered dust cloud, a GPS jitter trail or a growth
 * placement has to reproduce identically across renders, hot reloads and a
 * data refresh, or it reads as static instead of as a stable place.
 */

/** Value noise from a numeric seed, in [-1, 1). Seed with a record's own
 *  key (via `stringSeed`) or a fixed per-instance offset — never a bare
 *  array-position counter from a map or forEach callback, which would make
 *  every reordering of the source data reshuffle the noise (purity.test.ts's
 *  index-seeded guard). */
export function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Deterministic string -> integer seed, extracted verbatim from
 *  districtWest.ts and corpusData.ts's duplicated `sampleBoxSurface`
 *  seeding loop. Feed it a slug, id or key — a stable identity that
 *  survives the record moving elsewhere in its array — never an index. */
export function stringSeed(id: string): number {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 100000;
  return seed;
}
