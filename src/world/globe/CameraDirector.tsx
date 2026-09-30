import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PUNE, subsolarPoint } from "../../lib/sky.ts";
import {
  dampTowards,
  easeInOutCubic,
  flyPosition,
  GLOBE_RADIUS,
  groundLookDirection,
  groundPosition,
  latLonToXyz,
  vDot,
  xyzToLatLon,
  type Vec3,
} from "./cameraMath.ts";
import { finishIntro, getIntroPhase, INTRO_DURATION_MS, introStartDirectionFromLatLon, subscribeIntro, type IntroPhase } from "./cameraIntro.ts";
import { altitudeToStreetZoom, armStreetHandoff, clampCameraFrameDelta, stepZoomHold, ZOOM_HOLD_MS } from "./cameraZoomGate.ts";
import { cameraForwardToBearingPitch } from "./cameraOrientation.ts";
import { entityPositions, useGlobe, type Focus } from "./globeStore.ts";

/** LANE L5 (navigation: fly-to, ground view, follow). One component owns the
 *  camera whenever the view isn't a free "orbit": it disables OrbitControls
 *  and drives `camera` directly in useFrame, restoring the controls exactly
 *  when a view hands back to "orbit" (never leaves a stale near/far/fov or
 *  a disabled OrbitControls behind). */

const FLY_SECONDS = 1.1;
// Three's own PerspectiveCamera defaults (GlobeScene.tsx sets neither), and
// the fov GlobeScene opens the Canvas with -- what "restore exactly" restores
// to when a view hands back to orbit.
const ORBIT_NEAR = 0.1;
const ORBIT_FAR = 2000;
const ORBIT_FOV = 42;
// Ground view: near/far suited to standing at the surface looking at a sky
// that may hold stars thousands of units out (SkyLayer, a sibling lane).
const GROUND_NEAR = 0.01;
const GROUND_FAR = 4000;
const GROUND_EYE_HEIGHT = GLOBE_RADIUS * 0.004; // just above the dot/ocean shell, reads as "standing on it"
const FOV_MIN = 30;
const FOV_MAX = 90;
const YAW_SPEED = 0.006; // radians per pixel of drag
const PITCH_SPEED = 0.006;
const FOV_WHEEL_SPEED = 0.06; // degrees per wheel-delta unit
// Follow view: a fixed offset behind (opposite the entity's own heading) and
// above (further from the globe's centre) so a moving entity sits ahead of
// centre-frame rather than dead centre.
const FOLLOW_ABOVE = 0.35;
const FOLLOW_BEHIND = 0.55;
const FOLLOW_DAMP_HALFLIFE = 0.25;

type Flight = { from: Vec3; fromDist: number; to: Vec3; toDist: number; elapsed: number; duration: number; kind?: "intro" } | null;

// WAVE 6 LANE X5: intro cinematic camera path. END matches GlobeScene.tsx's
// own hardcoded `START`/`START_DISTANCE` (duplicated here -- same
// chunk-isolation reason cameraMath.ts's own header gives for not importing
// geoMath.ts: GlobeScene.tsx is the eager "Globe" shell, this file is a lazy
// chunk) so the flight lands exactly where the resting orbit camera already
// sits -- no visible jump when the intro finishes or is skipped.
const INTRO_END_LAT_OFFSET = 12;
const INTRO_END_DISTANCE = 26;
const INTRO_START_DISTANCE = GLOBE_RADIUS * 30; // far enough Earth reads as a small lit crescent, not a close-up
const INTRO_DURATION_SEC = INTRO_DURATION_MS / 1000;

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// Restated from SceneActivity.tsx's own useReducedMotion (not imported):
// SceneActivity.tsx has exactly one other consumer (GlobeScene.tsx, eagerly
// bundled into the "Globe" shell), and importing it here would give it a
// second, differently-chunked consumer -- the same chunk-promotion problem
// documented at the top of cameraMath.ts, measured to grow the shell chunk
// past check-budget.mjs's ceiling. Same query, same fallback, same shape.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void): () => void {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function useReducedMotionLocal(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION_QUERY).matches, () => false);
}

/** Where a Focus resolves to on the sphere, in (direction, distance) form --
 *  the two things a flight interpolates. `entity` focuses resolve through
 *  entityPositions at call time (a snapshot; follow view re-reads every
 *  frame instead of relying on this one-off resolution). */
function resolveFocusDirDist(focus: Focus | null, fallbackDir: Vec3, fallbackDist: number): { dir: Vec3; dist: number } {
  if (!focus) return { dir: fallbackDir, dist: fallbackDist };
  if (focus.kind === "latlon") {
    const p = latLonToXyz(focus.lat, focus.lon);
    return { dir: p, dist: focus.distance ?? fallbackDist };
  }
  const getter = entityPositions.get(focus.id);
  const p = getter?.();
  if (!p) return { dir: fallbackDir, dist: fallbackDist };
  const d = { x: p.x, y: p.y, z: p.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { dir: { x: d.x / len, y: d.y / len, z: d.z / len }, dist: len };
}

export default function CameraDirector({
  controlsRef,
  zoomInTick = 0,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  /** GlobeHud's zoom-in pill (bumped in Globe.tsx, threaded through
   *  GlobeScene.tsx's own `zoomInTick` prop) -- a real zoom-in intent that
   *  drives OrbitControls' dolly directly rather than through a DOM wheel
   *  event, so it can't be picked up by this component's own wheel/pinch
   *  listeners below. */
  zoomInTick?: number;
}) {
  // Read through get() at the point of use (GlobeScene.tsx's own SceneRig
  // does the same) rather than destructuring `camera`/`gl` here: React
  // Compiler treats a value destructured straight off a hook's return as
  // permanently read-only, which the whole point of this component --
  // mutating the live three.js camera every frame -- would violate on every
  // line. `get()`'s return is a fresh read each call, not "the hook's
  // value", so mutating what it hands back raises nothing.
  const get = useThree((s) => s.get);
  const reducedMotion = useReducedMotionLocal();
  const view = useGlobe((s) => s.view);
  const focus = useGlobe((s) => s.focus);
  const setView = useGlobe((s) => s.setView);

  const flightRef = useRef<Flight>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0.35); // starts looking a little above the horizon, not flat along it
  const fovRef = useRef(ORBIT_FOV);
  const followPosRef = useRef<Vec3 | null>(null);
  const prevEntityPosRef = useRef<Vec3 | null>(null);
  const settledRef = useRef(true); // false while a fly-in animation owns the camera
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  // WAVE 6 LANE X5: ms the camera has sat pinned at minDistance while
  // orbiting (seamless zoom -> street), whether the intro's own flight
  // currently owns the camera, and whether this lane hid the markers layer
  // for the intro's "markers last" beat (so it can restore it unconditionally).
  const zoomHoldRef = useRef(0);
  // Most recent discrete zoom-in input: wheel, growing pinch or pill/keyboard click.
  // A held pill has its own pointer lifetime and needs no repeated events.
  // Resting at the floor with neither kind of intent must never open street view.
  const zoomIntentRef = useRef(-Infinity);
  const zoomPillPointerRef = useRef<number | null>(null);
  const pinchSpanRef = useRef<number | null>(null);
  const prevZoomInTickRef = useRef(zoomInTick);
  const introRef = useRef(false);
  const introMarkersHiddenRef = useRef(false);
  const prevViewRef = useRef(view);
  const focusOffsetY = useRef<number | null>(null);

  // Horizon glow ring: ambient scene furniture, never a brand/live colour
  // (house rule: "ambient things never use brand tokens"). A warm, dim band
  // just above the ground-view stand point so the ground plane reads as a
  // horizon rather than the camera floating in a starfield.
  const horizonRef = useRef<THREE.Mesh>(null);

  // xyzToLatLon of the ground-view target, read by useFrame's ground-view
  // branch every frame. Ref, not state: written only from the effect below.
  const groundLatLon = useRef<{ lat: number; lon: number }>({ lat: PUNE.lat, lon: PUNE.lon });

  // Arm a new flight whenever the store hands this component a new target:
  // a focus change (click-to-fly), or a view switch away from orbit (the
  // camera needs to travel to the ground/follow stand point first). Orbit
  // <- ground/follow does NOT re-arm a flight: OrbitControls already has a
  // valid camera pose to resume from, and re-flying it back would fight
  // whatever the visitor was doing a moment before.
  useEffect(() => {
    const prevView = prevViewRef.current;
    prevViewRef.current = view;
    const controls = controlsRef.current;
    const { camera } = get();

    if (view === "orbit") {
      if (controls) {
        controls.enabled = true;
        camera.near = ORBIT_NEAR;
        camera.far = ORBIT_FAR;
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = ORBIT_FOV;
          camera.updateProjectionMatrix();
        }
        controls.update();
      }
      settledRef.current = true;
      flightRef.current = null;
      return;
    }

    if (controls) controls.enabled = false;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = view === "ground" ? GROUND_NEAR : ORBIT_NEAR;
      camera.far = view === "ground" ? GROUND_FAR : ORBIT_FAR;
      camera.fov = fovRef.current;
      camera.updateProjectionMatrix();
    }

    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const fromDist = Math.hypot(from.x, from.y, from.z) || GLOBE_RADIUS;
    const fromDir = fromDist > 0 ? { x: from.x / fromDist, y: from.y / fromDist, z: from.z / fromDist } : { x: 1, y: 0, z: 0 };

    let toDir: Vec3;
    let toDist: number;
    if (view === "ground") {
      const target = focus?.kind === "latlon" ? focus : { kind: "latlon" as const, lat: PUNE.lat, lon: PUNE.lon };
      toDir = latLonToXyz(target.lat, target.lon);
      toDist = GLOBE_RADIUS + GROUND_EYE_HEIGHT;
      const ll = xyzToLatLon(toDir);
      yawRef.current = 0;
      pitchRef.current = 0.35;
      // Stash resolved lat/lon on the ref-held flight so useFrame's ground
      // branch doesn't need to re-derive it from a direction vector once
      // the flight has landed.
      groundLatLon.current = ll;
    } else {
      // follow: fly toward wherever the entity is RIGHT NOW; useFrame takes
      // over tracking once settled.
      const resolved = resolveFocusDirDist(focus, fromDir, fromDist + FOLLOW_ABOVE);
      toDir = resolved.dir;
      toDist = resolved.dist + FOLLOW_ABOVE;
      followPosRef.current = null;
      prevEntityPosRef.current = null;
    }

    if (reducedMotion || prevView === view) {
      // Either an instant jump (reduced motion), or the same view re-armed
      // by a focus change while already there (e.g. tour steps 4->4-ish) --
      // both skip the travelling animation and land directly.
      camera.position.set(toDir.x * toDist, toDir.y * toDist, toDir.z * toDist);
      settledRef.current = true;
      flightRef.current = null;
    } else {
      flightRef.current = { from: fromDir, fromDist, to: toDir, toDist, elapsed: 0, duration: FLY_SECONDS };
      settledRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controlsRef/get are stable R3F handles, not reactive inputs
  }, [view, focus, reducedMotion]);

  // Also fly (without a view switch) whenever `focus` changes while already
  // in orbit view -- the plain click-to-fly case. Handled in the same
  // effect above via the `view === "orbit"` early return NOT covering a
  // focus-only change: split out below so orbit's own focus changes still
  // animate the camera around the fixed OrbitControls target.
  useEffect(() => {
    if (view !== "orbit" || !focus) return;
    const { camera } = get();
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const fromDist = Math.hypot(from.x, from.y, from.z) || GLOBE_RADIUS;
    const fromDir = { x: from.x / fromDist, y: from.y / fromDist, z: from.z / fromDist };
    const resolved = resolveFocusDirDist(focus, fromDir, fromDist);
    if (reducedMotion) {
      camera.position.set(resolved.dir.x * resolved.dist, resolved.dir.y * resolved.dist, resolved.dir.z * resolved.dist);
      flightRef.current = null;
      settledRef.current = true;
      // OrbitControls caches its own spherical offset from `target` and
      // only re-derives it from `camera.position` lazily; setting position
      // directly (its usual path is dragging, which it observes) leaves
      // that cache stale, and its own per-frame update() (drei's own
      // useFrame, damping-driven, independent of this component's) then
      // re-applies the STALE cache and silently snaps the camera straight
      // back to wherever it was a moment ago. Sync it immediately so this
      // jump is durable instead of visible for one frame and gone.
      controlsRef.current?.update();
    } else {
      flightRef.current = { from: fromDir, fromDist, to: resolved.dir, toDist: resolved.dist, elapsed: 0, duration: FLY_SECONDS };
      settledRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-arm on an actual focus identity change, get() is stable
  }, [focus]);

  // Search and the HUD finish laying out independently of a fly-to. Keep
  // the focused phone target below both even when that layout arrives late.
  useEffect(() => {
    focusOffsetY.current = null;
    if (view !== "orbit" || !focus) return;
    const canvas = get().gl.domElement;
    const search = document.querySelector("[data-explore-bar]");
    const topbar = document.querySelector("[data-globe-topbar]");
    const update = () => {
      const box = canvas.getBoundingClientRect();
      const clearTop = Math.max(box.top, search?.getBoundingClientRect().bottom ?? box.top, topbar?.getBoundingClientRect().bottom ?? box.top) + 12;
      focusOffsetY.current = box.width < 640 && clearTop < box.bottom
        ? 0.5 - ((clearTop + box.bottom) / 2 - box.top) / box.height : null;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    if (search) observer.observe(search);
    if (topbar) observer.observe(topbar);
    return () => { observer.disconnect(); focusOffsetY.current = null; };
  }, [focus, view, get]);

  // WAVE 6 LANE X5: the cinematic first-visit intro. ui/Intro.tsx (a DOM
  // overlay mounted OUTSIDE the Canvas -- see cameraIntro.ts's own header
  // for why) is the only place that knows tier/reducedMotion/the seen-flag,
  // and decides WHETHER to play; this effect just answers "playing" by
  // flying the camera from a far, sun-facing start to the app's own resting
  // view, and answers "skipped"/"done" by snapping straight there and
  // handing the camera back to OrbitControls. Mount-only: the phase bus
  // itself is the source of truth (`applyPhase(getIntroPhase())` covers
  // whichever of this effect or ui/Intro.tsx's own `startIntro()` call runs
  // first), not a dependency array.
  useEffect(() => {
    const applyPhase = (phase: IntroPhase) => {
      const controls = controlsRef.current;
      const { camera } = get();
      if (phase === "playing") {
        // A duplicate "playing" notification with the flight already armed
        // is a no-op, not a reason to bail -- StrictMode's dev-only double
        // effect invocation re-runs this exact mount body (cleanup only
        // unsubscribes; introRef itself survives) with `phase` unchanged at
        // "playing", so this is the ordinary case, not a race. Confirmed via
        // this component's own console.log("[intro-debug]") trace, which
        // showed finishIntro() firing under 1s into a fresh mount, from
        // right here.
        if (introRef.current) return;
        // Belt and braces (house idiom, this file's own Esc-handler
        // comment): ui/Intro.tsx already gates on tier/reducedMotion before
        // ever calling startIntro(), but "never under reduced motion" is a
        // hard MUST, worth a second, independent check rather than trusting
        // a single source -- a fresh matchMedia read, not the closed-over
        // `reducedMotion` (stale in a mount-only effect). A view other than
        // "orbit" here means the visitor already navigated before the bus
        // notified (a slow-mount race): playing a fly-in over their own
        // navigation would be worse than skipping the cinematic outright.
        if (window.matchMedia(REDUCED_MOTION_QUERY).matches || useGlobe.getState().view !== "orbit") {
          finishIntro();
          return;
        }
        introRef.current = true;
        if (controls) controls.enabled = false;
        const sun = subsolarPoint(new Date());
        const endDir = latLonToXyz(PUNE.lat + INTRO_END_LAT_OFFSET, PUNE.lon);
        const fromDir = introStartDirectionFromLatLon(sun.lat, sun.lon, endDir);
        flightRef.current = { from: fromDir, fromDist: INTRO_START_DISTANCE, to: endDir, toDist: INTRO_END_DISTANCE, elapsed: 0, duration: INTRO_DURATION_SEC, kind: "intro" };
        settledRef.current = false;
        // "layers blooming in ... markers last" (the brief's own words):
        // the one layer this lane can move without reaching into
        // GlobeScene.tsx's per-layer JSX (out of file ownership) or risking
        // a real user preference left off if something goes wrong. Hidden
        // for the flight's own duration only, restored the instant it ends
        // OR is skipped (both paths below) -- never left off.
        if (useGlobe.getState().layers.markers) {
          introMarkersHiddenRef.current = true;
          useGlobe.getState().toggleLayer("markers");
        }
        return;
      }
      // "skipped" or "done": stop owning the camera, land exactly at the
      // flight's own end point (an early skip just gets there without the
      // scenic route), hand back to OrbitControls precisely the way every
      // other view already does on return to "orbit".
      if (!introRef.current) return;
      introRef.current = false;
      const flight = flightRef.current;
      if (flight?.kind === "intro") {
        camera.position.set(flight.to.x * flight.toDist, flight.to.y * flight.toDist, flight.to.z * flight.toDist);
        camera.lookAt(0, 0, 0);
        flightRef.current = null;
      }
      settledRef.current = true;
      if (introMarkersHiddenRef.current) {
        introMarkersHiddenRef.current = false;
        if (!useGlobe.getState().layers.markers) useGlobe.getState().toggleLayer("markers");
      }
      if (controls && useGlobe.getState().view === "orbit") {
        controls.enabled = true;
        controls.update();
      }
    };
    applyPhase(getIntroPhase());
    return subscribeIntro(() => applyPhase(getIntroPhase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only subscription; controlsRef/get are stable R3F handles
  }, []);

  // Esc: back to orbit from anywhere. Guarded against typing targets even
  // though the globe canvas itself never holds text focus, restated per the
  // house rule (GlobeScene.tsx's own isTypingTarget) rather than imported,
  // since importing a non-exported helper from a file this lane may not
  // edit would create a silent coupling to its internals.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape" && useGlobe.getState().view !== "orbit") {
        setView("orbit");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setView]);

  // Ground-view drag-to-look + wheel-to-zoom. Attached directly to the
  // canvas element (not React pointer props) because OrbitControls already
  // owns pointer events on this element in every other view, and we only
  // want these listeners live while ground view actually needs them.
  useEffect(() => {
    if (view !== "ground") return;
    const el = get().gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      dragRef.current = { x: e.clientX, y: e.clientY };
      yawRef.current -= dx * YAW_SPEED;
      pitchRef.current = Math.max(0, Math.min(Math.PI / 2, pitchRef.current + dy * PITCH_SPEED));
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      fovRef.current = Math.max(FOV_MIN, Math.min(FOV_MAX, fovRef.current + e.deltaY * FOV_WHEEL_SPEED * 0.1));
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [view, get]);

  // LANE I2 (root cause fix): registers zoom-IN intent for the seamless
  // zoom-to-street gesture (useFrame's own orbit branch below). Attached
  // once, not gated on `view`, the same as `get` reads elsewhere in this
  // file -- a wheel/pinch that arrives outside orbit view just writes a
  // timestamp nothing reads that frame, cheaper than tearing the listener
  // down and rebuilding it on every view change.
  useEffect(() => {
    const el = get().gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) zoomIntentRef.current = performance.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const span = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchSpanRef.current !== null && span > pinchSpanRef.current) zoomIntentRef.current = performance.now();
      pinchSpanRef.current = span;
    };
    const onTouchEnd = () => {
      pinchSpanRef.current = null;
    };
    // Pointer capture makes a physical pill hold fresh until its release,
    // cancellation or capture loss, independent of event frequency or frame rate.
    // Keep this wiring in the lazy camera chunk rather than the eager HUD shell.
    const root = el.closest<HTMLElement>("[data-globe-root]");
    const onPillDown = (event: PointerEvent) => {
      const pill = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[aria-label="Zoom in"]') : null;
      if (!pill || !event.isPrimary || event.button !== 0 || zoomPillPointerRef.current !== null || useGlobe.getState().view !== "orbit") return;
      zoomPillPointerRef.current = event.pointerId;
      zoomHoldRef.current = 0;
      pill.setPointerCapture(event.pointerId);
      get().invalidate();
    };
    const onPillEnd = (event: PointerEvent) => {
      if (event.pointerId !== zoomPillPointerRef.current) return;
      zoomPillPointerRef.current = null;
      zoomHoldRef.current = 0;
    };
    root?.addEventListener("pointerdown", onPillDown, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) root?.addEventListener(type, onPillEnd, true);
    // passive: true -- unlike the ground-view wheel handler above, this
    // listener never calls preventDefault (it only records a timestamp),
    // and OrbitControls' own wheel handler on the same element still needs
    // to see the event to actually zoom.
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      root?.removeEventListener("pointerdown", onPillDown, true);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) root?.removeEventListener(type, onPillEnd, true);
      zoomPillPointerRef.current = null;
      zoomHoldRef.current = 0;
    };
  }, [get]);

  // The HUD zoom-in pill drives OrbitControls' dolly directly from
  // GlobeScene.tsx's own effect, never through a DOM wheel event -- a rising
  // tick records a discrete click or keyboard activation. Guarded
  // against the initial mount value (prevZoomInTickRef starts equal to it)
  // so mounting with a non-zero tick already in flight never counts as a
  // fresh click.
  useEffect(() => {
    if (zoomInTick > prevZoomInTickRef.current) zoomIntentRef.current = performance.now();
    prevZoomInTickRef.current = zoomInTick;
  }, [zoomInTick]);

  useFrame((state, rawDt) => {
    const dt = clampCameraFrameDelta(rawDt);
    if (view === "orbit" && zoomPillPointerRef.current !== null) state.invalidate();
    const { camera, gl } = state;
    const el = gl.domElement;
    if (focusOffsetY.current !== null && camera instanceof THREE.PerspectiveCamera && camera.view && camera.view.offsetY !== focusOffsetY.current) {
      camera.view.offsetY = focusOffsetY.current;
      camera.updateProjectionMatrix();
    }

    // In-flight: interpolate position, ignore drag/follow until it lands.
    const flight = flightRef.current;
    if (flight) {
      flight.elapsed += dt;
      const t = easeInOutCubic(Math.min(1, flight.elapsed / flight.duration));
      const p = flyPosition(flight.from, flight.fromDist, flight.to, flight.toDist, t, GLOBE_RADIUS);
      camera.position.set(p.x, p.y, p.z);
      // Mid-flight, every view looks at the globe's centre -- ground view's
      // horizon-relative look-up direction only takes over once landed.
      camera.lookAt(0, 0, 0);
      if (t >= 1) {
        flightRef.current = null;
        settledRef.current = true;
        // WAVE 6 LANE X5: the intro's own flight reaching t=1 IS "finished
        // playing" -- tell the bus so ui/Intro.tsx's overlay unmounts and
        // the seen-flag gets set. The phase-bus subscription above then
        // handles the (already-done) camera/controls/markers cleanup;
        // `introRef.current` is still true at this point, so that handler
        // still runs its restore branch.
        if (flight.kind === "intro") finishIntro();
      }
      el.dataset.cameraView = view;
      el.dataset.cameraFlying = "true";
      return;
    }
    el.dataset.cameraFlying = "false";

    if (view !== "orbit") {
      // Only orbit ever accumulates a zoom-hold (see below); leaving orbit
      // for any reason -- ground/follow/street, or a click-to-fly -- must
      // not leave a stale hold that instantly re-triggers street the moment
      // the visitor lands back in orbit later.
      zoomHoldRef.current = 0;
    }

    if (view === "orbit") {
      el.dataset.cameraView = "orbit";
      if (!introRef.current) {
        // WAVE 6 LANE X5: seamless zoom -> street. `flight` (above) already
        // covers "mid-animation"; this only ever runs once OrbitControls
        // itself has the camera settled, so a pinned distance genuinely
        // means the visitor is holding at the closest orbit lets them get,
        // not that a fly-to just happens to be passing through it.
        const controls = controlsRef.current;
        const minDistance = controls?.minDistance ?? GLOBE_RADIUS * 1.5;
        const maxDistance = controls?.maxDistance ?? GLOBE_RADIUS * 7;
        const distance = camera.position.length();
        // Test/tooling seam only (same convention as GlobeScene.tsx's own
        // data-subsolar-* probe): lets an e2e case confirm the camera has
        // actually reached the zoom floor without depending on the 400ms
        // trigger firing, so a "stays in orbit" assertion isn't just "never
        // got the chance to trigger".
        el.dataset.cameraDistance = distance.toFixed(3);
        el.dataset.cameraMinDistance = minDistance.toFixed(3);
        const msSinceIntent = performance.now() - zoomIntentRef.current;
        zoomHoldRef.current = stepZoomHold(zoomHoldRef.current, distance, minDistance, dt, msSinceIntent, zoomPillPointerRef.current !== null);
        if (zoomHoldRef.current >= ZOOM_HOLD_MS && distance > 1e-6) {
          zoomHoldRef.current = 0;
          const unit = { x: camera.position.x / distance, y: camera.position.y / distance, z: camera.position.z / distance };
          const { lat, lon } = xyzToLatLon(unit);
          // OrbitControls' target is fixed at the origin (GlobeScene.tsx
          // never overrides it), so the camera always looks straight at the
          // globe's own centre -- its forward direction is always this same
          // unit vector, negated. WAVE 6 LANE X5 (verifier-flagged blocking
          // gap): matching bearing/pitch, not just zoom, is what "seamless"
          // requires -- see cameraOrientation.ts's own header.
          const forward = { x: -unit.x, y: -unit.y, z: -unit.z };
          const { bearingDeg, pitchDeg } = cameraForwardToBearingPitch(forward, lat, lon);
          armStreetHandoff({
            zoom: altitudeToStreetZoom(distance - GLOBE_RADIUS, minDistance - GLOBE_RADIUS, maxDistance - GLOBE_RADIUS),
            bearing: bearingDeg,
            pitch: pitchDeg,
          });
          useGlobe.getState().flyTo({ kind: "latlon", lat, lon });
          setView("street");
        }
      }
      return;
    }

    if (view === "ground") {
      const { lat, lon } = groundLatLon.current;
      const pos = groundPosition(lat, lon, GLOBE_RADIUS, GROUND_EYE_HEIGHT);
      camera.position.set(pos.x, pos.y, pos.z);
      const look = groundLookDirection(lat, lon, yawRef.current, pitchRef.current);
      camera.up.set(pos.x, pos.y, pos.z); // radially "up" at this point on the sphere
      camera.lookAt(pos.x + look.x, pos.y + look.y, pos.z + look.z);
      if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - fovRef.current) > 1e-3) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      }
      if (horizonRef.current) {
        horizonRef.current.position.set(pos.x, pos.y, pos.z);
        horizonRef.current.lookAt(0, 0, 0);
      }
      el.dataset.cameraView = "ground";
      el.dataset.cameraFov = String(Math.round(fovRef.current));
      return;
    }

    // "street" (added in wave 2, after this file's own lane L5 landed) is a
    // full-bleed DOM surface over the canvas (ui/StreetView.tsx) — the 3D
    // camera underneath doesn't matter once it's open. Without this no-op,
    // "street" fell through to the "follow" branch below, which reverts to
    // "orbit" EVERY FRAME because a latlon focus is never a `kind: "entity"`
    // — confirmed empirically (lane W3): a real trigger (`flyTo({kind:
    // "latlon",...}); setView("street")`) opened the surface for under one
    // frame before this reverted it. Out of lane W3's own file ownership,
    // committed anyway because the alternative is the feature being unable
    // to stay open at all — flagged prominently in W3's final report for
    // integration review; safe to drop only once every "street" trigger
    // path is re-verified without it.
    if (view === "street") {
      el.dataset.cameraView = "street";
      return;
    }

    // follow
    if (focus?.kind !== "entity") {
      setView("orbit");
      return;
    }
    const getter = entityPositions.get(focus.id);
    const p = getter?.();
    if (!p) {
      // The entity vanished (layer failed, tier dropped it, TLE went stale):
      // never keep a follow camera aimed at nothing.
      setView("orbit");
      return;
    }
    const entityPos: Vec3 = { x: p.x, y: p.y, z: p.z };
    const entityDist = Math.hypot(entityPos.x, entityPos.y, entityPos.z) || GLOBE_RADIUS;
    const entityDir = { x: entityPos.x / entityDist, y: entityPos.y / entityDist, z: entityPos.z / entityDist };

    const prev = prevEntityPosRef.current ?? entityPos;
    const headingRaw = { x: entityPos.x - prev.x, y: entityPos.y - prev.y, z: entityPos.z - prev.z };
    const headingLen = Math.hypot(headingRaw.x, headingRaw.y, headingRaw.z);
    // Tangential "behind": the component of -heading perpendicular to the
    // radial direction, so "behind" means along the entity's own track, not
    // straight down through the globe.
    const back = headingLen > 1e-6 ? { x: -headingRaw.x / headingLen, y: -headingRaw.y / headingLen, z: -headingRaw.z / headingLen } : entityDir;
    const radial = vDot(back, entityDir);
    const tangentBack = { x: back.x - entityDir.x * radial, y: back.y - entityDir.y * radial, z: back.z - entityDir.z * radial };
    const tangentLen = Math.hypot(tangentBack.x, tangentBack.y, tangentBack.z);
    const tangentDir = tangentLen > 1e-6 ? { x: tangentBack.x / tangentLen, y: tangentBack.y / tangentLen, z: tangentBack.z / tangentLen } : { x: 0, y: 0, z: 0 };
    prevEntityPosRef.current = entityPos;

    const desired = {
      x: entityDir.x * (entityDist + FOLLOW_ABOVE) + tangentDir.x * FOLLOW_BEHIND,
      y: entityDir.y * (entityDist + FOLLOW_ABOVE) + tangentDir.y * FOLLOW_BEHIND,
      z: entityDir.z * (entityDist + FOLLOW_ABOVE) + tangentDir.z * FOLLOW_BEHIND,
    };
    const smoothed = dampTowards(followPosRef.current ?? desired, desired, FOLLOW_DAMP_HALFLIFE, dt);
    followPosRef.current = smoothed;
    camera.position.set(smoothed.x, smoothed.y, smoothed.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(entityPos.x, entityPos.y, entityPos.z);
    el.dataset.cameraView = "follow";
  });

  return (
    <mesh ref={horizonRef} visible={view === "ground"} renderOrder={-1}>
      <ringGeometry args={[GLOBE_RADIUS * 0.05, GLOBE_RADIUS * 0.12, 48]} />
      {/* Ambient furniture (the "ground plane reads as a horizon" glow), not
          a live/claim signal, so this stays off the brand palette (house
          rule) -- a warm, dim, desaturated band. */}
      <meshBasicMaterial color="#4a3d2c" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
