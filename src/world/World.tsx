import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Stars } from "@react-three/drei";
import { ACESFilmicToneMapping as ACES_FILMIC } from "three";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Monuments } from "./Monuments.tsx";
import { Corpus } from "./Corpus.tsx";
import { Threads } from "./Threads.tsx";
import { ResolveField } from "./ResolveField.tsx";
import { Trail } from "./Trail.tsx";
import { disposeAudio, initAudio, playPickup, playResolveChime } from "./audio.ts";
import { useNavigate } from "@tanstack/react-router";
import { Terrain } from "./Terrain.tsx";
import { Props } from "./Props.tsx";
import { Pavilions } from "./Pavilions.tsx";
import { Craft } from "./Craft.tsx";
import { Hud } from "./Hud.tsx";
import { input, attachKeyboard, isAutoDriving, setAutoAxes } from "./input.ts";
import {
  BLOCKED_MS,
  REVERSE_MS,
  distanceTo,
  driveToward,
  hasArrived,
  isBlocked,
  isStalling,
  nextStop,
  reverseOut,
  type Stop,
} from "./autopilot.ts";
import { LabelCameraBridge, WorldLabels } from "./WorldLabels.tsx";
import { PLACEMENTS } from "./worldData.ts";
import type { WaypointTarget } from "./Nav.tsx";
import { worldPalette } from "./palette.ts";
import { loadExplored, markExplored } from "./explored.ts";
import { ARTIFACTS, ARTIFACT_PICKUP_RADIUS } from "./artifacts.ts";
import { Artifacts } from "./Artifacts.tsx";
import { collect, loadCollected } from "./progress.ts";
import { loadResolved, saveResolved } from "./resolve.ts";
import { telemetry } from "./telemetry.ts";
import { SPAWN_POSITION } from "./craftPhysics.ts";
import type { Toast } from "./Nav.tsx";
import { ROOMS, type Room } from "../rooms.tsx";
import { usePulse, type PulseEvent } from "../play/pulse.ts";

/**
 * The assembly. Every other module under src/world/ is either pure logic
 * (craftPhysics, resolve, city/districtWest/corpusData) or a piece of the
 * scene that knows nothing about the others (Terrain doesn't know Craft
 * exists, Pavilions doesn't know about the dust field) — this file is the
 * one place that reads one module's output and feeds it into another's
 * input: Pavilions' sensor events become the HUD prompt AND a room-entry
 * decision, Craft's per-frame transform becomes the HUD's speed readout,
 * and resolve.ts's ratchet (via `telemetry.resolvedFraction`, written every
 * frame by ResolveField) becomes both the HUD's `FIX %` and the cue for a
 * resolve chime here.
 *
 * Scene components below are wrapped in `memo` because this component's own
 * state changes fairly often — every artifact pickup, every toast, every
 * prompt. Terrain/Props/Corpus take no props at all and
 * Pavilions/Craft take one stable `useCallback`, so `memo` turns "World
 * re-rendered" into a handful of cheap prop-equality checks instead of every
 * scene subtree re-evaluating its JSX 60 times a second for no reason. Craft
 * still runs its own R3F hooks every frame regardless — this only skips
 * re-running its component *body*.
 */
const MemoTerrain = memo(Terrain);
const MemoProps = memo(Props);
const MemoPavilions = memo(Pavilions);
const MemoCraft = memo(Craft);
const MemoMonuments = memo(Monuments);
const MemoCorpus = memo(Corpus);
const MemoTrail = memo(Trail);
const MemoResolveField = memo(ResolveField);
const MemoThreads = memo(Threads);

// How long the craft has to sit inside a pavilion's sensor before entry
// auto-confirms — the design doc's "~1s dwell" figure.
const DWELL_MS = 1000;

/**
 * The tour's route: the eight rooms, as bare coordinates.
 *
 * Derived from PLACEMENTS rather than listed, for the same registry reason
 * Pavilions.tsx iterates it — a room added to profile.ts without a placement
 * must fail worldData.test.ts, not quietly drop off the tour.
 */
const STOPS: Stop[] = PLACEMENTS.map((p) => ({ to: p.to, x: p.position[0], z: p.position[2] }));

/**
 * How long the autopilot idles outside a room before moving on.
 *
 * It deliberately does NOT enter. Driving a visitor through a door they didn't
 * choose would unmount this whole world mid-tour and dump them in a room they
 * were only being shown the outside of; pulling up, letting the prompt card
 * come up with its Enter button, and then carrying on is the version where the
 * visitor still decides. Long enough to read the card, short enough that a
 * hands-off tour never feels parked.
 */
const TOUR_HOLD_MS = 3800;

/** How far the craft has to get from a stop it has already arrived at before
 *  the visit is considered abandoned rather than just a wobble on the brakes.
 *  Generous: only a human driving away should ever trip it. */
const ABANDON_RADIUS = 14;







export default function World(props: { onShowList: () => void }) {
  const palette = worldPalette();
  const navigate = useNavigate();
  const bump = usePulse();

  // Restores which of the city's 147 resolve cells were already driven
  // through on a past visit. Must happen before any district's own
  // `resolveAttributes()` call (Monuments, Corpus) seeds its instances'
  // starting state from `triggerTimeOf` — an effect fires AFTER children
  // have already mounted and read that state, which is too late (see
  // resolve.ts's own comment on this). A lazy `useState` initializer is the
  // one React hook guaranteed to run during THIS component's render, before
  // its children's render — exactly the ordering this needs. The state
  // value itself is never read; it exists only to get `loadResolved()`
  // called exactly once.
  useState(loadResolved);

  const [promptTo, setPromptTo] = useState<string | null>(null);
  const promptToRef = useRef<string | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const confirmHeldRef = useRef(false); // edge-detects input.confirm (a held flag) into a single press

  // How many rooms have been entered from the world, ever. Gives the map a
  // reason to be explored past the first room you happen to bump into — the
  // grid view has always shown all eight at once, so the world needs its own
  // sense of progress or it is strictly less informative than a list.
  const [explored, setExplored] = useState<ReadonlySet<string>>(() => new Set(loadExplored()));
  // Collected artifacts. Held in state because the scene reads it (collected
  // ones dim in place), and mirrored in a ref for the per-frame pickup check
  // that must not close over a stale value.
  const [collected, setCollected] = useState<Set<string>>(() => loadCollected());
  const collectedRef = useRef(collected);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  // Cue for the resolve chime: how much of the city was resolved as of the
  // last frame we checked, and when we last actually played the sound.
  // ResolveField.tsx can stamp up to 11 cells in a single frame (the 3x3
  // block plus two ahead — see resolve.ts's own `stamp()` comment), and
  // driving straight into fresh territory keeps finding new cells for
  // seconds at a time, so a fraction increase is NOT rare enough to trigger
  // a chime unthrottled — that reads as a rattle, not a chime. The 260ms
  // floor is short enough to feel responsive to a single new district
  // resolving, long enough that a sustained drive through unresolved ground
  // pings a few times a second rather than every frame.
  const lastResolvedFractionRef = useRef(0);
  const lastChimeAtRef = useRef(0);

  // document.hidden, not the list-view toggle: switching to List unmounts
  // this whole component (Playground.tsx), so there is no "paused but still
  // mounted" state to handle beyond the tab actually being backgrounded.
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    // Persisted here rather than on every cell resolve: resolve.ts's ratchet
    // already lives in memory for the whole session (it only ever grows), so
    // the only moment that actually needs a durable write is "the visitor
    // might not come back" — backgrounding the tab or navigating into a
    // room (the cleanup below). Saving on every `stamp()` would mean a
    // localStorage write nearly every frame while driving through new
    // territory, for no benefit over saving once when it matters.
    const onVisibility = () => {
      setPaused(document.hidden);
      if (document.hidden) saveResolved();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      saveResolved();
    };
  }, []);

  useEffect(() => attachKeyboard(), []);

  // Audio starts on the first real gesture and never before — browsers suspend
  // an AudioContext until then, and a portfolio that greets a recruiter with
  // engine noise is worse than a silent one. Torn down on unmount so entering
  // a room does not leave a synth running behind the page.
  useEffect(() => {
    const start = () => initAudio();
    window.addEventListener("keydown", start, { once: true });
    window.addEventListener("pointerdown", start, { once: true });
    return () => {
      window.removeEventListener("keydown", start);
      window.removeEventListener("pointerdown", start);
      disposeAudio();
    };
  }, []);

  // Navigating away from a room's sensor volume before its dwell timer fires
  // must not leave a stray setTimeout that fires `navigate()` after this
  // component (and the craft inside it) is gone.
  useEffect(
    () => () => {
      if (dwellTimerRef.current !== null)
        window.clearTimeout(dwellTimerRef.current);
    },
    [],
  );

  /** Shows a notice and schedules its own removal. */
  const pushToast = useCallback((toast: Toast) => {
    setToasts((prev) => [...prev.slice(-2), toast]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 4200);
    toastTimers.current.push(timer);
  }, []);



  // Every scheduled toast has to be cancellable: navigating into a room
  // unmounts this component, and a setTimeout calling setToasts afterwards is
  // a React warning at best and a leak at worst.
  useEffect(
    () => () => {
      for (const t of toastTimers.current) window.clearTimeout(t);
    },
    [],
  );

  const enterRoom = useCallback(
    (to: string) => {
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      promptToRef.current = null;
      setPromptTo(null);
      // Same pulse event RoomGrid's <Link> fires on click, so the visit
      // counters on /pulse stay one shared number regardless of which view
      // a visitor entered through.
      bump(`room:${to.slice(1)}` as PulseEvent);
      markExplored(to);
      setExplored(new Set(loadExplored()));
      navigate({ to });
    },
    [bump, navigate],
  );

  const handlePrompt = useCallback(
    (to: string | null) => {
      promptToRef.current = to;
      setPromptTo(to);
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      // The dwell is a HUMAN gesture — "stop here and I'll take you in". While
      // the autopilot is driving, arriving is what it does at every stop, so
      // leaving the dwell armed would have the tour navigate into the first
      // room it reached and unmount the world it was meant to be showing off.
      // The prompt card (and its Enter button) still comes up either way.
      if (to !== null && !isAutoDriving()) {
        dwellTimerRef.current = window.setTimeout(() => {
          dwellTimerRef.current = null;
          // Re-check rather than trust the closed-over `to`: the craft may
          // have left this pavilion's sensor (or entered another's) in the
          // second between the timer starting and firing.
          if (promptToRef.current === to) enterRoom(to);
        }, DWELL_MS);
      }
    },
    [enterRoom],
  );

  const onHudConfirm = useCallback(() => {
    if (promptToRef.current) enterRoom(promptToRef.current);
  }, [enterRoom]);

  /**
   * The tour's own state, in a ref because it is read and written from the
   * per-frame callback below rather than from a render.
   *
   * `seen` is deliberately NOT seeded from localStorage's explored list: a
   * returning visitor asking for a tour wants the tour, not a route that skips
   * every room they once opened and starts at the far end of the map.
   */
  const tourRef = useRef<{
    seen: Set<string>;
    targetTo: string | null;
    holdUntil: number;
    stalledMs: number;
    blockedMs: number;
    reverseUntil: number;
    lastFrameAt: number;
  }>({ seen: new Set(), targetTo: null, holdUntil: 0, stalledMs: 0, blockedMs: 0, reverseUntil: 0, lastFrameAt: 0 });
  // The current destination, as the HUD's waypoint reads it. React state
  // rather than a ref because it changes ~8 times in a session (once per stop)
  // and is genuinely rendered — the opposite end of the spectrum from the
  // craft's transform, which is why that goes through telemetry instead.
  const [waypoint, setWaypoint] = useState<WaypointTarget | null>(null);

  // Craft's own useFrame calls this every rendered frame — the only place in
  // this component tree with a reason to run that often outside the Canvas.
  // Reused here for three unrelated per-frame jobs (artifact pickups, the
  // Enter-key edge, the resolve chime) rather than adding three separate
  // frame loops for them.
  const handleCraftState = useCallback(
    (s: { position: [number, number, number] }) => {
      /**
       * Wayfinding, and — when it's engaged — the autopilot.
       *
       * Both run whether or not auto is on, because the waypoint is the answer
       * to "where am I supposed to go" for a visitor driving themselves too;
       * only the last line here actually touches the controls. Reads the pose
       * off `telemetry` rather than taking it as an argument: Craft publishes
       * heading and speed there every frame anyway, and widening onState's
       * payload would mean a second copy of the same three numbers.
       */
      const pose = { x: telemetry.x, z: telemetry.z, heading: telemetry.heading, speed: telemetry.speed };
      const tour = tourRef.current;
      let target = tour.targetTo ? STOPS.find((st) => st.to === tour.targetTo) : undefined;
      if (!target) target = nextStop(STOPS, tour.seen, pose) ?? undefined;

      const now = performance.now();
      if (target) {
        // The stall clock. Accumulated from wall time rather than a physics
        // dt because this callback is the render frame, not the step — and
        // "has it been sitting still for about a second" wants wall time
        // anyway. See autopilot.ts's STALL_MS for what it's protecting
        // against: a craft parked 4.2m from a 4m radius, forever.
        const elapsed = tour.lastFrameAt === 0 ? 0 : Math.min(200, now - tour.lastFrameAt);
        tour.lastFrameAt = now;
        tour.stalledMs = isStalling(pose, target) ? tour.stalledMs + elapsed : 0;
        // ...and the same clock for being wedged somewhere that ISN'T the
        // target. See autopilot.ts's isBlocked for why these are two counters
        // and not one: stopped-at-the-room means arrived, stopped-in-a-wall
        // means reverse.
        tour.blockedMs = isBlocked(pose, target) ? tour.blockedMs + elapsed : 0;
        if (tour.blockedMs > BLOCKED_MS && tour.reverseUntil === 0) {
          tour.reverseUntil = now + REVERSE_MS;
          tour.blockedMs = 0;
        }
        if (tour.reverseUntil !== 0 && now >= tour.reverseUntil) tour.reverseUntil = 0;

        /**
         * Arriving is STICKY, and that is a fix rather than a detail.
         *
         * The first version re-tested arrival every frame and cleared the hold
         * the moment the craft drifted a metre back outside the radius — which
         * a car that has just braked from 6 m/s does constantly. So the tour
         * would arrive, start its hold, roll 30cm, cancel, turn around, come
         * back, and orbit its own destination indefinitely. Once we're here we
         * are here; only being genuinely driven away (ABANDON_RADIUS — a human
         * taking the wheel) or the hold running out ends it.
         */
        const arrived = hasArrived(pose, target, tour.stalledMs);
        if (tour.holdUntil !== 0 && distanceTo(pose, target) > ABANDON_RADIUS) {
          tour.holdUntil = 0;
        } else if (tour.holdUntil === 0 && arrived) {
          tour.holdUntil = now + TOUR_HOLD_MS;
        } else if (tour.holdUntil !== 0 && now >= tour.holdUntil) {
          tour.holdUntil = 0;
          tour.stalledMs = 0;
          tour.seen.add(target.to);
          target = nextStop(STOPS, tour.seen, pose) ?? undefined;
        }
      }

      if ((target?.to ?? null) !== tour.targetTo) {
        tour.targetTo = target?.to ?? null;
        const room = target ? ROOMS.find((r) => r.to === target.to) : null;
        setWaypoint(
          target && room ? { label: room.label, tint: room.tint, x: target.x, z: target.z } : null,
        );
      }

      // The one line that drives. `setAutoAxes` is a no-op unless auto is
      // engaged, so a human at the wheel is never fighting a stale frame.
      if (target && isAutoDriving()) {
        setAutoAxes(
          tour.reverseUntil !== 0 ? reverseOut(pose, target) : driveToward(pose, target),
        );
      }

      // Artifact pickups. A plain distance sweep over ~18 positions, run on
      // the frame callback that already exists: eighteen more Rapier sensors
      // would cost real physics time to answer a question Math.hypot answers
      // for nothing.
      for (const artifact of ARTIFACTS) {
        if (collectedRef.current.has(artifact.id)) continue;
        const [ax, ay, az] = artifact.position;
        const dist = Math.hypot(s.position[0] - ax, s.position[1] - ay, s.position[2] - az);
        if (dist > ARTIFACT_PICKUP_RADIUS) continue;
        if (!collect(artifact.id)) continue;
        const next = new Set(collectedRef.current);
        next.add(artifact.id);
        collectedRef.current = next;
        setCollected(next);
        playPickup();
        pushToast({
          id: `art-${artifact.id}`,
          title: artifact.label,
          detail: artifact.detail,
          tint: worldPalette().signal,
          kind: "find",
        });
      }

      const confirmed = input.confirm;
      // Captured before confirmHeldRef is overwritten below, so the
      // room-entry edge above sees a single press rather than being
      // re-triggered every frame the key stays held.
      const confirmPressedThisFrame = confirmed && !confirmHeldRef.current;
      if (confirmPressedThisFrame && promptToRef.current)
        enterRoom(promptToRef.current);
      confirmHeldRef.current = confirmed;

      // The resolve chime — see the refs' own comment for the throttle.
      // `telemetry.resolvedFraction` is written every frame by
      // ResolveField.tsx from resolve.ts's ratchet, so this only ever climbs
      // within a session; a drop would mean a bug elsewhere, not something
      // to chime about, hence the strict `>`.
      if (telemetry.resolvedFraction > lastResolvedFractionRef.current) {
        lastResolvedFractionRef.current = telemetry.resolvedFraction;
        const now = performance.now();
        if (now - lastChimeAtRef.current > 260) {
          lastChimeAtRef.current = now;
          playResolveChime();
        }
      }
    },
    // pushToast is a stable useCallback, but listing it is not ceremony: this
    // callback is handed to Craft and captured for the life of the mount, so
    // anything it closes over that is NOT listed would silently freeze at its
    // first value — pickups going quiet after a re-render is the kind of bug
    // that is untraceable from the symptom.
    [enterRoom, pushToast],
  );

  const promptRoom: Room | null =
    promptTo === null ? null : (ROOMS.find((r) => r.to === promptTo) ?? null);

  return (
    <>
      {/* aria-hidden on the Canvas's own wrapper hides the whole WebGL
          subtree (canvas + any drei <Html> labels portalled into it) from
          the accessibility tree — the design doc's "a screen reader gets the
          grid, not a described car". Hud below is the entire accessible
          surface of this route while the world is showing. */}
      <Canvas
        shadows
        dpr={[1, 1.5]}
        // A few metres behind SPAWN_POSITION, matching the direction Craft's
        // own chase camera sits relative to the craft — this is only what
        // renders for the handful of frames before that chase cam's useFrame
        // takes over, but with the slab now running -80..88 in z, leaving
        // this at its old (pre-city) literal would have shown empty ground
        // 50m from where the craft actually spawns.
        camera={{ position: [SPAWN_POSITION[0], SPAWN_POSITION[1] + 2, SPAWN_POSITION[2] - 6], fov: 55 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <color attach="background" args={[palette.void]} />
        {/* A SKY, finally.
            With the dust storm pulled in to hug its own buildings (see
            resolve.ts's SCATTER_SPREAD), the top half of the frame stopped
            being full of confetti and started being pure #000 — which reads
            as a rendering failure rather than as night. A thin star field
            gives the void a ceiling and, more usefully, gives the horizon
            somewhere to be: the slab's far edge now sits against something
            instead of dissolving into the background colour.
            Radius is well outside WORLD_BOUNDS.maxZ so you can never drive
            into it, and the count is deliberately low — this is a backdrop,
            not a feature, and it must not become the next thing competing for
            attention in a scene this rework spent its whole time quieting. */}
        <Stars radius={180} depth={60} count={900} factor={4} saturation={0} fade speed={0.4} />
        {/* Fog starts further out than it did (30 -> 55). At 30 the far half
            of the mainland was already fading into the background colour, so a
            driver couldn't see the room they were heading for — which on a
            surface whose entire job is navigation is the wrong trade. */}
        <fog attach="fog" args={[palette.void, 55, 140]} />
        {/* Lifted from 0.55/0.6/1.4. The first render of this scene was legible
            in a screenshot only if you already knew what you were looking at:
            unlit faces of the terrain read as pure background, so the mainland
            had no visible edge and the sea and the sky were the same colour.
            Dark is the site's palette; unreadable isn't. */}
        {/* Three lights, not one. A single overhead key on untextured boxes
            gives every face the same value and the silhouette disappears; the
            rim light behind picks out edges against the dark ground, and the
            cool fill from the opposite side keeps the shadow sides from going
            to pure black. This is the cheapest thing that makes primitives look
            deliberate. */}
        <ambientLight intensity={0.85} />
        <directionalLight position={[-16, 12, 26]} intensity={1.2} color="#7fd9ff" />
        <directionalLight position={[10, 6, -20]} intensity={1.4} color="#ffd9a0" />
        <hemisphereLight args={[palette.signalDim, palette.void, 1.0]} />
        <directionalLight
          castShadow
          position={[18, 26, -12]}
          intensity={2.6}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
        />
        <Physics paused={paused}>
          <MemoTerrain />
          <MemoProps />
          <MemoMonuments />
          <MemoCorpus />
          <MemoPavilions onPrompt={handlePrompt} />
          <MemoCraft onState={handleCraftState} />
        </Physics>
        <MemoTrail />
        {/* The city's dust — always mounted, never conditional on anything:
            frame 0's "lit road through a haze" is the design's whole
            first-five-seconds bet, and that only works if this is here from
            the very first render, same as the pavilions themselves. */}
        <MemoResolveField />
        {/* The two authored/discovered arcs. Overhead-only geometry (x=0,
            above the boulevard) with no collider — you drive under them,
            never into them — so it costs nothing to mount unconditionally
            alongside Trail and the dust field. */}
        <MemoThreads />
        <Artifacts collected={collected} />
        {/* Bloom is doing real work here, not gloss. Every room's identity in
            this world is carried by an emissive material in its tint — the
            phone screen, the CRT face, the atoll's waterline ring, the sky
            islands' PCB traces, the checkpoint gates. Unbloomed they read as
            flat coloured rectangles in a dark scene; with it they read as lit
            objects and become visible from much further away, which is the
            difference between navigating and hunting. luminanceThreshold is set
            high enough that only genuinely emissive surfaces bloom, so the
            terrain doesn't turn milky. */}
        <EffectComposer>
          {/* Ambient occlusion first, and it does more for this scene than
              everything else in this stack combined. A world built from
              untextured primitives has no contact information — a box on a
              plane and a box floating a centimetre above it look identical, so
              the whole thing reads as flat shapes rather than objects sitting
              somewhere. AO puts the shadow back into every crease and corner
              the geometry implies. */}
          <N8AO aoRadius={1.4} intensity={2.6} distanceFalloff={0.8} quality="low" halfRes />
          {/* Threshold 0.9, not 0.62. At 0.62 the lit terrain itself passed the
              cut and the mainland bloomed into soft white pools — the scene got
              brighter but less readable, which is the opposite of the point.
              The room emissives sit well above 0.9, so raising it keeps the
              glow on the things that are meant to glow. */}
          <Bloom intensity={0.7} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
          {/* ACES filmic, not the renderer's default linear clamp. Everything
              bright in this world is emissive — room tints, trails, gates — and
              linear tone mapping clips them all to flat white, which is why the
              lit surfaces looked like paper cut-outs. ACES rolls the highlights
              off instead, so a glowing thing reads as bright rather than as a
              hole in the image. */}
          <ToneMapping mode={ACES_FILMIC} />
          <SMAA />
        </EffectComposer>
        {/* Publishes the camera to the label layer below. Renders nothing, and
            deliberately sits outside <Physics> — it reads the camera the chase
            cam has already moved this frame, and has no business in the
            physics tree. */}
        <LabelCameraBridge />
      </Canvas>
      {/* The world's floating text, as ONE decluttered overlay rather than the
          three independent <Html> systems it replaced. Between the canvas and
          the HUD in DOM order so the HUD's own chrome always wins the z-fight
          against a label that happens to project underneath it. */}
      <WorldLabels targetTo={tourRef.current.targetTo} />
      <Hud
        promptRoom={promptRoom}
        onConfirm={onHudConfirm}
        onShowList={props.onShowList}




        waypoint={waypoint}
        waypointTo={tourRef.current.targetTo}
        visited={explored}
        exploredCount={explored.size}
        collectedCount={collected.size}
        artifactTotal={ARTIFACTS.length}
        toasts={toasts}
        totalRooms={ROOMS.length}
      />
    </>
  );
}
