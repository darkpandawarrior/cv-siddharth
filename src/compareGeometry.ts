// Geometry for the compare viewer's divider. Kept apart from the component so the clamping rule is
// testable without a DOM: the divider has to stay inside the frame with a grabbable sliver of each
// side left, or it parks flush against an edge the pointer cannot retrieve it from.
//
// This was an N-way band solver back when the viewer split one screen into five vertical slices.
// That design is gone — a toggle picks the treatment and the divider compares light against dark —
// so the array shape survives only because one divider is the single-element case of it.

/** Smallest sliver, in percent. Below this an edge is too thin to grab back. */
export const MIN_BAND = 4;

/**
 * Move divider [index] to [next], keeping it inside the frame and away from its neighbours.
 *
 * Clamps against neighbouring dividers rather than only the frame, so with more than one they can
 * never cross and swap which image is on which side.
 */
export function clampPosition(positions: number[], index: number, next: number): number[] {
  if (index < 0 || index >= positions.length) return positions;
  const lower = index === 0 ? 0 : positions[index - 1];
  const upper = index === positions.length - 1 ? 100 : positions[index + 1];
  const clamped = Math.min(Math.max(next, lower + MIN_BAND), upper - MIN_BAND);
  const out = positions.slice();
  out[index] = clamped;
  return out;
}

/** Percent along the frame for a pointer at [clientX], given the frame's box. */
export function percentAt(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return ((clientX - rect.left) / rect.width) * 100;
}
