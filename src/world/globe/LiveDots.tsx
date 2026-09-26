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
export function LiveDots({ tier }: { tier: 1 | 2 | 3 }) {
  const counts = usePresenceGeo();
  if (tier !== 1) return null;

  return (
    <>
      {Object.entries(counts).map(([cc, n]) => {
        const centroid = centroidByCc.get(cc);
        if (!centroid) return null;
        const p = latLonToXyz(centroid.lat, centroid.lon);
        const r = GLOBE_RADIUS + 0.03;
        const position: [number, number, number] = [p.x * r, p.y * r, p.z * r];
        return (
          <Html key={cc} position={position} center distanceFactor={10} style={{ pointerEvents: "none" }}>
            <span
              data-live-dot={cc}
              title={`${n} here now from ${centroid.name}`}
              style={{
                display: "block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#5ee6ff",
                boxShadow: "0 0 6px 2px rgba(94,230,255,0.7)",
              }}
            />
          </Html>
        );
      })}
    </>
  );
}
