/**
 * Ghost read-lines — the Z position of every other live driver, written by
 * Ghosts.tsx every frame and read by Terrain.tsx's own useFrame to fill its
 * `uGhostZ` shader uniform. A telemetry.ts-style mutable singleton (see that
 * file's own doc comment: "React's only job here is to mount the nodes,
 * everything else updates from this every frame") rather than a prop or
 * context value — Terrain and Ghosts are both direct children of World.tsx's
 * <Canvas>, and a per-frame prop/context round-trip between two siblings
 * would just be a slower path to the same plain array.
 *
 * Always holds every live ghost's Z, uncapped — §10's own "4 → 2" mobile
 * drop is how many of these Terrain actually draws, not how many exist here,
 * so Terrain reads its own tier's cap off deviceTier.ts, never off this
 * array's length.
 */
export const ghostReadlines: { z: number[] } = { z: [] };
