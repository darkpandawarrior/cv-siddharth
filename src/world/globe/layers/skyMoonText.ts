// Phase-name wording for the Moon's inspector card and this layer's health
// detail. src/lib/skyText.ts already carries the identical 8-name table
// inside its own (private, unexported) `phaseName` - not reusable from
// outside that file, and this lane owns none of src/lib/, so it is
// duplicated here rather than by editing a file outside this lane's brief.
// See this lane's report, "Needs from integration": exporting skyText.ts's
// `phaseName` would let a future pass delete this copy.
import type { MoonPhase } from "../../../lib/moon.ts";

const PHASE_NAMES: readonly [number, string][] = [
  [22.5, "new"],
  [67.5, "waxing crescent"],
  [112.5, "first quarter"],
  [157.5, "waxing gibbous"],
  [202.5, "full"],
  [247.5, "waning gibbous"],
  [292.5, "last quarter"],
  [337.5, "waning crescent"],
];

export function moonPhaseName(phaseAngleDeg: number): string {
  return PHASE_NAMES.find(([upTo]) => phaseAngleDeg < upTo)?.[1] ?? "new";
}

/** "waxing gibbous 94%" - the phrase this lane's inspector row and health
 *  detail both use. */
export function moonPhaseLabel(p: MoonPhase): string {
  return `${moonPhaseName(p.phaseAngleDeg)} ${Math.round(p.fraction * 100)}%`;
}
