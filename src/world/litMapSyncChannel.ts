/**
 * The shared-record channel name and shape — split out of litMap.ts so a
 * consumer that only needs to READ the channel (CorridorPlate.tsx's no-WebGL
 * fallback, §11) never has to import litMap.ts itself, which pulls in
 * `three` for its `DataTexture` machinery. CorridorPlate.tsx is part of
 * Playground.tsx's always-loaded chunk (unlike World.tsx, which is `lazy`) —
 * see that file's own "nothing outside /playground pays for three.js"
 * comment — so a three.js import here would be a real regression, not a
 * theoretical one.
 */

/** The shared channel every driving tab's stamp events ride on. */
export const LIT_MAP_SYNC_CHANNEL = "world-lit-v1";

/** One driving tab's most recent stamp — see litMap.ts's `useLitMapRemoteSync`
 *  for why `t` is never compared across peers. */
export type LitMapStamp = { x: number; z: number; t: number };
export type LitMapSyncState = Record<string, LitMapStamp>;
