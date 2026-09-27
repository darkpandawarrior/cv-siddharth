/**
 * Screen-space nearest pick (open-data-spec.md §3 A1 "Pick"): "Screen-space
 * nearest: project at most 64 positions on each `pointermove` and take the
 * nearest within 16 px (24 px on touch). This avoids a raycaster against
 * Points." Pure 2-D math only; `Aircraft.tsx`/`Satellites.tsx` project
 * their own world positions to screen pixels (camera space, not this
 * module's concern) and pass the result in.
 */

export interface ScreenPoint {
  id: string;
  /** Screen-space pixel coordinates, already projected by the caller
   *  (`camera.project` + NDC -> pixel, `event.clientX/Y`'s own convention:
   *  origin top-left, +x right, +y down). */
  x: number;
  y: number;
}

/** Mouse vs touch pick radius (open-data-spec.md §3 A1: "within 16 px (24 px
 *  on touch)"). */
export const PICK_RADIUS_PX = 16;
export const PICK_RADIUS_TOUCH_PX = 24;

/**
 * The nearest `candidates` entry to `(px, py)` within `radiusPx`, or `null`
 * when nothing qualifies. Ties (equal distance) resolve to whichever
 * candidate appears first in `candidates`; deterministic for a fixed input
 * order, since only a STRICTLY closer candidate ever displaces the current
 * best.
 */
export function skyPick(candidates: readonly ScreenPoint[], px: number, py: number, radiusPx: number = PICK_RADIUS_PX): string | null {
  const r2 = radiusPx * radiusPx;
  let bestId: string | null = null;
  let bestDist2 = Infinity;
  for (const c of candidates) {
    const dx = c.x - px;
    const dy = c.y - py;
    const dist2 = dx * dx + dy * dy;
    if (dist2 <= r2 && dist2 < bestDist2) {
      bestDist2 = dist2;
      bestId = c.id;
    }
  }
  return bestId;
}
