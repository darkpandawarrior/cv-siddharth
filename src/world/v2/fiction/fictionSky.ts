/**
 * The Tara Kund observatory's own fictional sky (world-v2-spec.md §5.19;
 * living-ledger-spec.md §5.3's Fence: "the fiction layer renders its own
 * moon-white/deep-ground sky, never the real one"). Pure, zero three/R3F
 * imports, the same discipline `valley.ts` holds itself to, so
 * `TaraKund.tsx` and a future test can read the exact same star layout
 * without a live scene.
 *
 * Imports only `anthology.ts` (the fence's one permitted import,
 * `fictionFence.test.ts`'s rule 1): tiers = `anthology.seasons.length` (one
 * ring per season, never a literal 4, a fifth season needs no change
 * here), stars = `anthology.starmap`'s own points, projected into a small
 * local dome, never `src/lib/sky.ts`'s or `src/lib/stars.ts`'s real Pune
 * sky (FENCE-1's whole point; rule 2).
 */
import { anthology } from "../../../data/anthology.ts";

export interface FictionStar {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
}

/** One tier per recorded season. */
export const TIER_COUNT = anthology.seasons.length;

const DOME_RADIUS = 16;
const DOME_BASE_Y = 6;

/**
 * `starmap.systems[world.s] + world.o`, normalised onto a small dome above
 * the tiers. A world whose own record states its position is "not given or
 * not known" (`o: null`, `StarWorld`'s own doc comment, the same
 * `isUnplaced` convention `Starmap.tsx` already uses) is never drawn: this
 * gorge's sky honours the same "no guessed value" rule world-v2-spec §0's
 * rule 1 states for every other landmark in Sangam.
 */
export function fictionStars(): FictionStar[] {
  const { systems, worlds } = anthology.starmap;
  const stars: FictionStar[] = [];
  for (const w of worlds) {
    if (!Array.isArray(w.o) || w.o.length < 3) continue; // isUnplaced
    const base = systems[w.s] ?? [0, 0, 0];
    const x = base[0] + w.o[0];
    const y = base[1] + w.o[1];
    const z = base[2] + w.o[2];
    const mag = Math.hypot(x, y, z) || 1;
    stars.push({
      id: `${w.s}:${w.n}`,
      x: (x / mag) * DOME_RADIUS,
      y: Math.abs(y / mag) * DOME_RADIUS * 0.6 + DOME_BASE_Y,
      z: (z / mag) * DOME_RADIUS,
      lit: w.st !== "ruin",
    });
  }
  return stars;
}
