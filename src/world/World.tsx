import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useNavigate } from "@tanstack/react-router";
import { Terrain } from "./Terrain.tsx";
import { Water } from "./Water.tsx";
import { Props } from "./Props.tsx";
import { Pavilions } from "./Pavilions.tsx";
import { Craft } from "./Craft.tsx";
import { Hud } from "./Hud.tsx";
import { input, attachKeyboard } from "./input.ts";
import type { CraftMode } from "./craftPhysics.ts";
import {
  beginRun,
  passCheckpoint,
  loadBestMs,
  saveBestMs,
  type RunState,
  type Checkpoint,
} from "./triathlon.ts";
import { CHECKPOINTS } from "./worldData.ts";
import { loadExplored, markExplored } from "./explored.ts";
import { ROOMS, type Room } from "../rooms.tsx";
import { usePulse, type PulseEvent } from "../play/pulse.ts";

/**
 * The assembly. Every other module under src/world/ is either pure logic
 * (craftPhysics, triathlon, worldData) or a piece of the scene that knows
 * nothing about the others (Terrain doesn't know Craft exists, Pavilions
 * doesn't know about the triathlon) — this file is the one place that reads
 * one module's output and feeds it into another's input: Pavilions' sensor
 * events become the HUD prompt AND a room-entry decision, Craft's per-frame
 * transform becomes both the HUD's mode readout and the triathlon's
 * checkpoint sequencing.
 *
 * Scene components below are wrapped in `memo` because this component's own
 * state changes fairly often — every checkpoint pass, and once a run is
 * live, every frame (the timer's own comment in Hud.tsx is explicit that it
 * "ticks every frame"). Terrain/Water/Props take no props at all and
 * Pavilions/Craft take one stable `useCallback`, so `memo` turns "World
 * re-rendered" into "five cheap prop-equality checks" instead of five scene
 * subtrees re-evaluating their JSX 60 times a second for no reason. Craft
 * still runs its own R3F hooks every frame regardless — this only skips
 * re-running its component *body*.
 */
const MemoTerrain = memo(Terrain);
const MemoWater = memo(Water);
const MemoProps = memo(Props);
const MemoPavilions = memo(Pavilions);
const MemoCraft = memo(Craft);

// How long the craft has to sit inside a pavilion's sensor before entry
// auto-confirms — the design doc's "~1s dwell" figure.
const DWELL_MS = 1000;

// The triathlon timer redraws at this cadence instead of once per physics
// frame. formatTime's centisecond precision would happily show a fresh value
// 60 times a second, but no one reads a race clock that fast — 10 Hz is
// still smooth to the eye and cuts World+Hud's re-render rate by 6x for the
// whole (possibly minutes-long) duration of a run. Start/finish still update
// immediately regardless of this interval, see handleCraftState below.
const ELAPSED_UPDATE_INTERVAL_MS = 100;

const BACKGROUND = "#060807"; // --color-void

function CheckpointRing({
  checkpoint,
  passed,
  active,
  next,
}: {
  checkpoint: Checkpoint;
  passed: boolean;
  /** A run is under way. Before one starts, the course is scenery. */
  active: boolean;
  /** This is the checkpoint to head for right now. */
  next: boolean;
}) {
  // No rotation: TorusGeometry starts facing +Z, which is exactly a "gate"
  // orientation for a course that runs mainland (north) to sky island
  // (south) — see worldData.ts's coordinate scheme. Pavilions' Atoll ring is
  // the other case (flat, rotated onto the ground); this one stands upright
  // on purpose, something to drive/glide/sail *through*.
  return (
    <mesh position={checkpoint.position}>
      <torusGeometry args={[checkpoint.radius, 0.14, 8, 32]} />
      {/* Three states, not two. Seven huge glowing gates at full brightness
          dominated the view from spawn and read as the point of the world,
          when the triathlon is an optional side activity most visitors will
          never start — and with bloom added they became the brightest thing on
          screen. Dormant until a run begins; only the checkpoint you actually
          need is lit. */}
      <meshStandardMaterial
        color={passed ? "#3ddc84" : "#5ee6ff"}
        emissive={passed ? "#3ddc84" : "#5ee6ff"}
        emissiveIntensity={passed ? 0.15 : next ? 1.1 : active ? 0.45 : 0.12}
        transparent
        opacity={passed ? 0.14 : next ? 0.9 : active ? 0.4 : 0.12}
      />
    </mesh>
  );
}

/** `passedCount` is the only prop, so this only re-renders on an actual
 *  checkpoint pass (a handful of times per run) rather than every frame. */
const CheckpointRings = memo(function CheckpointRings({
  passedCount,
  active,
}: {
  passedCount: number;
  active: boolean;
}) {
  return (
    <>
      {CHECKPOINTS.map((c) => (
        <CheckpointRing
          key={c.id}
          checkpoint={c}
          passed={c.id < passedCount}
          active={active}
          next={active && c.id === passedCount}
        />
      ))}
    </>
  );
});

export default function World(props: { onShowList: () => void }) {
  const navigate = useNavigate();
  const bump = usePulse();

  const [mode, setMode] = useState<CraftMode>("wheels");
  const modeRef = useRef<CraftMode>("wheels");

  const [promptTo, setPromptTo] = useState<string | null>(null);
  const promptToRef = useRef<string | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const confirmHeldRef = useRef(false); // edge-detects input.confirm (a held flag) into a single press

  const runRef = useRef<RunState>({
    startedAtMs: null,
    nextCheckpoint: 0,
    finishedMs: null,
  });
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  // Whether the craft is sitting in checkpoint 0's sphere with no run under
  // way — drives the HUD's "press Enter to start" prompt. Mirrored in a ref
  // so the per-frame state callback can skip the setState when nothing moved.
  const [atStartLine, setAtStartLine] = useState(false);
  const atStartLineRef = useRef(false);
  const [bestMs, setBestMs] = useState<number | null>(() => loadBestMs());
  // How many rooms have been entered from the world, ever. Gives the map a
  // reason to be explored past the first room you happen to bump into — the
  // grid view has always shown all eight at once, so the world needs its own
  // sense of progress or it is strictly less informative than a list.
  const [exploredCount, setExploredCount] = useState(() => loadExplored().length);
  // Mirrors `elapsedMs` for the per-frame closure below (handleCraftState's
  // own dependency list is just `[enterRoom]`, so it never sees a fresh
  // `elapsedMs` from state — same reason runRef/modeRef/promptToRef exist).
  const elapsedMsRef = useRef<number | null>(null);
  const lastElapsedUpdateRef = useRef(0);

  // document.hidden, not the list-view toggle: switching to List unmounts
  // this whole component (Playground.tsx), so there is no "paused but still
  // mounted" state to handle beyond the tab actually being backgrounded.
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => attachKeyboard(), []);

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
      setExploredCount(loadExplored().length);
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
      if (to !== null) {
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

  // Craft's own useFrame calls this every rendered frame — the only place in
  // this component tree with a reason to run that often outside the Canvas.
  // Reused here for three unrelated per-frame jobs (mode readout, the Enter-
  // key edge, triathlon sequencing) rather than adding three separate frame
  // loops for them.
  const handleCraftState = useCallback(
    (s: { mode: CraftMode; position: [number, number, number] }) => {
      if (modeRef.current !== s.mode) {
        modeRef.current = s.mode;
        setMode(s.mode);
      }

      const confirmed = input.confirm;
      // Captured before confirmHeldRef is overwritten below, so both the
      // room-entry edge above and the start-line edge in the checkpoint
      // block further down see the same single press rather than the room
      // check silently consuming it first.
      const confirmPressedThisFrame = confirmed && !confirmHeldRef.current;
      if (confirmPressedThisFrame && promptToRef.current)
        enterRoom(promptToRef.current);
      confirmHeldRef.current = confirmed;

      const run = runRef.current;
      if (run.finishedMs === null) {
        const checkpoint = CHECKPOINTS[run.nextCheckpoint];
        const now = Date.now();
        const startedAtMs = run.startedAtMs ?? now; // what beginRun(now) would stamp, without mutating state early
        let next = run;
        if (checkpoint) {
          const [cx, cy, cz] = checkpoint.position;
          const dist = Math.hypot(
            s.position[0] - cx,
            s.position[1] - cy,
            s.position[2] - cz,
          );
          const isStartLine = run.startedAtMs === null;
          // Starting a run is deliberate, not incidental: checkpoint 0 sits
          // on the natural first drive from spawn, so simply *reaching* it
          // used to arm a timed run for every casual visitor. It now also
          // requires the same confirm press (Enter / tap) room entry uses,
          // fired while standing inside the sphere — driving through no
          // longer starts anything by itself. Every checkpoint after the
          // first still passes on physical proximity alone, same as before;
          // only the start line needs the extra press.
          const shouldPass =
            dist <= checkpoint.radius &&
            (!isStartLine || (confirmPressedThisFrame && !promptToRef.current));
          // ...which makes the start line invisible unless we say so. The HUD
          // rendered nothing about the triathlon until a run was already
          // running, so the press that starts one was undiscoverable: a
          // visitor had to guess that this particular ring, unlike every
          // other, wanted a keystroke. Surfacing it only while you're
          // standing in the sphere keeps the HUD quiet the rest of the time.
          const nowAtStartLine =
            isStartLine && dist <= checkpoint.radius && !promptToRef.current;
          if (nowAtStartLine !== atStartLineRef.current) {
            atStartLineRef.current = nowAtStartLine;
            setAtStartLine(nowAtStartLine);
          }
          if (shouldPass) {
            const based = isStartLine ? beginRun(now) : run;
            next = passCheckpoint(based, checkpoint.id, now);
            runRef.current = next;
            if (next.nextCheckpoint !== run.nextCheckpoint)
              setCheckpointIndex(next.nextCheckpoint);
            if (next.finishedMs !== null) {
              saveBestMs(next.finishedMs - startedAtMs);
              setBestMs(loadBestMs());
            }
          }
        }

        const computedElapsed =
          next.startedAtMs === null ? null : (next.finishedMs ?? now) - startedAtMs;
        // Throttled to ELAPSED_UPDATE_INTERVAL_MS instead of writing state
        // every physics frame (finding 13: that re-rendered World and Hud at
        // 60 Hz for the entire length of a run). The two edges that must
        // still land immediately — the run appearing (null -> a number) and
        // finishing — bypass the throttle so the HUD never looks like it
        // missed the start or stopped short of the true finish time.
        const justStarted = elapsedMsRef.current === null && computedElapsed !== null;
        const justFinished = next.finishedMs !== null;
        if (
          justStarted ||
          justFinished ||
          now - lastElapsedUpdateRef.current >= ELAPSED_UPDATE_INTERVAL_MS
        ) {
          lastElapsedUpdateRef.current = now;
          elapsedMsRef.current = computedElapsed;
          setElapsedMs(computedElapsed);
        }
      }
    },
    [enterRoom],
  );

  // The HUD's reset control: clears an in-progress or finished run back to
  // the pre-start state so the start line arms again. Deliberately leaves
  // `bestMs` alone — that's a persisted personal best across attempts, not
  // per-run state, and resetting it here would defeat the point of
  // saveBestMs "keeping the lower value" across restarts.
  const resetRun = useCallback(() => {
    runRef.current = { startedAtMs: null, nextCheckpoint: 0, finishedMs: null };
    elapsedMsRef.current = null;
    lastElapsedUpdateRef.current = 0;
    atStartLineRef.current = false;
    setAtStartLine(false);
    setCheckpointIndex(0);
    setElapsedMs(null);
  }, []);

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
        camera={{ position: [0, 5, -22], fov: 55 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <color attach="background" args={[BACKGROUND]} />
        {/* Fog starts further out than it did (30 -> 55). At 30 the far half
            of the mainland was already fading into the background colour, so a
            driver couldn't see the room they were heading for — which on a
            surface whose entire job is navigation is the wrong trade. */}
        <fog attach="fog" args={[BACKGROUND, 55, 140]} />
        {/* Lifted from 0.55/0.6/1.4. The first render of this scene was legible
            in a screenshot only if you already knew what you were looking at:
            unlit faces of the terrain read as pure background, so the mainland
            had no visible edge and the sea and the sky were the same colour.
            Dark is the site's palette; unreadable isn't. */}
        <ambientLight intensity={0.95} />
        <hemisphereLight args={["#3b6a52", "#0a1016", 1.0]} />
        <directionalLight
          castShadow
          position={[18, 26, -12]}
          intensity={2.1}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
        />
        <Physics paused={paused}>
          <MemoTerrain />
          <MemoWater />
          <MemoProps />
          <MemoPavilions onPrompt={handlePrompt} />
          <MemoCraft onState={handleCraftState} />
        </Physics>
        <CheckpointRings passedCount={checkpointIndex} active={elapsedMs !== null} />
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
          {/* Threshold 0.9, not 0.62. At 0.62 the lit terrain itself passed the
              cut and the mainland bloomed into soft white pools — the scene got
              brighter but less readable, which is the opposite of the point.
              The room emissives sit well above 0.9, so raising it keeps the
              glow on the things that are meant to glow. */}
          <Bloom intensity={0.7} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      </Canvas>
      <Hud
        mode={mode}
        promptRoom={promptRoom}
        onConfirm={onHudConfirm}
        onShowList={props.onShowList}
        elapsedMs={elapsedMs}
        bestMs={bestMs}
        onResetRun={resetRun}
        atStartLine={atStartLine}
        exploredCount={exploredCount}
        totalRooms={ROOMS.length}
      />
    </>
  );
}
