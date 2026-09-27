/**
 * The v1 to v2 carry-over: the lit map, ported off `LiveLitMapOverlay.tsx`
 * (master-plan.md#M6; §7 LAYER C in `Wake.tsx`'s own doc comment; "the
 * record" of everywhere every driving tab has been, shared live over
 * playhtml).
 *
 * v1's `litMap.ts`/`litMapSync.ts` are tied to `city.ts`'s desk-world
 * dimensions (`CITY.halfWidth`, `CITY.z0`/`z1`) end to end — the
 * `DataTexture`, the stamp brush, the fragment-shader groove all key off
 * that one coordinate frame, which is a different shape and scale from the
 * valley's own (`valley.ts`'s `BOUNDS`, world-v2-spec's "one coordinate
 * spine, scaled"). Re-deriving a whole second accumulating texture and
 * Terrain shader hookup for the valley is a `WorldV2.tsx`/`Terrain.tsx`
 * change (neither owned by this lane), so this file ports the OTHER half
 * that already travels cleanly: `LiveLitMapOverlay.tsx`'s own read-only
 * fallback posture ("this fallback has no car of its own to publish a
 * position for, only other tabs' live drivers to show") — a toggled
 * overlay reading the SAME shared `LIT_MAP_SYNC_CHANNEL` every driving v1
 * tab already publishes to, renormalised against the valley's own bounds.
 * Nothing here writes a v2 stamp (no owned file has a live hodi position to
 * publish — see `GpsLens.tsx`'s own doc comment), so a v1 tab's worn track
 * shows up here exactly as it does in v1's own fallback, and a v2 session
 * on its own shows an empty, honest map rather than a fabricated one.
 */
import { useEffect, useState, type JSX } from "react";
import { usePageData } from "@playhtml/react";
import { LIT_MAP_SYNC_CHANNEL, type LitMapSyncState } from "../../litMapSyncChannel.ts";
import { BOUNDS } from "../valley.ts";

export const layer = { id: "lit-map", order: 57 };

const TOGGLE_KEY = "m";

/** World (x, z) -> the overlay's 0..1 SVG fraction, against the valley's
 *  own bounds rather than `city.ts`'s — the same renormalisation
 *  `LiveLitMapOverlay.tsx`'s own `stampFraction` does for the desk world. */
function stampFraction(x: number, z: number): { xFraction: number; yFraction: number } {
  return {
    xFraction: Math.min(1, Math.max(0, (z - BOUNDS.zMin) / (BOUNDS.zMax - BOUNDS.zMin))),
    yFraction: Math.min(1, Math.max(0, (x - BOUNDS.xMin) / (BOUNDS.xMax - BOUNDS.xMin))),
  };
}

export default function LitMap(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [liveStamps] = usePageData<LitMapSyncState>(LIT_MAP_SYNC_CHANNEL, {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== TOGGLE_KEY) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select|button)$/i.test(target.tagName)) return;
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const stamps = Object.entries(liveStamps);

  return (
    <>
      <span className="sr-only" aria-hidden="true" data-lit-map={open ? "open" : "closed"} />
      {open && (
        <div
          role="dialog"
          aria-label="Lit map"
          className="pointer-events-auto absolute right-3 top-16 aspect-square w-40 overflow-hidden rounded border border-line bg-card/90 sm:w-52"
        >
          <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className="h-full w-full">
            <rect x="0" y="0" width="1" height="1" fill="var(--color-void)" />
            {stamps.map(([key, stamp]) => {
              const { xFraction, yFraction } = stampFraction(stamp.x, stamp.z);
              return <circle key={key} cx={xFraction} cy={yFraction} r={0.012} fill="var(--color-probe)" fillOpacity={0.85} />;
            })}
          </svg>
        </div>
      )}
    </>
  );
}
