/**
 * A pavilion's approach volume, and how high above it its name floats.
 *
 * Extracted from Pavilions.tsx because two files now need these numbers and
 * neither should be importing the other: Pavilions builds the sensor from
 * them, labels.ts places the floating room name from them. Left in the
 * component file, the label layer would have had to either import a const out
 * of a .tsx (dragging R3F into a module that has no business touching it, and
 * costing that file its fast-refresh) or hand-copy the heights — which is
 * exactly how this world previously ended up with a launch ramp buried in the
 * island it was meant to launch off.
 */

import type { Placement } from "./worldData.ts";

/**
 * Half-extents (metres) of each shape's approach volume, keyed off `shape`
 * rather than per-room so every pavilion has the same "come this close" feel.
 *
 * GENEROUS ON PURPOSE, and roughly doubled from the first pass. At ~2m you had
 * to park almost on top of a room before it acknowledged you, which for a hub
 * whose entire job is opening doors is the wrong trade — the prompt should meet
 * a driver who is clearly heading for a room, not reward precision parking.
 * PLACEMENTS keeps the rooms 8m+ apart (worldGeometry.test.ts asserts it), so
 * there is room for this without two prompts ever overlapping.
 */
export const SENSOR_HALF_EXTENTS: Record<Placement["shape"], [number, number, number]> = {
  slab: [4.8, 2.6, 4.8],
  crt: [4.8, 3.2, 4.8],
  board: [4.8, 3.2, 4.8],
  pcb: [4.8, 2.6, 4.8],
};

/** Height above the pavilion's own origin at which its name floats — just
 *  clear of the sensor box, so the label never reads as being buried in the
 *  structure it belongs to. */
export const LABEL_HEIGHT: Record<Placement["shape"], number> = {
  slab: SENSOR_HALF_EXTENTS.slab[1] + 0.7,
  crt: SENSOR_HALF_EXTENTS.crt[1] + 0.7,
  board: SENSOR_HALF_EXTENTS.board[1] + 0.7,
  pcb: SENSOR_HALF_EXTENTS.pcb[1] + 0.7,
};
