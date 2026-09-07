import { useCallback, useEffect, useId, useRef } from "react";
import { usePageData } from "@playhtml/react";
import { pickNewRemoteStamps, stampLitMap } from "./litMap.ts";
import { LIT_MAP_SYNC_CHANNEL, type LitMapSyncState } from "./litMapSyncChannel.ts";

/**
 * The playhtml half of litMap.ts's "SHARED-STATE SEAM" — split into its own
 * file because it imports `@playhtml/react`, which reads `document` at
 * module load; vitest runs this project under `environment: "node"`, and
 * litMap.ts's own tests (`litMapTexel`/`stampLitMap`/`pickNewRemoteStamps`)
 * need to keep importing that file directly without pulling this crash in
 * with them (pulse.ts/pulseEvents.ts draw the identical line — see
 * pulse.test.ts's own comment for the same trap in the same codebase).
 */

/** How often THIS tab publishes its own position — the send-side half of
 *  `usePulse`'s `DEDUPE_MS` discipline, tuned looser: a driving cart doesn't
 *  need its wear stamped ten times a second for a communal "worn track" cue
 *  to read as real, and every publish is a write every open tab receives. */
const STAMP_PUBLISH_MS = 400;

/**
 * Wires one Terrain's local `litData` into the shared record — see
 * litMap.ts's own "SHARED-STATE SEAM" comment. Returns a `publish(x, z)` the
 * caller's own per-frame drive loop calls with the car's current position;
 * this hook throttles the actual network write and applies every OTHER
 * tab's incoming stamp into `litData` via `stampLitMap` as it arrives.
 *
 * ponytail: a tab that closes stays in the shared document at its last
 * position forever — no expiry/pruning. The document holds one entry per
 * distinct playhtml identity that has ever driven, not one per event, so it
 * stays small in practice; add pruning (drop entries older than N minutes,
 * same shape as pulseEvents.ts's dedupe map) if that ever actually grows
 * large enough to matter.
 */
export function useLitMapRemoteSync(litData: Uint8Array, w: number, h: number): (x: number, z: number) => void {
  const [remote, setRemote] = usePageData<LitMapSyncState>(LIT_MAP_SYNC_CHANNEL, {});
  const appliedRef = useRef(new Map<string, number>());
  // React's own stable, unique-per-mount id — this channel only ever needs
  // "some key nobody else is using right now" (the same reasoning
  // visitors.ts's pickShard gives for not deriving a shard from anything
  // identifying), and generating one with `Math.random()` directly in render
  // is an impure render call `useId()` exists specifically to replace.
  const myKey = useId();
  const lastPublishRef = useRef(0);

  useEffect(() => {
    for (const stamp of pickNewRemoteStamps(remote, myKey, appliedRef.current)) {
      stampLitMap(litData, stamp.x, stamp.z, w, h);
    }
  }, [remote, myKey, litData, w, h]);

  return useCallback(
    (x: number, z: number) => {
      const now = performance.now();
      if (now - lastPublishRef.current < STAMP_PUBLISH_MS) return;
      lastPublishRef.current = now;
      setRemote((draft) => {
        draft[myKey] = { x, z, t: now };
      });
    },
    [setRemote, myKey],
  );
}
