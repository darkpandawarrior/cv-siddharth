import type { RefObject } from "react";
import type { Object3D } from "three";
import { Html } from "@react-three/drei";
import { latLonToXyz } from "./geoMath.ts";
import { centroids } from "./centroids.ts";
import { usePresenceGeo } from "./presenceGeo.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";

const centroidByCc = new Map(centroids.map((c) => [c.iso2, c] as const));

/**
 * GLOBE's live dots (S14, living-ledger-spec.md#6.3 task 3 and §9.1): one
 * pulse per country with a visitor here right now, at that country's real
 * centroid. Counts only, never a position - `usePresenceGeo` already
 * aggregates to `{ cc: count }` before this ever sees it.
 *
 * Tiered per the GLOBE lens (§6.3 "Tiers", streams.ts's own `tiers` text for
 * presence-countries): T1 draws a dot per country, T2 keeps the aggregate
 * count (GlobePanel's own row, not this layer) but no per-country dots, T3
 * drops the presence layer entirely.
 */
// living-earth L4: a soft pulsing disc reads as a live presence heartbeat
// rather than a static cyan dot -- a plain CSS animation (not r3f/WebGL),
// same as ArcLayer's dash marker communicates the same "arriving now" idea
// on the WebGL side. `prefers-reduced-motion` freezes it via the media
// query itself (no JS branch needed for a CSS-only animation).
const PULSE_KEYFRAMES = `@keyframes globe-live-dot-pulse{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(1.6);opacity:0.35}}
.globe-live-dot-ring{animation:globe-live-dot-pulse 2.4s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.globe-live-dot-ring{animation:none;opacity:0.6}}`;

// Pune declutter (P4, wave 9): this is an <Html> portal, not a WebGL mesh,
// so it never itself z-fights (drei's occlude does its own per-frame
// raycast, not a depth-buffer write) - but it still keeps a distinct,
// deliberate lift so its occlusion probe point can't land exactly inside
// one of the five WebGL Pune layers. Highest of the whole stack: the six
// files this wave's declutter touches use 0.008 / 0.016 / 0.024 / 0.032 /
// 0.04 (ReachColumns.tsx / layers/reachAppRing.tsx / layers/familyCiRing.tsx
// / layers/hazardHalos.tsx / layers/TogetherLayer.tsx, in that order) - this
// is the sixth, above all of them, since a live "someone here now" dot is
// the layer this stack most wants to read as unmissable.
export const SURFACE_LIFT = 0.048;

export function LiveDots({ tier, occlude }: { tier: 1 | 2 | 3; occlude?: RefObject<Object3D>[] }) {
  const counts = usePresenceGeo();
  if (tier !== 1) return null;

  return (
    <>
      {Object.entries(counts).map(([cc, n]) => {
        const centroid = centroidByCc.get(cc);
        if (!centroid) return null;
        const p = latLonToXyz(centroid.lat, centroid.lon);
        const r = GLOBE_RADIUS + SURFACE_LIFT;
        const position: [number, number, number] = [p.x * r, p.y * r, p.z * r];
        return (
          <Html key={cc} position={position} center distanceFactor={10} occlude={occlude} style={{ pointerEvents: "none" }}>
            <style>{PULSE_KEYFRAMES}</style>
            <span
              data-live-dot={cc}
              title={`${n} here now from ${centroid.name}`}
              style={{
                position: "relative",
                display: "block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#5ee6ff",
                boxShadow: "0 0 6px 2px rgba(94,230,255,0.7)",
              }}
            >
              <span
                aria-hidden
                className="globe-live-dot-ring"
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: "1px solid rgba(94,230,255,0.8)",
                  animationDelay: `${(cc.charCodeAt(0) % 5) * 0.3}s`,
                }}
              />
            </span>
          </Html>
        );
      })}
    </>
  );
}
