import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { ACESFilmicToneMapping as ACES_FILMIC } from "three";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Motes } from "./Ambience.tsx";
import { Monuments } from "./Monuments.tsx";
import { Stunts } from "./Stunts.tsx";
import { Trail } from "./Trail.tsx";
import { disposeAudio, initAudio, playPickup } from "./audio.ts";
import { useNavigate } from "@tanstack/react-router";
import { Terrain } from "./Terrain.tsx";
import { Props } from "./Props.tsx";
import { Pavilions } from "./Pavilions.tsx";
import { Craft } from "./Craft.tsx";
import { Hud } from "./Hud.tsx";
import { input, attachKeyboard } from "./input.ts";
import { worldPalette } from "./palette.ts";
import { loadExplored, markExplored } from "./explored.ts";
import { ARTIFACTS, ARTIFACT_PICKUP_RADIUS } from "./artifacts.ts";
import { Artifacts } from "./Artifacts.tsx";
import { collect, loadCollected } from "./progress.ts";
import type { Toast } from "./Nav.tsx";
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
const MemoProps = memo(Props);
const MemoPavilions = memo(Pavilions);
const MemoCraft = memo(Craft);
const MemoMotes = memo(Motes);
const MemoMonuments = memo(Monuments);
const MemoStunts = memo(Stunts);
const MemoTrail = memo(Trail);

// How long the craft has to sit inside a pavilion's sensor before entry
// auto-confirms — the design doc's "~1s dwell" figure.
const DWELL_MS = 1000;







export default function World(props: { onShowList: () => void }) {
  const palette = worldPalette();
  const navigate = useNavigate();
  const bump = usePulse();


  const [promptTo, setPromptTo] = useState<string | null>(null);
  const promptToRef = useRef<string | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const confirmHeldRef = useRef(false); // edge-detects input.confirm (a held flag) into a single press

  // How many rooms have been entered from the world, ever. Gives the map a
  // reason to be explored past the first room you happen to bump into — the
  // grid view has always shown all eight at once, so the world needs its own
  // sense of progress or it is strictly less informative than a list.
  const [exploredCount, setExploredCount] = useState(() => loadExplored().length);
  // Collected artifacts. Held in state because the scene reads it (collected
  // ones dim in place), and mirrored in a ref for the per-frame pickup check
  // that must not close over a stale value.
  const [collected, setCollected] = useState<Set<string>>(() => loadCollected());
  const collectedRef = useRef(collected);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

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
    (s: { position: [number, number, number] }) => {


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
      // Captured before confirmHeldRef is overwritten below, so both the
      // room-entry edge above and the start-line edge in the checkpoint
      // block further down see the same single press rather than the room
      // check silently consuming it first.
      const confirmPressedThisFrame = confirmed && !confirmHeldRef.current;
      if (confirmPressedThisFrame && promptToRef.current)
        enterRoom(promptToRef.current);
      confirmHeldRef.current = confirmed;

    },
    // pushToast is a stable useCallback, but listing it is not ceremony: this
    // callback is handed to Craft and captured for the life of the mount, so
    // anything it closes over that is NOT listed would silently freeze at its
    // first value — pickups going quiet after a re-render is the kind of bug
    // that is untraceable from the symptom.
    [enterRoom, pushToast],
  );

  // The HUD's reset control: clears an in-progress or finished run back to
  // the pre-start state so the start line arms again. Deliberately leaves
  // `bestMs` alone — that's a persisted personal best across attempts, not
  // per-run state, and resetting it here would defeat the point of
  // saveBestMs "keeping the lower value" across restarts.

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
        <color attach="background" args={[palette.void]} />
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
          <MemoStunts />
          <MemoPavilions onPrompt={handlePrompt} />
          <MemoCraft onState={handleCraftState} />
        </Physics>
        <MemoTrail />
        <MemoMotes />
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
      </Canvas>
      <Hud
        promptRoom={promptRoom}
        onConfirm={onHudConfirm}
        onShowList={props.onShowList}




        exploredCount={exploredCount}
        collectedCount={collected.size}
        artifactTotal={ARTIFACTS.length}
        toasts={toasts}
        totalRooms={ROOMS.length}
      />
    </>
  );
}
