import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { SceneActivity, useReducedMotion } from "../../SceneActivity.tsx";
import { subsolarPoint } from "../../lib/sky.ts";
import { latLonToXyz } from "./geoMath.ts";
import { EarthDots, GLOBE_RADIUS } from "./EarthDots.tsx";
import { ReachColumns } from "./ReachColumns.tsx";
import { Markers } from "./Markers.tsx";
import { LiveDots } from "./LiveDots.tsx";
import { OrbitLayer } from "./OrbitLayer.tsx";
import { LocalTraffic } from "./LocalTraffic.tsx";

// §6.3 Tiers: "dots 6,000 / 2,500 / 1,200 by tier".
const TIER_DOT_COUNT: Record<1 | 2 | 3, number> = { 1: 6000, 2: 2500, 3: 1200 };

/**
 * Writes the real subsolar point's CURRENT screen projection onto a plain
 * DOM sibling (never React state - this recomputes every rendered frame,
 * including while OrbitControls auto-rotates). `data-day-side` is which
 * screen half currently faces the subsolar point, so e2e/globe.spec.ts can
 * crop a day/night luma comparison from the CURRENT camera orientation
 * without knowing three.js's projection math itself - "clip regions computed
 * from the subsolar point projection exposed as data attributes" (this
 * lane's own acceptance line).
 */
function SubsolarProbe({ now, probeRef }: { now: Date; probeRef: React.RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const el = probeRef.current;
    if (!el) return;
    const sub = subsolarPoint(now);
    const p = latLonToXyz(sub.lat, sub.lon);
    const world = new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(GLOBE_RADIUS).project(camera);
    const x = (world.x * 0.5 + 0.5) * size.width;
    const y = (-world.y * 0.5 + 0.5) * size.height;
    const dx = x - size.width / 2;
    const dy = y - size.height / 2;
    el.dataset.subsolarX = String(Math.round(x));
    el.dataset.subsolarY = String(Math.round(y));
    el.dataset.daySide = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
  });
  return null;
}

export interface GlobeSceneProps {
  now: Date;
  tier: 1 | 2 | 3;
}

/**
 * GLOBE (living-ledger-spec.md#6.3): one WebGL context, real Earth as a
 * Fibonacci dot matrix, the two reach columns and the employer ring over
 * Pune, live per-country presence, the CelesTrak orbit ambient and the local
 * aircraft cluster. Auto-rotate freezes under reduced motion or at T3
 * (ambient off at T3 either way, so nothing there would move regardless).
 * `useReducedMotion` (not a prop): the design system's "reduced motion is
 * LIVE" rule - a visitor who toggles the OS setting mid-session, or a test
 * that calls `emulateMedia` after load, must see auto-rotate actually stop.
 */
export function GlobeScene({ now, tier }: GlobeSceneProps) {
  const probeRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const autoRotate = !reducedMotion && tier !== 3;

  return (
    <>
      {/* Test/tooling seam only - zero footprint, never painted. */}
      <div ref={probeRef} data-subsolar-probe aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      <Canvas
        dpr={[1, tier === 3 ? 1 : 1.5]}
        camera={{ position: [0, 2.4, 15], fov: 42 }}
        gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
        style={{ position: "absolute", inset: 0 }}
        role="img"
        aria-label="An interactive globe: the real day and night line over Earth, two reach columns and an employer ring over Pune, and live visitor presence by country"
      >
        <SceneActivity />
        <color attach="background" args={["#05070a"]} />
        <OrbitControls
          enablePan={false}
          minDistance={9}
          maxDistance={26}
          autoRotate={autoRotate}
          autoRotateSpeed={0.35}
          enableDamping
        />
        <SubsolarProbe now={now} probeRef={probeRef} />
        <EarthDots count={TIER_DOT_COUNT[tier]} now={now} />
        <ReachColumns />
        <Markers />
        <LiveDots tier={tier} />
        {tier === 1 && <OrbitLayer />}
        {tier !== 3 && <LocalTraffic tier={tier} />}
      </Canvas>
    </>
  );
}
