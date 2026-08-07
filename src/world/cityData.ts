import { CITY, dateZ, yearZ, type Flank } from "./city.ts";

/**
 * The city's own small pieces of derived layout: the year bands the ground
 * is painted in, where the Kotlin/Compose era ramp starts, and where the
 * eight rooms sit. None of this is per-district data (that's districtWest.ts
 * / corpusData.ts) — it's the handful of city-wide facts Terrain.tsx and
 * worldData.ts both need and neither should own alone.
 */

/** One entry per year, 2017..2026 — the ground's own calendar, and what
 *  Terrain.tsx's era-colour plates and year ticks both iterate over. */
export const YEAR_BANDS: { year: number; z: number }[] = Array.from(
  { length: CITY.lastYear - CITY.firstYear + 1 },
  (_, i) => {
    const year = CITY.firstYear + i;
    return { year, z: yearZ(year) };
  },
);

/**
 * Where the ground's era colour starts ramping toward "now".
 *
 * There is no per-year Kotlin/Compose series anywhere in src/data/ — only one
 * endpoint (profile.metrics' ~87% Compose) and a single dated baseline: Dice
 * is the app he joined with zero Kotlin in it, in June 2023. So the ramp has
 * exactly one honest span to run across — Dice's own tenure — and nothing
 * north of it. Falls back to a literal only if profile.ts's period string
 * ever stops parsing; the fallback reproduces the same z by construction, it
 * just can't be asserted against the string if that string changes shape.
 */
const DICE_START_Z = dateZ("June 2023") ?? yearZ(2023 + 5 / 12);

/**
 * 0 north of Dice's start (grey — no data says the early years were
 * anything else), ramping linearly to 1 at the slab's southern edge. This is
 * a fraction, not a colour: Terrain.tsx does the actual `mix(card, signal,
 * t)`, because palette tokens are a render-time concern and this file stays
 * three.js-free.
 */
export function eraColorT(z: number): number {
  if (z <= DICE_START_Z) return 0;
  return Math.min(1, (z - DICE_START_Z) / (CITY.z1 - DICE_START_Z));
}

export type RoomShape = "slab" | "crt" | "board" | "pcb";

/**
 * The eight rooms — undated infrastructure, not sited by any facet's date.
 * See the design doc's finding #2: putting a Compose playground or a chess
 * engine lab on the time axis by either `authored` or `discovered` clusters
 * 4-6 of the 8 into 2026, which is both unusable and dishonest. Instead they
 * sit evenly down the boulevard's full length (20m apart in z, alternating
 * flank per the design table) so every era of the city has a door in it.
 *
 * `z` values and flanks are the design doc's own table verbatim — this is
 * data, not a formula, because the room order was chosen for a reason
 * (`/map` first as the overview, `/chess` and `/weeb` sited near the corpus
 * districts they explain) that a generated spacing would lose.
 */
export const ROOM_PLACEMENTS: { to: string; z: number; side: Flank; shape: RoomShape }[] = [
  { to: "/map", z: -70, side: "west", shape: "pcb" },
  { to: "/blueprint", z: -50, side: "east", shape: "board" },
  { to: "/forge", z: -30, side: "west", shape: "pcb" },
  { to: "/compose", z: -10, side: "east", shape: "slab" },
  { to: "/lab", z: 10, side: "west", shape: "crt" },
  { to: "/chess", z: 30, side: "east", shape: "board" },
  { to: "/weeb", z: 50, side: "east", shape: "crt" },
  { to: "/terminal", z: 70, side: "west", shape: "crt" },
];
