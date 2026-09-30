import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { PUNE } from "../../../lib/sky.ts";
import { readColor } from "../../../themeColorThree.ts";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { centroids } from "../centroids.ts";
import { usePresenceGeo } from "../presenceGeo.ts";
import { useGlobe } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { arcApexHeight, arcPoint, centralAngleDeg, sampleArc } from "./arcGeo.ts";
import { publish } from "../feed.ts"; // WAVE 6 LANE X1 (live world feed)

const centroidByCc = new Map(centroids.map((c) => [c.iso2, c] as const));
const PUNE_UNIT = latLonToXyz(PUNE.lat, PUNE.lon);

// living-ledger §6.3 Tiers: presence dots are T1-only; the arcs drawn from
// them follow the same cut, plus a country cap so a viral spike never turns
// the globe into a hairball. T3 draws none of these (house rule §5).
const CAP_BY_TIER: Record<1 | 2 | 3, number> = { 1: 40, 2: 16, 3: 0 };
const DASH_GEOMETRY = new THREE.SphereGeometry(0.03, 8, 8);
const dummy = new THREE.Object3D();
const DASH_SPEED = 0.35; // full arc traversals per second

interface ArcEntry {
  cc: string;
  name: string;
  count: number;
  from: ReturnType<typeof latLonToXyz>;
  apex: number;
  /** Built once per entries recompute (not per render) -- disposed by the
   *  cleanup effect below when a new batch replaces this one. */
  geometry: THREE.TubeGeometry;
}

/** One arc per Html-driven local ring for India (skipped from the arc set
 *  below): a visitor already in Pune's own country has no great-circle
 *  reach to draw, so the count still needs a home. */
function IndiaRing({ count, onSelect }: { count: number; onSelect: () => void }) {
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const placement = useMemo(() => {
    const normal = new THREE.Vector3(PUNE_UNIT.x, PUNE_UNIT.y, PUNE_UNIT.z);
    return {
      position: normal.clone().multiplyScalar(GLOBE_RADIUS + 0.015),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    };
  }, []);
  const scale = 0.9 + Math.min(count, 20) * 0.03;
  return (
    <mesh position={placement.position} quaternion={placement.quaternion} scale={scale} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <ringGeometry args={[0.09, 0.11, 28]} />
      <meshBasicMaterial color={probe} toneMapped={false} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * ArcLayer (living-ledger-spec.md#6.3 task L4): one great-circle arc into
 * Pune per country with a visitor here right now (usePresenceGeo, counts
 * only -- never a position, same rule LiveDots.tsx already carries). Apex
 * height is proportional to distance (arcGeo.ts); a travelling dash rides
 * each arc toward Pune. India draws a ring instead of a degenerate arc to
 * itself. `sampleArc`'s tube geometry only rebuilds when presence counts
 * change; the dash position is the one thing recomputed per frame, and it's
 * a pure function call plus a matrix write -- no allocation on the hot path
 * beyond the Vector3 arcPoint already returns (arcs are at most a few dozen,
 * not the thousands EarthDots pools for).
 */
export default function ArcLayer({ tier }: { tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const cap = CAP_BY_TIER[tier];
  const counts = usePresenceGeo();
  const select = useGlobe((s) => s.select);
  const setStatus = useGlobe((s) => s.setStatus);
  const probeColor = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const domRef = useRef<HTMLDivElement>(null);
  // WAVE 6 LANE X1 (live world feed): the previous poll's set of countries
  // with at least one visitor -- `null` means "no poll seen yet", so the
  // first real poll only baselines the set rather than announcing every
  // country already here at page load as a fresh "arrival" (PulseLayer's
  // own prevRef === null convention, restated).
  const seenCountriesRef = useRef<Set<string> | null>(null);

  const entries: ArcEntry[] = useMemo(() => {
    const list: { cc: string; name: string; count: number }[] = [];
    for (const [cc, n] of Object.entries(counts)) {
      if (cc === "IN" || n <= 0) continue;
      const c = centroidByCc.get(cc);
      if (!c) continue;
      list.push({ cc, name: c.name, count: n });
    }
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, cap).map(({ cc, name, count }) => {
      const c = centroidByCc.get(cc)!;
      const from = latLonToXyz(c.lat, c.lon);
      const apex = arcApexHeight(centralAngleDeg(from, PUNE_UNIT));
      const pts = sampleArc(from, PUNE_UNIT, apex, 32).map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(pts);
      // Width by count (brief §2): thicker tube for more visitors, capped
      // so a viral country never reads as a cable.
      const geometry = new THREE.TubeGeometry(curve, 32, 0.012 + Math.min(count, 10) * 0.003, 6, false);
      return { cc, name, count, from, apex, geometry };
    });
  }, [counts, cap]);

  // GPU cleanup: each `entries` recompute replaces the previous batch's
  // TubeGeometry instances, which nothing else disposes of automatically
  // since they're constructed outside JSX (passed via the `geometry` prop).
  useEffect(() => () => { for (const e of entries) e.geometry.dispose(); }, [entries]);

  const indiaCount = counts.IN ?? 0;

  useEffect(() => {
    if (cap === 0) {
      // Off by design at this tier, not broken: no health dot at all.
      setStatus("presence", undefined);
      return;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    setStatus(
      "presence",
      total > 0
        ? { state: "live", detail: `${total} here now, ${entries.length} countr${entries.length === 1 ? "y" : "ies"} arced (India as a ring)` }
        : { state: "live", detail: "nobody else here right now" },
    );
  }, [counts, entries.length, cap, setStatus]);

  // WAVE 6 LANE X1 (live world feed): a country transitioning from absent
  // to present is "a visitor country appears" -- includes India (the ring),
  // not just the arced entries, since a visitor from home is still a
  // visitor arriving.
  useEffect(() => {
    const active = new Set(Object.keys(counts).filter((cc) => (counts[cc] ?? 0) > 0));
    const prev = seenCountriesRef.current;
    if (prev) {
      for (const cc of active) {
        if (prev.has(cc)) continue;
        const c = centroidByCc.get(cc);
        publish({
          id: `presence:${cc}:${Date.now()}`,
          kind: "presence",
          title: `A visitor from ${c?.name ?? cc} appeared`,
          detail: "live presence, country from edge header",
          whenMs: Date.now(),
          source: "live presence",
          live: true,
          focus: c ? { kind: "latlon", lat: c.lat, lon: c.lon } : undefined,
          severity: "info",
        });
      }
    }
    seenCountriesRef.current = active;
  }, [counts]);

  const dashRef = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const mesh = dashRef.current;
    // Written every frame, not from a dependency-gated effect: drei's Html
    // portals its container into the DOM one render after this component's
    // own mount commit (its own internal effect creates the target node),
    // so an effect keyed on `entries.length` alone can fire once with
    // `domRef.current` still null and never get a second chance if the
    // count never changes again. useFrame's continuous tick self-heals the
    // moment the ref actually attaches -- same reasoning PulseLayer's own
    // per-frame dataset write already relies on.
    if (domRef.current) domRef.current.dataset.arcCount = String(entries.length);
    if (!mesh || entries.length === 0) return;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // Reduced motion parks each dash mid-arc instead of travelling.
      const t = reducedMotion ? 0.5 : (clock.elapsedTime * DASH_SPEED + i * 0.13) % 1;
      const p = arcPoint(entry.from, PUNE_UNIT, t, entry.apex);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(0.7 + Math.min(entry.count, 10) * 0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, probeColor);
    }
    mesh.count = entries.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  function selectCountry(entry: { cc: string; name: string; count: number }) {
    select({
      id: `presence:${entry.cc}`,
      kind: "presence",
      title: `${entry.count} here now from ${entry.name}`,
      rows: [
        { label: "country", value: entry.name },
        { label: "here now", value: String(entry.count) },
      ],
      source: "live presence, country from edge header, never stored",
      live: true,
      focus: { kind: "latlon", lat: centroidByCc.get(entry.cc)!.lat, lon: centroidByCc.get(entry.cc)!.lon },
    });
  }

  if (cap === 0) return null;

  return (
    <group>
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-arc-layer aria-hidden />
      </Html>
      {indiaCount > 0 && (
        <IndiaRing
          count={indiaCount}
          onSelect={() =>
            select({
              id: "presence:IN",
              kind: "presence",
              title: `${indiaCount} here now from India`,
              rows: [{ label: "country", value: "India" }, { label: "here now", value: String(indiaCount) }],
              source: "live presence, country from edge header, never stored",
              live: true,
            })
          }
        />
      )}
      {entries.map((entry) => (
        <mesh key={entry.cc} geometry={entry.geometry} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectCountry(entry); }}>
          <meshBasicMaterial color={probeColor} toneMapped={false} transparent opacity={0.35 + Math.min(entry.count, 10) * 0.04} />
        </mesh>
      ))}
      {entries.length > 0 && (
        <instancedMesh ref={dashRef} args={[DASH_GEOMETRY, undefined, entries.length]} frustumCulled={false} count={0}>
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}
