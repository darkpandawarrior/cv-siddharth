import type { JSX } from "react";
import { usePageData } from "@playhtml/react";
import { CITY } from "./city.ts";
import { LIT_MAP_SYNC_CHANNEL, type LitMapSyncState } from "./litMapSyncChannel.ts";

/**
 * The live half of CorridorPlate.tsx's §11 overlay — split into its own file
 * for the exact reason DeferredPlayRoom.tsx exists: `@playhtml/react` reads
 * `document` at module load, and `/playground` server-renders (that route's
 * own doc comment: "this route already has a real thing to show without any
 * of it"). A static import here crashed every SSR of that route with
 * `ReferenceError: document is not defined` inside `renderToReadableStream`
 * — DeferredPlayRoom.tsx's own comment names the identical failure on
 * /weeb and /anthology. CorridorPlate.tsx loads this with `lazy()` behind
 * `useHydrated()`, the same client-only-after-hydration gate every other
 * playhtml-touching widget in this codebase uses (DeferredPlayRoom.tsx's
 * `deferred()` helper), so the server and the hydration pass never see it.
 */

/** Same 0..1 normalisation litMap.ts's own `litMapTexel` uses (world x/z
 *  against CITY's own halfWidth/z0/z1) — this overlay needs the same two
 *  fractions the year rules and lane rows already sit in, not litMapTexel's
 *  own texel grid, so the maths is restated rather than imported. */
function stampFraction(x: number, z: number): { xFraction: number; yFraction: number } {
  return {
    xFraction: Math.min(1, Math.max(0, (z - CITY.z0) / (CITY.z1 - CITY.z0))),
    yFraction: Math.min(1, Math.max(0, (x + CITY.halfWidth) / (CITY.halfWidth * 2))),
  };
}

export default function LiveLitMapOverlay({ imageAspect }: { imageAspect: number }): JSX.Element | null {
  // Read-only here: this fallback has no car of its own to publish a
  // position for, only other tabs' live drivers to show.
  const [liveStamps] = usePageData<LitMapSyncState>(LIT_MAP_SYNC_CHANNEL, {});
  if (Object.keys(liveStamps).length === 0) return null;

  return (
    <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {Object.entries(liveStamps).map(([key, stamp]) => {
        const { xFraction, yFraction } = stampFraction(stamp.x, stamp.z);
        // preserveAspectRatio="none" stretches this 1x1 viewBox onto the
        // image's own non-square rectangle non-uniformly — an `<ellipse>`
        // with rx pre-compensated by that ratio is what actually renders as
        // a round dot rather than one squashed wide, the same reasoning
        // CorridorPlate.tsx's year-line `vectorEffect` comment gives for a
        // different axis.
        const rx = 0.006 / imageAspect;
        return <ellipse key={key} cx={xFraction} cy={yFraction} rx={rx} ry={0.006} fill="#5ee6ff" fillOpacity={0.85} />;
      })}
    </svg>
  );
}
