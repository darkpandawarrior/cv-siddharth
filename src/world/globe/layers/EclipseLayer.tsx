// WAVE 7 LANE 8 (eclipse paths): a lazy chunk (GlobeScene.tsx mounts it
// under Suspense, only fetched when `layers.eclipse` is on) -- astronomy-
// engine's ~47 KB gzip never touches the eager Globe chunk (eclipse.ts's own
// header comment). Draws the umbra/antumbra ground track of the next global
// solar eclipse as a soft band, plus a moving dark disc at the shadow's
// live ground point whenever the simulated instant is actually inside one.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { nextGlobalEclipses, shadowAxisPoint, umbraTrack, type GlobalEclipse } from "./eclipse.ts";

// One calendar day (UTC) of slack: bucketing the "from" instant this
// coarsely means dragging the time scrubber never re-runs astronomy-engine's
// eclipse search on every frame, only once per simulated day. Anchored two
// days BEFORE the bucket, not at it, so scrubbing to a moment inside an
// eclipse still finds that same eclipse as "next" rather than skipping past
// it the instant its peak falls earlier in the bucketed day.
const DAY_MS = 86_400_000;
const SEARCH_LOOKBACK_MS = 2 * DAY_MS;

import { ECLIPSE_CORE, ECLIPSE_HALO, ECLIPSE_SHADOW, ECLIPSE_CORE_RADIUS, ECLIPSE_HALO_RADIUS, ECLIPSE_GSFC_NOTE } from "./layerKeys.ts";
const UMBRA_DARK = new THREE.Color(ECLIPSE_SHADOW);
const BAND_CORE = new THREE.Color(ECLIPSE_CORE);
const BAND_HALO = new THREE.Color(ECLIPSE_HALO);

function kindLabel(kind: GlobalEclipse["kind"]): string {
  return kind === "total" ? "Total" : kind === "annular" ? "Annular" : "Partial";
}

function fmtPeak(peak: Date): string {
  return peak.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

export default function EclipseLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const select = useGlobe((s) => s.select);
  const setStatus = useGlobe((s) => s.setStatus);
  // e2e-only read seam (HazardLayer.tsx's own __HAZARD_DEBUG__, ArcLayer.tsx's
  // own data-arc-layer convention): a plain DOM dataset, not a React state
  // re-render source, so a test can poll the currently-found eclipse and the
  // track length without depending on WebGL pixel colours.
  const domRef = useRef<HTMLDivElement>(null);

  const dayBucket = Math.floor(now.getTime() / DAY_MS);
  // astronomy-engine's search always finds a next eclipse within its
  // -1999..+3000 supported range, and every real or scrubbed simulated date
  // in this app falls inside it, so `primary` is never actually undefined --
  // asserted, not guarded, to keep every hook below unconditional.
  const eclipses = useMemo(() => nextGlobalEclipses(new Date(dayBucket * DAY_MS - SEARCH_LOOKBACK_MS), 2), [dayBucket]);
  const primary = eclipses[0]!;

  const track = useMemo(() => (primary.kind === "partial" ? [] : umbraTrack(primary.peak)), [primary]);

  const curveGeometry = useMemo(() => {
    if (track.length < 2) return null;
    const pts = track.map((p) => {
      const u = latLonToXyz(p.lat, p.lon);
      return new THREE.Vector3(u.x, u.y, u.z).multiplyScalar(GLOBE_RADIUS + 0.02);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    return {
      core: new THREE.TubeGeometry(curve, Math.max(pts.length, 8), ECLIPSE_CORE_RADIUS, 10, false),
      halo: new THREE.TubeGeometry(curve, Math.max(pts.length, 8), ECLIPSE_HALO_RADIUS, 10, false),
    };
  }, [track]);

  useEffect(() => () => {
    curveGeometry?.core.dispose();
    curveGeometry?.halo.dispose();
  }, [curveGeometry]);

  // The live umbra ground point, recomputed whenever the simulated instant
  // changes -- cheap trig, not a per-frame R3F cost (this component has no
  // useFrame; `now` only changes on a clock tick or a scrubber drag, both of
  // which are React renders, not animation frames).
  const live = useMemo(() => shadowAxisPoint(now), [now]);

  useEffect(() => {
    const detail = live
      ? `inside the ${kindLabel(primary.kind)} eclipse of ${fmtPeak(primary.peak)}`
      : `next: ${kindLabel(primary.kind)}, greatest eclipse ${fmtPeak(primary.peak)}`;
    setStatus("eclipse", { state: "live", detail });
    return () => setStatus("eclipse", undefined);
  }, [primary, live, setStatus]);

  // Written every frame, not from a dependency-gated effect: drei's Html
  // portals its container into the DOM one render after this component's own
  // mount commit, so an effect keyed on [primary, track, live] alone can fire
  // once with domRef.current still null and never get a second chance if
  // none of those change again (a frozen e2e clock, in particular) --
  // ArcLayer.tsx's own dash-writing useFrame carries the identical reasoning.
  useFrame(() => {
    const el = domRef.current;
    if (!el) return;
    el.dataset.eclipseKind = primary.kind;
    el.dataset.eclipsePeak = primary.peak.toISOString();
    el.dataset.eclipseTrackCount = String(track.length);
    el.dataset.eclipseLive = String(live !== null);
    if (live) {
      el.dataset.eclipseLiveLat = String(live.lat);
      el.dataset.eclipseLiveLon = String(live.lon);
    } else {
      delete el.dataset.eclipseLiveLat;
      delete el.dataset.eclipseLiveLon;
    }
  });

  const selectPath = () => {
    select({
      id: `eclipse:${primary.peak.toISOString()}`,
      kind: "eclipse",
      title: `${kindLabel(primary.kind)} solar eclipse, ${fmtPeak(primary.peak)}`,
      rows: [
        { label: "Kind", value: kindLabel(primary.kind) },
        { label: "Greatest eclipse", value: fmtPeak(primary.peak) },
        primary.latitude !== undefined && primary.longitude !== undefined
          ? { label: "Ground point", value: `${primary.latitude.toFixed(2)}, ${primary.longitude.toFixed(2)}` }
          : { label: "Ground point", value: "none (partial eclipse everywhere)" },
      ],
      source: ECLIPSE_GSFC_NOTE,
      live: true,
      focus: primary.latitude !== undefined && primary.longitude !== undefined ? { kind: "latlon", lat: primary.latitude, lon: primary.longitude } : undefined,
    });
  };

  const discPlacement = useMemo(() => {
    if (!live) return null;
    const p = latLonToXyz(live.lat, live.lon);
    const normal = new THREE.Vector3(p.x, p.y, p.z);
    return {
      position: normal.clone().multiplyScalar(GLOBE_RADIUS + 0.04),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    };
  }, [live]);

  return (
    <group>
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-eclipse-layer aria-hidden />
      </Html>
      {curveGeometry && tier !== 3 && (
        <>
          <mesh geometry={curveGeometry.halo} onClick={(e) => { e.stopPropagation(); selectPath(); }}>
            <meshBasicMaterial color={BAND_HALO} transparent opacity={0.3} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh geometry={curveGeometry.core} onClick={(e) => { e.stopPropagation(); selectPath(); }}>
            <meshBasicMaterial color={BAND_CORE} transparent opacity={0.8} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
      {discPlacement && (
        <mesh position={discPlacement.position} quaternion={discPlacement.quaternion} onClick={(e) => { e.stopPropagation(); selectPath(); }}>
          <circleGeometry args={[0.55, 32]} />
          <meshBasicMaterial color={UMBRA_DARK} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
