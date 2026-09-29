// LANE C2 (X-ray mode): a tiny external store (module scope, the same
// pattern ui/SoundToggle.tsx already uses for its own `enabled` flag) shared
// between three readers that must not import each other directly: the
// topbar toggle (GlobeHud.tsx, part of the eager Globe chunk — this file has
// to stay free of react/three imports or the toggle button would drag a
// whole lazy chunk's worth of code in with it), the DOM legend/stats card
// (ui/XRay.tsx, lazy) and the tile-outline scene layer (layers/XRayTiles.tsx,
// lazy). None of the three owns globeStore.ts, so this lives beside them
// instead of growing that file.
let enabled = false;
const enabledListeners = new Set<() => void>();

export function isXrayEnabled(): boolean {
  return enabled;
}

export function setXrayEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  for (const listener of enabledListeners) listener();
}

export function subscribeXray(listener: () => void): () => void {
  enabledListeners.add(listener);
  return () => enabledListeners.delete(listener);
}

/** Sampled from `renderer.info` at most 4 times a second (the brief's own
 *  cap) by layers/XRayTiles.tsx, which has the only `useThree()` handle to
 *  read it from — never per-frame React state (verification-loop: this is
 *  the seam that keeps the stats card honest without paying a render per
 *  frame). */
export interface XrayStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
}

const ZERO_STATS: XrayStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, fps: 0 };
let stats: XrayStats = ZERO_STATS;
const statsListeners = new Set<() => void>();

export function getXrayStats(): XrayStats {
  return stats;
}

export function setXrayStats(next: XrayStats): void {
  stats = next;
  for (const listener of statsListeners) listener();
}

/** Called by layers/XRayTiles.tsx on unmount (style switched off "imagery",
 *  or tier flips to 3, while X-ray is still toggled on) so the stats card
 *  and tile legend go back to zero instead of freezing on the last real
 *  reading — a stale non-zero number would contradict the brief's own
 *  "reflects what is actually drawn, never simulated" guarantee. */
export function resetXrayStats(): void {
  setXrayStats(ZERO_STATS);
}

export function subscribeXrayStats(listener: () => void): () => void {
  statsListeners.add(listener);
  return () => statsListeners.delete(listener);
}

/** Blueprint palette, coarsest to finest LOD: a plain blue-grey-to-white
 *  ramp, deliberately nowhere near `--color-probe` (#5ee6ff, a saturated
 *  cyan) — ambient scene chrome never wears a brand/live token
 *  (globe-lanes.md's own colour rule), and the brief separately calls for
 *  "cyan-free" here on top of that. Single source of truth for both readers
 *  that need it: layers/XRayTiles.tsx converts a stop to a THREE.Color for
 *  the sphere outlines, ui/XRay.tsx uses the same string directly as a CSS
 *  background for the legend swatches, so the two never drift apart. */
export const LEVEL_COLOR_HEX: readonly string[] = [
  "#3c4a5c",
  "#4f6379",
  "#6485a3",
  "#84a8c9",
  "#a8c7e0",
  "#cfe3f2",
  "#eef5fb",
  "#ffffff",
];

/** GIBS levels run past this file's own palette length (EOX's deep-zoom base
 *  reaches level 17) — clamp to the brightest stop rather than inventing a
 *  9th colour or wrapping back to the darkest one. */
export function levelColorHex(level: number): string {
  return LEVEL_COLOR_HEX[Math.max(0, Math.min(LEVEL_COLOR_HEX.length - 1, level))];
}
