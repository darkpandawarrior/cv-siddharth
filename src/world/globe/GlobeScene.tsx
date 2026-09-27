import { useEffect, useRef, useState } from "react";
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
// zoom and keyboard zoom both drive the same dolly OrbitControls itself
// uses for scroll — same math as Blueprint3D.tsx's own CameraRig, copied
// (not imported: Blueprint3D's version is tour/reset-flight aware in a way
// this scene has no equivalent of) because it's the one already-tuned
// pattern for "orbit + zoom buttons + keyboard" in this codebase. Note
// three-stdlib's dollyIn/dollyOut naming is the inverse of what it sounds
// like — dollyIn(x>1) zooms OUT, dollyOut(x>1) zooms IN (Blueprint3D.tsx's
// own comment, confirmed empirically there).
const ZOOM_STEP = 1.35;
const ORBIT_STEP_RAD = 0.12;
const MIN_POLAR = 0.15;
const MAX_POLAR = Math.PI * 0.85;
// How long the ambient spin stays paused after a drag/zoom ends before it
// resumes — the "politely steps aside and comes back" yield (§2).
const AUTO_ROTATE_RESUME_MS = 2500;

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** True while any modal dialog (command palette, launcher, InstrumentView)
 *  is open — every one of them renders `aria-modal="true"`, so this needs no
 *  per-component wiring to stay in step with what's actually open. */
function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Keyboard orbit/zoom — a genuinely new a11y surface (§2): today there is no
 * keyboard path into the globe's orbit/zoom at all (the Canvas is
 * `role="img"`, correctly non-interactive to AT, but a sighted keyboard-only
 * or switch-access visitor got nothing). `+`/`-` dolly the same distance a
 * zoom-button click does; arrow keys orbit the camera around the current
 * look target via three's own Spherical helper — the already-installed
 * primitive for exactly this, rather than hand-rolling the same trig
 * `geoMath.ts` does for lat/lon placement (this is camera orbit, not sphere
 * placement, so Spherical is the closer-fitting stdlib tool).
 */
function KeyboardOrbit({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isModalOpen()) return;
      const controls = controlsRef.current;
      if (!controls) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        controls.dollyOut(ZOOM_STEP);
        controls.update();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        controls.dollyIn(ZOOM_STEP);
        controls.update();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        if (e.key === "ArrowLeft") spherical.theta += ORBIT_STEP_RAD;
        if (e.key === "ArrowRight") spherical.theta -= ORBIT_STEP_RAD;
        if (e.key === "ArrowUp") spherical.phi = Math.max(MIN_POLAR, spherical.phi - ORBIT_STEP_RAD);
        if (e.key === "ArrowDown") spherical.phi = Math.min(MAX_POLAR, spherical.phi + ORBIT_STEP_RAD);
        camera.position.setFromSpherical(spherical).add(controls.target);
        controls.update();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [camera, controlsRef]);
  return null;
}

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
  // §2, Auto-rotate row: a drag/zoom in progress (or its ~2.5s idle grace
  // period after) holds the ambient spin off, so it never fights the user's
  // own input mid-gesture — the same "yield to the user" idiom as
  // Blueprint3D.tsx's CameraRig, generalized from a one-shot flight-yield to
  // a resumable pause/resume.
  const [dragActive, setDragActive] = useState(false);
  const autoRotate = !reducedMotion && tier !== 3 && !autoRotatePaused && !dragActive;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    let idleTimer: number | undefined;
    const onStart = () => {
      window.clearTimeout(idleTimer);
      setDragActive(true);
    };
    const onEnd = () => {
      idleTimer = window.setTimeout(() => setDragActive(false), AUTO_ROTATE_RESUME_MS);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      window.clearTimeout(idleTimer);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, []);

  // Zoom-pill ticks — bump-and-consume, same pattern as Blueprint3D.tsx's
  // CameraRig (see its own comment on the dollyIn/dollyOut naming inversion).
  const lastZoomIn = useRef(zoomInTick);
  const lastZoomOut = useRef(zoomOutTick);
  useEffect(() => {
    if (zoomInTick === lastZoomIn.current) return;
    lastZoomIn.current = zoomInTick;
    controlsRef.current?.dollyOut(ZOOM_STEP);
    controlsRef.current?.update();
  }, [zoomInTick]);
  useEffect(() => {
    if (zoomOutTick === lastZoomOut.current) return;
    lastZoomOut.current = zoomOutTick;
    controlsRef.current?.dollyIn(ZOOM_STEP);
    controlsRef.current?.update();
  }, [zoomOutTick]);

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
        <KeyboardOrbit controlsRef={controlsRef} />
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
