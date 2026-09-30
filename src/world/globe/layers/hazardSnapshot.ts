// WAVE 6 LANE X6 (density hexbins). A read-only snapshot of exactly the two
// point series HexbinLayer.tsx needs (quakes shown, wildfires shown),
// written by HazardLayer.tsx's own minimal additive edit and read here by
// any sibling layer. Module-level like globeStore.ts's own `entityPositions`
// map — X6 doesn't own globeStore.ts's layer plumbing, and a plain getter
// is all a sibling layer needs to read the SAME post-tier, post-filter,
// post-time-scrub data HazardLayer.tsx already computes, with zero risk of
// a second, drifting fetch of the same feeds. Split into its own file (not
// exported from HazardLayer.tsx itself) so that component file keeps
// react-refresh's "only export components" contract — verified via eslint.
export interface HazardSnapshot {
  quakes: { id: string; lat: number; lon: number; mag: number }[];
  fires: { id: string; lat: number; lon: number }[];
}

let snapshot: HazardSnapshot = { quakes: [], fires: [] };

export function getHazardSnapshot(): HazardSnapshot {
  return snapshot;
}

export function setHazardSnapshot(next: HazardSnapshot): void {
  snapshot = next;
}
