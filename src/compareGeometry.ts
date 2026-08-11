// Geometry for the N-way compare viewer. Kept apart from the component because this is the part
// with rules: dividers must stay ordered and every band must stay grabbable. A divider that can be
// dragged past its neighbour silently swaps which version you are looking at, and the labels then
// lie about the image underneath them.

/** Smallest band width, in percent. Below this a band is too thin to read or to grab back. */
export const MIN_BAND = 4;

/** Evenly spaced dividers for `count` layers: 2 layers → [50], 3 → [33.3, 66.7]. */
export function evenPositions(count: number): number[] {
  if (count < 2) return [];
  return Array.from({ length: count - 1 }, (_, i) => ((i + 1) * 100) / count);
}

/**
 * Move divider `index` to `next`, keeping the set ordered and every band at least [MIN_BAND] wide.
 *
 * Clamps against the *neighbouring dividers*, not just the frame, so dragging one divider hard
 * left cannot push others off or reorder them — it stops against its neighbour with a readable
 * sliver still showing.
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

/**
 * The [start, end] percent band that layer `i` occupies. Layer 0 runs from the left edge, the last
 * layer runs to the right edge, so the frame is always fully covered by exactly one layer.
 */
export function bandFor(i: number, positions: number[]): [number, number] {
  const start = i === 0 ? 0 : positions[i - 1];
  const end = i >= positions.length ? 100 : positions[i];
  return [start, end];
}

/** `clip-path` for layer `i` — inset from the right by everything past its band, and from the left
 *  by everything before it. */
export function clipFor(i: number, positions: number[]): string {
  const [start, end] = bandFor(i, positions);
  return `inset(0 ${100 - end}% 0 ${start}%)`;
}

/** Percent along the frame for a pointer at `clientX`, given the frame's box. */
export function percentAt(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return ((clientX - rect.left) / rect.width) * 100;
}
