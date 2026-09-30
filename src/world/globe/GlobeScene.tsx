import { GLOBE_DPR_MAX } from "../deviceTier.ts";
import { Suspense, lazy, useEffect, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SceneActivity, useReducedMotion } from "../../SceneActivity.tsx";
import { PUNE } from "../../lib/sky.ts";
import { latLonToXyz } from "./geoMath.ts";
import { createSceneProbe } from "./sceneProbe.ts";
import { EarthDots, GLOBE_RADIUS } from "./EarthDots.tsx";
import { Markers } from "./Markers.tsx";
import { sceneHandles, useGlobe, useSimNow } from "./globeStore.ts";
import { isXrayEnabled, subscribeXray } from "./layers/xrayState.ts";

// One lazy chunk per layer (living-earth plan): the Globe chunk stays the
// scene shell, and a layer a tier or a toggle never shows is never fetched.
// LiveDots/LocalTraffic are toggleable layers like every other lazy layer
// below (default-on, but gated the same way SkyLayer/SatelliteLayer already
// are) — the eager Globe chunk keeps the Earth and employer markers for
// first paint; the reach columns load alongside the other marker layers.
const ReachColumns = lazy(() => import("./ReachColumns.tsx").then((m) => ({ default: m.ReachColumns })));
const LiveDots = lazy(() => import("./LiveDots.tsx").then((m) => ({ default: m.LiveDots })));
const LocalTraffic = lazy(() => import("./LocalTraffic.tsx").then((m) => ({ default: m.LocalTraffic })));
const EarthImagery = lazy(() => import("./layers/EarthImagery.tsx"));
const SkyLayer = lazy(() => import("./layers/SkyLayer.tsx"));
const SatelliteLayer = lazy(() => import("./layers/SatelliteLayer.tsx"));
const PulseLayer = lazy(() => import("./layers/PulseLayer.tsx"));
const ArcLayer = lazy(() => import("./layers/ArcLayer.tsx"));
const BuoyLayer = lazy(() => import("./layers/BuoyLayer.tsx"));
const MeteorRadiant = lazy(() => import("./layers/MeteorRadiant.tsx"));
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
// WAVE 7 LANE V2 (city-light bloom): the globe's first composer, lazy so
// its postprocessing imports stay out of the Globe shell chunk.
const GlobePost = lazy(() => import("./layers/GlobePost.tsx"));
const DaylightLayer = lazy(() => import("./layers/DaylightLayer.tsx"));
// LANE C2 ("X-ray mode"): the tile-outline/renderer.info overlay — only
// meaningful alongside TileLayer.tsx (it reads that layer's own read-only
// `drawnTileSet` export), so it mounts under the identical condition as
// TileLayer below, with the X-ray toggle ANDed on top.
const XRayTiles = lazy(() => import("./layers/XRayTiles.tsx"));

declare global {
  interface Window {
    __GLOBE_TEST_GET_DRAW_CALLS__?: () => number;
  }
}
// Like sceneHandles, these counters belong to the one mounted globe canvas.
const frameStats = { calls: 0, triangles: 0 };
const EclipseLayer = lazy(() => import("./layers/EclipseLayer.tsx"));

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
const LEFT_SLOT_RESERVE_PX = 304;
// Below this width the layer panel and the inspector/tour slot are bottom
// sheets, not docked columns (Globe.tsx's own `sm` breakpoint) - the globe's
// screen centre never needs a horizontal nudge on phones.
const DOCKED_MIN_WIDTH = 640;
const H_OFFSET_HALF_LIFE = 0.25; // seconds - smooths the shift when a panel opens/closes

// Keep normalized offsets for CameraDirector, but restore the canvas aspect:
// setViewOffset(1, 1, ...) sets aspect to 1 as well as changing the frustum.
function frameCamera(camera: THREE.PerspectiveCamera, size: { width: number; height: number }, x: number, y: number) {
  camera.setViewOffset(1, 1, x, y, 1, 1);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
}

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
  const probe = useRef(createSceneProbe());
  useEffect(() => { probe.current.time(now); }, [now]);

  // Publish the camera and canvas for DOM-side raycasts (sceneHandles).
  useEffect(() => {
    const { camera: c, gl, scene, invalidate } = get();
    const autoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    sceneHandles.camera = c;
    sceneHandles.canvas = gl.domElement;
    sceneHandles.scene = scene;
    sceneHandles.invalidate = invalidate;
    // LANE C2 (X-ray mode e2e seam): completed-frame calls, readable
    // whether or not X-ray is actually mounted -- so e2e/globe-C2.spec.ts can
    // grade "toggling X-ray off removes its own draw call" against the real
    // renderer instead of against the debug card's own number, which would
    // only be proving X-ray agrees with itself. A no-op in production --
    // nothing outside a test ever calls it (same convention TileLayer.tsx's
    // own __GLOBE_TEST_* seams already use).
    window.__GLOBE_TEST_GET_DRAW_CALLS__ = () => frameStats.calls;
    return () => {
      gl.info.autoReset = autoReset;
      sceneHandles.camera = null;
      sceneHandles.canvas = null;
      sceneHandles.scene = null;
      sceneHandles.invalidate = null;
      window.__GLOBE_TEST_GET_DRAW_CALLS__ = undefined;
    };
  }, [get]);

  // Capture the completed frame, including every composer pass, before
  // clearing counters for the next frame's work. Readers share this snapshot.
  useFrame(({ gl }) => {
    Object.assign(frameStats, gl.info.render);
    gl.info.reset();
  }, -1000);

  useEffect(() => {
    if (framedForReal.current) return;
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
    frameCamera(cam, size, 0, offsetYRef.current);
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
      const rightReserve = s.panelOpen ? 249 : 50;
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
      frameCamera(camera as THREE.PerspectiveCamera, size, next, offsetYRef.current);
    }
    // Reduced motion uses demand rendering. Finish recentering without
    // waiting for another hover or live-feed update to request the next frame.
    if (Math.abs(next - targetOffsetX) > 1e-6) _state.invalidate();

    const el = probeRef.current;
    if (!el) return;
    probe.current.update(el.dataset, camera, size);
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

  useEffect(() => {
    const canvas = get().gl.domElement;
    const zoom = (event: Event) => {
      const controls = controlsRef.current;
      if (!controls || useGlobe.getState().view !== "orbit") return;
      event.preventDefault();
      controls.dollyOut(ZOOM_STEP);
      controls.update();
    };
    canvas.addEventListener("dblclick", zoom);
    // Native `dblclick` never fires for a touch double-tap (it is a mouse
    // event; Chromium/WebKit only synthesize it from an actual mouse device)
    // — W10D's own recheck note. `pointerup` fires for touch, mouse and pen
    // alike, so a manual two-tap-within-a-window/distance gate here covers
    // the touch case without duplicating the mouse one (a real mouse click
    // also fires `pointerup`, but its own native `dblclick` already zoomed
    // by the time this fires a second time, and dollying twice for one
    // mouse double-click is harmless — same end distance, OrbitControls
    // clamps at minDistance either way).
    let lastTap: { at: number; x: number; y: number } | null = null;
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const now = performance.now();
      const prev = lastTap;
      lastTap = { at: now, x: event.clientX, y: event.clientY };
      if (prev && now - prev.at < 350 && Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 40) {
        lastTap = null;
        zoom(event);
      }
    };
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("dblclick", zoom);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [controlsRef, get]);

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
  const xrayOn = useSyncExternalStore(subscribeXray, isXrayEnabled, () => false);
  const count = TIER_DOT_COUNT[tier];
  const imagery = style === "imagery" && tier !== 3;
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
        dpr={[1, GLOBE_DPR_MAX[tier]]}
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
            <Suspense fallback={null}><ReachColumns /></Suspense>
            <Markers occlude={[earthRef]} />
          </>
        )}
        {layers.presence && live && (
          <Suspense fallback={null}>
            <LiveDots tier={tier} occlude={[earthRef]} />
          </Suspense>
        )}
        {layers.aircraft && live && tier !== 3 && (
          <Suspense fallback={null}>
            <LocalTraffic tier={tier} />
          </Suspense>
        )}
        {/* Separate boundaries: one slow chunk never holds up another. */}
        <Suspense fallback={null}>{layers.stars && <><SkyLayer now={now} tier={tier} /><MeteorRadiant now={now} tier={tier} /></>}</Suspense>
        <Suspense fallback={null}>{layers.satellites && <SatelliteLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.pulses && live && <PulseLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.presence && live && <ArcLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.buoys && <BuoyLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.hazards && <HazardLayer now={now} tier={tier} />}</Suspense>
        {/* Wind is a nowcast: like the other live feeds it hides off "now". */}
        <Suspense fallback={null}>{layers.wind && live && tier !== 3 && <WindLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.reach && <ReachLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.guide && <GuideLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{imagery && cloudsOn && <CloudShell now={now} tier={tier} earthRef={earthRef} />}</Suspense>
        <Suspense fallback={null}>{layers.countries && <CountryLayer tier={tier} />}</Suspense>
        <Suspense fallback={null}>{layers.together && live && tier !== 3 && <TogetherLayer tier={tier} />}</Suspense>
        {/* Wave 6 seams: replay (renders only off "now"), story arcs (only while
            a story plays), density columns (toggle). */}
        <Suspense fallback={null}>{layers.hazards && <HistoryLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>
          {storyArcsOn && <StoryArc tier={tier} />}
        </Suspense>
        <Suspense fallback={null}>{layers.density && tier !== 3 && <HexbinLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{imagery && <TileLayer now={now} tier={tier} earthRef={earthRef} />}</Suspense>
        {/* WAVE 7 LANE V2: city-light bloom, tier 1/2 imagery only — tier 3
            (and the dot-matrix style) never mount a composer at all. */}
        <Suspense fallback={null}>{imagery && <GlobePost tier={tier} />}</Suspense>
        {/* LANE C4 ("Living daylight"): the golden-hour and waking bands,
            drawn from the same subsolar point the terminator uses -- kept at
            every tier (the brief's own "tier 3 draws the bands only" caps
            what tier 3 gets, it never turns the layer off). */}
        <Suspense fallback={null}>{layers.daylight && <DaylightLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>{imagery && xrayOn && <XRayTiles frameStats={frameStats} />}</Suspense>
        <Suspense fallback={null}>{layers.eclipse && <EclipseLayer now={now} tier={tier} />}</Suspense>
        <Suspense fallback={null}>
          {/* LANE I2 fix: the HUD zoom-in pill is a real "get closer" intent,
              same as a wheel notch or a pinch (cameraZoomGate.ts's own
              header) -- CameraDirector needs the tick to register it, since
              this effect above drives the dolly directly rather than
              through a DOM wheel event CameraDirector could observe. */}
          <CameraDirector controlsRef={controlsRef} zoomInTick={zoomInTick} />
        </Suspense>
      </Canvas>
    </>
  );
}
