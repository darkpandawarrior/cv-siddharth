import { Suspense, lazy, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SceneActivity, useReducedMotion } from "../../SceneActivity.tsx";
import { PUNE, subsolarPoint } from "../../lib/sky.ts";
import { latLonToXyz } from "./geoMath.ts";
import { EarthDots, GLOBE_RADIUS } from "./EarthDots.tsx";
import { ReachColumns } from "./ReachColumns.tsx";
import { Markers } from "./Markers.tsx";
import { LiveDots } from "./LiveDots.tsx";
import { LocalTraffic } from "./LocalTraffic.tsx";
import { sceneHandles, useGlobe, useSimNow } from "./globeStore.ts";

// One lazy chunk per layer (living-earth plan): the Globe chunk stays the
// scene shell, and a layer a tier or a toggle never shows is never fetched.
const EarthImagery = lazy(() => import("./layers/EarthImagery.tsx"));
const SkyLayer = lazy(() => import("./layers/SkyLayer.tsx"));
const SatelliteLayer = lazy(() => import("./layers/SatelliteLayer.tsx"));
const PulseLayer = lazy(() => import("./layers/PulseLayer.tsx"));
const ArcLayer = lazy(() => import("./layers/ArcLayer.tsx"));
const HazardLayer = lazy(() => import("./layers/HazardLayer.tsx"));
const CameraDirector = lazy(() => import("./CameraDirector.tsx"));
const TileLayer = lazy(() => import("./layers/TileLayer.tsx"));
const WindLayer = lazy(() => import("./layers/WindLayer.tsx"));
const ReachLayer = lazy(() => import("./layers/ReachLayer.tsx"));
const CloudShell = lazy(() => import("./layers/CloudShell.tsx"));
const CountryLayer = lazy(() => import("./layers/CountryLayer.tsx"));
const TogetherLayer = lazy(() => import("./layers/TogetherLayer.tsx"));
const HistoryLayer = lazy(() => import("./layers/HistoryLayer.tsx"));
const StoryArc = lazy(() => import("./layers/StoryArc.tsx"));
const HexbinLayer = lazy(() => import("./layers/HexbinLayer.tsx"));
const GuideLayer = lazy(() => import("./layers/GuideLayer.tsx"));

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

// §6.3 Tiers named 6,000 / 2,500 / 1,200; at 6,000 the land came out as
// ~1,750 dots four diameters apart, which read as noise rather than
// continents. Flat discs (EarthDots.tsx) make this density cheaper to draw
// than the old count was.
const TIER_DOT_COUNT: Record<1 | 2 | 3, number> = { 1: 16000, 2: 8000, 3: 3500 };

// The opening view: over Pune, tilted 12 degrees north so the reach columns
// stand up off the surface instead of pointing straight down the lens. The
// distance here is only the first frame's; SceneRig re-frames on mount.
const START = latLonToXyz(PUNE.lat + 12, PUNE.lon);
const START_DISTANCE = 26;
// Framing on the golden ratio: the globe's diameter is 1/phi of the canvas
// height, and its centre sits on the upper golden section (38.2% down) by
// shifting the frustum, not the orbit centre. That line also clears
// GlobePanel's fact list along the bottom edge.
const PHI = (1 + Math.sqrt(5)) / 2;
const LIFT = 0.5 - 1 / PHI ** 2;

/**
 * Two per-frame/per-event scene seams sharing one component (both need
 * useThree()'s camera, neither renders anything, so they share one mount
 * instead of paying for two):
 *
 * - Writes the real subsolar point's CURRENT screen projection onto a plain
 *   DOM sibling (never React state - recomputes every frame, including
 *   while OrbitControls auto-rotates). `data-day-side` is which half of the
 *   globe's screen disk (`data-globe-x/y/r`) faces the subsolar point, so
 *   e2e/globe.spec.ts can crop a day/night luma comparison from the CURRENT
 *   camera orientation.
 * - Keyboard zoom (§2): today there is no keyboard path into the globe's
 *   zoom at all (the Canvas is `role="img"`, correctly non-interactive to
 *   AT, but a sighted keyboard-only or switch-access visitor got nothing).
 *   `+`/`-` dolly the same distance a zoom-button click does. Arrow-key
 *   orbit is a natural follow-up but didn't fit this chunk's byte budget
 *   (check-budget.mjs) alongside it — see this lane's PR notes.
 */
// LANE U1 (composition): sm+ only - the right LayerPanel column and the
// shared left slot (Inspector / the tour's running card) each reserve this
// much screen width, in pixels, matching Globe.tsx's own PANEL_RESERVE_*/
// left-slot constants (288px card + 16px edge). Duplicated as plain numbers
// rather than imported - Globe.tsx's constants are Tailwind class strings,
// and this file may only touch SceneRig, not add a shared-constants module.
const PANEL_RESERVE_PX = { open: 249, collapsed: 50 };
const LEFT_SLOT_RESERVE_PX = 304;
// Below this width the layer panel and the inspector/tour slot are bottom
// sheets, not docked columns (Globe.tsx's own `sm` breakpoint) - the globe's
// screen centre never needs a horizontal nudge on phones.
const DOCKED_MIN_WIDTH = 640;
const H_OFFSET_HALF_LIFE = 0.25; // seconds - smooths the shift when a panel opens/closes

function SceneRig({
  now,
  probeRef,
  controlsRef,
  topOffsetPx,
}: {
  now: Date;
  probeRef: React.RefObject<HTMLDivElement | null>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** LANE U1: the topbar's real measured height in pixels (Globe.tsx's own
   *  ResizeObserver) - portrait's vertical reserve tracks this instead of a
   *  guessed constant, since the topbar wraps to 1-3 rows depending on
   *  viewport width and content (Pune pill, zoom controls, sheet icons).
   *  `null` before the first measurement lands. */
  topOffsetPx: number | null;
}) {
  const { camera, size } = useThree();
  const get = useThree((s) => s.get);
  // useFrame re-applies the SAME-or-animated value every frame alongside the
  // horizontal offset, since setViewOffset takes both axes in one call.
  const offsetYRef = useRef(0);
  const hOffsetRef = useRef(0);
  // Framing (both `r`, which sets camera DISTANCE via position.setLength,
  // and the vertical offset) only ever applies twice: once at mount with a
  // guessed portrait reserve (so there's something on screen immediately),
  // once for real once Globe.tsx's ResizeObserver hands back the topbar's
  // actual height - then never again, so a later reflow (say, the weather
  // pill's text arriving and rewrapping the row) can't snap a visitor's own
  // zoom back out from under them.
  const framedForReal = useRef(false);

  // Publish the camera and canvas for DOM-side raycasts (sceneHandles).
  useEffect(() => {
    const { camera: c, gl, scene, invalidate } = get();
    sceneHandles.camera = c;
    sceneHandles.canvas = gl.domElement;
    sceneHandles.scene = scene;
    sceneHandles.invalidate = () => invalidate();
    return () => {
      sceneHandles.camera = null;
      sceneHandles.canvas = null;
      sceneHandles.scene = null;
      sceneHandles.invalidate = null;
    };
  }, [get]);

  useEffect(() => {
    if (framedForReal.current && topOffsetPx == null) return;
    // Read through get(): the camera is three's own mutable object, and
    // framing it IS the point of this effect.
    const { camera: c, size } = get();
    const cam = c as THREE.PerspectiveCamera;
    const portrait = size.width < size.height;
    let r: number;
    let offsetY: number;
    if (portrait) {
      // Phones: the fact list is flow content BELOW the stage now (Globe.tsx,
      // LANE U1's own composition rewrite), not an overlay over the canvas's
      // bottom half the way it is on sm+ - so the only real reserve here is
      // the topbar floating over the canvas's TOP. A fixed 0.225 predates
      // that rewrite and was tuned for the old bottom-overlay layout; it
      // left only a few px of headroom, which a topbar wrapped to 2-3 rows
      // (a narrow phone, or the ISS tooltip/panel text) ate into (caught by
      // e2e/globe-U1.spec.ts's overlap test). +12px margin below the topbar,
      // capped at 45% of the canvas so an unexpectedly tall topbar still
      // leaves a globe worth looking at rather than a sliver.
      const topReserve = Math.min(0.45, ((topOffsetPx ?? size.height * 0.225) + 12) / size.height);
      const free = 1 - topReserve;
      r = Math.min(0.25, free / 2);
      // Centred in the free band below the topbar, not at a fixed 27.5% -
      // see the NDC derivation in this lane's PR notes: increasing
      // setViewOffset's y pushes screen content UP (`top -= offsetY*height`
      // in three's own PerspectiveCamera.updateProjectionMatrix), so
      // clearing the TOP needs a SMALLER (often negative) offsetY, not a
      // larger one - the fraction down from the canvas top is `0.5 - offsetY`.
      offsetY = 0.5 - (topReserve + free / 2);
    } else {
      // Landscape (sm+): unchanged - GlobePanel's fact list really does
      // overlay the canvas's bottom 45% here (Globe.tsx's `sm:absolute
      // sm:max-h-[45%]`), which LIFT already clears.
      r = Math.min(1 / (2 * PHI), (0.9 * size.width) / size.height / 2);
      offsetY = LIFT;
    }
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    cam.position.setLength(GLOBE_RADIUS / Math.sin(Math.atan(2 * r * tanHalf)));
    offsetYRef.current = offsetY;
    // Fractions (a 1x1 "full" view), so the lift survives R3F's own resize
    // handling. setViewOffset also sets aspect to fullWidth/fullHeight, i.e.
    // 1, which stretched the globe sideways until the real aspect went back.
    cam.setViewOffset(1, 1, 0, offsetYRef.current, 1, 1);
    cam.aspect = size.width / size.height;
    cam.updateProjectionMatrix();
    if (topOffsetPx != null) framedForReal.current = true;
  }, [get, topOffsetPx]);

  useFrame((_state, dt) => {
    // Horizontal re-centring (task 2): the globe's screen centre sits in the
    // free region between the left slot and the right panel column, docked
    // sm+ only. `setViewOffset`'s x-offset shifts the rendered frustum
    // window RIGHT by that fraction, which moves an object fixed at world
    // centre LEFT on screen (three.js's PerspectiveCamera.updateProjection
    // Matrix adds `offsetX * width / fullWidth` to the frustum's left
    // bound - a larger left bound shifts the whole window right, so a
    // world-centre object now sits closer to the window's left edge).
    // rightReserve > leftReserve should therefore give a POSITIVE offsetX
    // (push the globe left, away from the wider right reservation) -
    // verified against screenshots at panel-open vs panel-collapsed
    // (globe visibly sits further right once the right panel collapses).
    const docked = size.width >= DOCKED_MIN_WIDTH;
    let targetOffsetX = 0;
    if (docked) {
      const s = useGlobe.getState();
      const rightReserve = s.panelOpen ? PANEL_RESERVE_PX.open : PANEL_RESERVE_PX.collapsed;
      const leftReserve = s.selected || s.tourStep !== null ? LEFT_SLOT_RESERVE_PX : 0;
      targetOffsetX = (rightReserve - leftReserve) / (2 * size.width);
    }
    const k = 1 - 0.5 ** (dt / H_OFFSET_HALF_LIFE);
    const next = hOffsetRef.current + (targetOffsetX - hOffsetRef.current) * k;
    hOffsetRef.current = next;
    // Only pay for a matrix recompute while an offset is actually in play -
    // once it has decayed back to (near) zero and the target is zero too
    // (phones, or every panel closed with nothing selected), there is
    // nothing left to animate. offsetYRef itself is static between the
    // mount-time effect's two framings (see its own comment) - re-applied
    // here unchanged because setViewOffset takes both axes in one call.
    if (Math.abs(next) > 1e-6 || Math.abs(targetOffsetX) > 1e-6) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.setViewOffset(1, 1, next, offsetYRef.current, 1, 1);
      cam.updateProjectionMatrix();
    }

    const el = probeRef.current;
    if (!el) return;
    const toScreen = (v: THREE.Vector3) => {
      v.project(camera);
      return [(v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height];
    };
    const sub = subsolarPoint(now);
    const p = latLonToXyz(sub.lat, sub.lon);
    const [x, y] = toScreen(new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(GLOBE_RADIUS));
    // The globe's own screen disk: the view is lifted off the canvas centre,
    // so day/night halves are split at the globe's centre, not the canvas's.
    const [cx, cy] = toScreen(new THREE.Vector3());
    const [ex] = toScreen(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(GLOBE_RADIUS));
    const dx = x - cx;
    const dy = y - cy;
    el.dataset.subsolarX = String(Math.round(x));
    el.dataset.subsolarY = String(Math.round(y));
    el.dataset.globeX = String(Math.round(cx));
    el.dataset.globeY = String(Math.round(cy));
    el.dataset.globeR = String(Math.round(Math.abs(ex - cx)));
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
  /** LANE U1: Globe.tsx's measured topbar height in pixels, portrait only -
   *  see SceneRig's own comment on why this replaced a fixed fraction. */
  topOffsetPx?: number | null;
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
export function GlobeScene({ now: realNow, tier, zoomInTick = 0, zoomOutTick = 0, autoRotatePaused = false, topOffsetPx = null }: GlobeSceneProps) {
  const probeRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // The ocean sphere, handed to every <Html> callout as its occluder so a
  // label on the far side hides instead of floating over the globe.
  const earthRef = useRef<THREE.Mesh>(null!);
  const reducedMotion = useReducedMotion();
  // Orbit view only: ground and follow views hand the camera to
  // CameraDirector, and a spinning orbit would fight it.
  const view = useGlobe((s) => s.view);
  const autoRotate = !reducedMotion && tier !== 3 && !autoRotatePaused && view === "orbit";
  const style = useGlobe((s) => s.style);
  const layers = useGlobe((s) => s.layers);
  const cloudsOn = useGlobe((s) => s.cloudsOn);
  const storyArcsOn = useGlobe((s) => s.storyArcsOn);
  // Live feeds cannot time-travel: while the scrubber is off "now" they hide
  // rather than draw a present-tense reading against a past sky.
  const live = useGlobe((s) => s.timeOffsetMin === 0);
  const now = useSimNow(realNow);
  const count = TIER_DOT_COUNT[tier];
  const dotsEarth = <EarthDots count={count} now={now} earthRef={earthRef} />;

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
        camera={{ position: [START.x * START_DISTANCE, START.y * START_DISTANCE, START.z * START_DISTANCE], fov: 42 }}
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
          rotateSpeed={0.5}
          minDistance={9}
          maxDistance={42}
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
        <SceneRig now={now} probeRef={probeRef} controlsRef={controlsRef} topOffsetPx={topOffsetPx} />
        {style === "imagery" ? (
          <Suspense fallback={dotsEarth}>
            <EarthImagery count={count} now={now} tier={tier} earthRef={earthRef} />
          </Suspense>
        ) : (
          dotsEarth
        )}
        {layers.markers && (
          <>
            <ReachColumns />
            <Markers occlude={[earthRef]} />
          </>
        )}
        {layers.presence && live && <LiveDots tier={tier} occlude={[earthRef]} />}
        {layers.aircraft && live && tier !== 3 && <LocalTraffic tier={tier} />}
        {/* Separate boundaries: one slow chunk never holds up another. */}
        <Suspense fallback={null}>{layers.stars && <SkyLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.satellites && <SatelliteLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.pulses && live && <PulseLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.presence && live && <ArcLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.hazards && <HazardLayer now={now} tier={tier} />}</Suspense>
        {/* Wind is a nowcast: like the other live feeds it hides off "now". */}
        <Suspense fallback={null}>{layers.wind && live && tier !== 3 && <WindLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.reach && <ReachLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.guide && <GuideLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{style === "imagery" && cloudsOn && tier !== 3 && <CloudShell now={now} tier={tier} earthRef={earthRef} />}</Suspense>
        <Suspense fallback={null}>{layers.countries && <CountryLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.together && live && tier !== 3 && <TogetherLayer tier={tier} />}</Suspense>
        {/* Wave 6 seams: replay (renders only off "now"), story arcs (only while
            a story plays), density columns (toggle). */}
        <Suspense fallback={null}>{layers.hazards && <HistoryLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>
          {storyArcsOn && <StoryArc tier={tier} />}
        </Suspense>
        <Suspense fallback={null}>{layers.density && tier !== 3 && <HexbinLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{style === "imagery" && tier !== 3 && <TileLayer now={now} tier={tier} earthRef={earthRef} />}</Suspense>
        <Suspense fallback={null}>
          <CameraDirector controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </>
  );
}
