import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SceneActivity, useReducedMotion } from "../../SceneActivity.tsx";
import { subsolarPoint } from "../../lib/sky.ts";
import { latLonToXyz } from "./geoMath.ts";
import { EarthDots, GLOBE_RADIUS } from "./EarthDots.tsx";
import { ReachColumns } from "./ReachColumns.tsx";
import { Markers } from "./Markers.tsx";
import { LiveDots } from "./LiveDots.tsx";
import { OrbitLayer } from "./OrbitLayer.tsx";
import { LocalTraffic } from "./LocalTraffic.tsx";

// §2 (Group A, Globe drag-to-orbit + zoom / auto-rotate): the button-click
// zoom and keyboard zoom both drive the same dolly OrbitControls itself uses
// for scroll (three-stdlib's dollyIn/dollyOut naming is the inverse of what
// it sounds like — dollyIn(x>1) zooms OUT, dollyOut(x>1) zooms IN, per
// Blueprint3D.tsx's own CameraRig, confirmed empirically there).
const ZOOM_STEP = 1.35;
const MIN_POLAR = 0.15;
const MAX_POLAR = Math.PI * 0.85;

// Same typing-target guard as Blueprint3D.tsx's CameraRig.
function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// §6.3 Tiers: "dots 6,000 / 2,500 / 1,200 by tier".
const TIER_DOT_COUNT: Record<1 | 2 | 3, number> = { 1: 6000, 2: 2500, 3: 1200 };

/**
 * Two per-frame/per-event scene seams sharing one component (both need
 * useThree()'s camera, neither renders anything, so they share one mount
 * instead of paying for two):
 *
 * - Writes the real subsolar point's CURRENT screen projection onto a plain
 *   DOM sibling (never React state - recomputes every frame, including
 *   while OrbitControls auto-rotates). `data-day-side` is which screen half
 *   currently faces the subsolar point, so e2e/globe.spec.ts can crop a
 *   day/night luma comparison from the CURRENT camera orientation.
 * - Keyboard zoom (§2): today there is no keyboard path into the globe's
 *   zoom at all (the Canvas is `role="img"`, correctly non-interactive to
 *   AT, but a sighted keyboard-only or switch-access visitor got nothing).
 *   `+`/`-` dolly the same distance a zoom-button click does. Arrow-key
 *   orbit is a natural follow-up but didn't fit this chunk's byte budget
 *   (check-budget.mjs) alongside it — see this lane's PR notes.
 */
function SceneRig({ now, probeRef, controlsRef }: { now: Date; probeRef: React.RefObject<HTMLDivElement | null>; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const controls = controlsRef.current;
      if (!controls) return;
      if (e.key === "+" || e.key === "=") controls.dollyOut(ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") controls.dollyIn(ZOOM_STEP);
      else return;
      e.preventDefault();
      controls.update();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controlsRef]);

  return null;
}

export interface GlobeSceneProps {
  now: Date;
  tier: 1 | 2 | 3;
  /** Bumped by GlobeHud's zoom-in pill (§2) — one dolly step per bump, same
   *  tick-count pattern Blueprint3D.tsx's CameraRig already uses. */
  zoomInTick?: number;
  /** Bumped by GlobeHud's zoom-out pill. */
  zoomOutTick?: number;
  /** The manual pause toggle in GlobeHud (§2, Auto-rotate row) — a visitor
   *  can permanently stop the spin without needing reduced-motion OS-wide. */
  autoRotatePaused?: boolean;
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
export function GlobeScene({ now, tier, zoomInTick = 0, zoomOutTick = 0, autoRotatePaused = false }: GlobeSceneProps) {
  const probeRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = useReducedMotion();
  const autoRotate = !reducedMotion && tier !== 3 && !autoRotatePaused;

  // Zoom-pill ticks — bump-and-consume, same pattern as Blueprint3D.tsx's
  // CameraRig (see its own comment on the dollyIn/dollyOut naming
  // inversion). netZoom collapses the in/out counters to one comparable
  // ref: a rising count is a zoom-in bump, a falling one is zoom-out.
  const netZoom = useRef(zoomInTick - zoomOutTick);
  useEffect(() => {
    const controls = controlsRef.current;
    const next = zoomInTick - zoomOutTick;
    if (!controls || next === netZoom.current) return;
    controls[next > netZoom.current ? "dollyOut" : "dollyIn"](ZOOM_STEP);
    netZoom.current = next;
    controls.update();
  }, [zoomInTick, zoomOutTick]);

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
          ref={controlsRef}
          enablePan={false}
          minDistance={9}
          maxDistance={26}
          minPolarAngle={MIN_POLAR}
          maxPolarAngle={MAX_POLAR}
          autoRotate={autoRotate}
          autoRotateSpeed={0.35}
          enableDamping
          // Matches Blueprint3D.tsx's own tuned value — three.js's default
          // (0.05) is noticeably looser/floatier than the feel every other
          // 3D scene in this app already has.
          dampingFactor={0.08}
        />
        <SceneRig now={now} probeRef={probeRef} controlsRef={controlsRef} />
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
