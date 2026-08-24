import type { JSX } from "react";

/**
 * SITE DEBRIS — removed for Night Survey (art-direction doc §12 step 3).
 *
 * This used to scatter pallets, cable spools, kerb blocks and barrels across
 * the west build zone (`X_MIN..X_MAX` = roughly x -27..-15) to make the
 * flanks read as a real job site. That whole zone now sits inside the
 * Night Survey corridor's `work` lane (`laneCenterX(0)` = -21, spanning
 * -28..-14 — see heightfield.ts's `LANE_WIDTH`), which is no longer empty
 * ground waiting to be dressed: it carries its own data-driven furniture now
 * (Fixtures.tsx's 26 gantry arches, one per documented work milestone). A
 * random pallet or barrel sitting among them added no information — the
 * doc's own test for keeping a family is "does it carry information in the
 * new design, or is it leftover decoration" — and its tint rotation (accent
 * for spools, signal/probe for barrels) pulled colours that read as
 * belonging to the writing/chess lanes into the middle of the work lane,
 * which is exactly the "scattered stuff" complaint this pass exists to fix.
 *
 * `districtWest.ts`'s own `PROP_FAMILIES` (and its test) are untouched —
 * only the render was decorative; the data stays in case a future pass
 * wants it for something with an actual data mapping.
 */
export function Props(): JSX.Element | null {
  return null;
}
