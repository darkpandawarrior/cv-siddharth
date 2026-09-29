// WAVE 6 LANE X6 (opt-in sound and haptics) owns this file, plus its two
// siblings (soundTriggers.ts, soundSynth.ts). Off by default, persisted per
// browser (excelsiorProgress.ts's own localStorage shape: try/catch every
// access, `typeof localStorage` guard first — private mode, a full quota or
// storage disabled outright all throw). Never invents a cue: every trigger
// below reads a real, already-fetched signal this page has anyway (no new
// fetch, same "read a sibling's snapshot" discipline as HexbinLayer.tsx).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useGlobe, type Focus } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { getHazardSnapshot } from "../layers/hazardSnapshot.ts";
import { diffPulseEvents, type PulseSources } from "../layers/pulseEvents.ts";
import type { GithubActivity } from "../../../../api/_lib/github-activity-handler.ts";
import type { Ops } from "../../../../api/_lib/ops-handler.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";
import { newBigQuakes, cueForPulse, isNewFly } from "./soundTriggers.ts";
import { primeAudio, playRumble, playChime, playThud, playWhoosh } from "./soundSynth.ts";

const KEY = "globe-sound-enabled";

function readEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeEnabled(v: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* private mode or a full quota — the toggle still works, it just won't remember */
  }
}

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration API, or the browser refused it outside a gesture — never fatal */
  }
}

// LANE H1 (integration): the phone Layers sheet needs its own in-sheet
// sound-toggle button (task 4 — see this file's own header, "Needs from
// integration"), but every audio-cue effect below (hazard rumble, pulse
// chime/thud, fly whoosh) has to keep running from exactly ONE mounted
// component, never two — a second independent instance would double-poll
// and double-fire cues. So "enabled" lives here as a tiny external store
// (module scope, not React state), and BOTH the default export (desktop
// icon + the effects) and `SoundToggleSlot` (the in-sheet row LayerPanel.tsx
// renders) read it via `useSyncExternalStore` — one source of truth, one
// set of side effects, two buttons.
let soundEnabled = false;
const soundListeners = new Set<() => void>();
function setSoundEnabled(next: boolean): void {
  soundEnabled = next;
  writeEnabled(next);
  for (const listener of soundListeners) listener();
}
function subscribeSound(listener: () => void): () => void {
  soundListeners.add(listener);
  return () => soundListeners.delete(listener);
}
function toggleSound(): void {
  const next = !soundEnabled;
  if (next) {
    primeAudio(); // create/resume the AudioContext on this real click, before any cue needs it
    buzz(15);
  }
  setSoundEnabled(next);
}

/** Phone-only in-sheet row: LayerPanel.tsx mounts this inside the Layers
 *  sheet's own header, retiring the old `fixed bottom-4 right-4` floating
 *  button that sat over the sheet's own content. */
export function SoundToggleSlot() {
  const enabled = useSyncExternalStore(subscribeSound, () => soundEnabled, () => false);
  const label = enabled ? "Mute globe sound" : "Enable globe sound";
  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={enabled}
      aria-label={label}
      data-sound-toggle-sheet
      data-sound-enabled={enabled}
      className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {enabled ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
    </button>
  );
}

// HazardLayer.tsx's own feeds refresh every 5-15 min, so re-reading its
// snapshot this often is comfortably ahead of anything actually changing —
// same cadence and reasoning as HexbinLayer.tsx's own SNAPSHOT_POLL_MS.
const HAZARD_POLL_MS = 4000;
// PulseLayer.tsx's own POLL_MS / SIGNALS_POLL_MS — polling the SAME URLs at
// the SAME intervals costs nothing extra: useLiveSignal is a shared bus, one
// fetch per URL no matter how many callers ask for it.
const PULSE_POLL_MS = 60_000;
const SIGNALS_POLL_MS = 120_000;

// Mirrors Globe.tsx's own PANEL_RESERVE_RIGHT constants (that file doesn't
// export them, and this lane doesn't own it) so this button sits in the gap
// its topbar already reserves next to the layer-panel column, rather than
// overlapping either one. "HUD row" per the brief: same top-4 strip
// LayerPanel.tsx's own collapse icon sits in.
const RIGHT_OFFSET = { open: 257, collapsed: 58 };

export default function SoundToggle({ tier: _tier }: { tier: 1 | 2 | 3 }) {
  const enabled = useSyncExternalStore(subscribeSound, () => soundEnabled, () => false);
  useEffect(() => {
    // A `0`-delay timeout, not a synchronous setState in the effect body —
    // same react-hooks/set-state-in-effect dodge sparkSeries.ts's own
    // useApproxNow already uses, for the same reason: only a synchronous
    // setState call from the effect's own body trips that rule, and SSR
    // renders `false` regardless (localStorage doesn't exist there), so
    // this only delays the real value by one tick on mount, never shows a
    // wrong one.
    const id = setTimeout(() => setSoundEnabled(readEnabled()), 0);
    return () => clearTimeout(id);
  }, []);

  const reducedMotion = useReducedMotion();
  const panelOpen = useGlobe((s) => s.panelOpen);
  const focus = useGlobe((s) => s.focus);

  const seenQuakeIds = useRef<Set<string>>(new Set());
  const prevPulses = useRef<PulseSources | null>(null);
  const prevFocus = useRef<Focus | null | undefined>(undefined);

  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity", PULSE_POLL_MS);
  const { data: ops } = useLiveSignal<Ops>("/api/ops", PULSE_POLL_MS);
  const { data: signals } = useLiveSignal<SignalsResponse>("/api/signals", SIGNALS_POLL_MS);

  // Low rumble: any hazard-snapshot quake at M>=5 this tab hasn't sounded
  // for yet. A plain interval poll of a module-level getter, not a
  // subscription — same "cheap DOM-side poll" precedent HexbinLayer.tsx
  // already cites (LayerPanel's own ISS-availability check).
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      const snap = getHazardSnapshot();
      for (const q of newBigQuakes(seenQuakeIds.current, snap.quakes)) {
        playRumble(q.mag);
        buzz(120);
      }
      for (const q of snap.quakes) seenQuakeIds.current.add(q.id);
    }, HAZARD_POLL_MS);
    return () => clearInterval(id);
  }, [enabled]);

  // Chime / thud: the same push/CI/social diff PulseLayer.tsx runs on the
  // same three feeds, but this effect only ever acts on the two CI kinds.
  // The FIRST poll only ever sets the baseline (never sounds the historical
  // backlog PulseLayer.tsx would otherwise replay as its opening pulses).
  useEffect(() => {
    if (!enabled) return;
    if (activity === null && ops === null && signals === null) return;
    const curr: PulseSources = { activity, ops, signals };
    if (prevPulses.current !== null && !document.hidden) {
      for (const event of diffPulseEvents(prevPulses.current, curr)) {
        const cue = cueForPulse(event.kind);
        if (cue === "chime") {
          playChime();
          buzz(20);
        } else if (cue === "thud") {
          playThud();
          buzz([20, 40, 20]);
        }
      }
    }
    prevPulses.current = curr;
  }, [enabled, activity, ops, signals]);

  // Whoosh: globeStore's own `focus` is exactly what CameraDirector.tsx
  // flies the camera to (its own effect keys off the same field) — reusing
  // it means this is a real fly-to, never an invented one. Reduced motion
  // also skips the baseline update below on purpose: while it's on, no
  // whoosh has fired, so a later toggle-off of reduced motion mid-session
  // still gets a correct baseline (whatever `focus` is at that moment).
  useEffect(() => {
    if (!enabled || reducedMotion) return;
    if (!document.hidden && isNewFly(prevFocus.current, focus)) {
      playWhoosh();
      buzz(15);
    }
    prevFocus.current = focus;
  }, [enabled, reducedMotion, focus]);

  const label = enabled ? "Mute globe sound" : "Enable globe sound";
  const icon = enabled ? <Volume2 size={13} aria-hidden /> : <VolumeX size={13} aria-hidden />;

  return (
    <>
      {/* Desktop/tablet (sm+): a small icon button in the HUD row, in the
          gap the topbar already reserves beside the layer-panel column.
          `absolute`, not `fixed` — Globe.tsx's own comment on this block is
          explicit that every panel here "resolves its own position against
          this stage" (`data-globe-stage`, the `relative`/`absolute inset-0`
          container these siblings mount inside), not the viewport. A fixed
          position landed this button UNDER the site's own sticky route
          header (z-40 there vs. z-30 here) at the stage's actual top
          offset, which silently ate every click (caught by e2e). */}
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={enabled}
        aria-label={label}
        title="Sound (opt-in)"
        data-sound-toggle
        data-sound-enabled={enabled}
        className="ctrl-icon pointer-events-auto absolute top-4 z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex"
        style={{ right: panelOpen ? RIGHT_OFFSET.open : RIGHT_OFFSET.collapsed }}
      >
        {icon}
      </button>
      {/* Phone: the in-sheet row is `SoundToggleSlot` above, rendered by
          LayerPanel.tsx inside its own Layers-sheet header (task H1 #4) —
          this file no longer floats a second button over that sheet. */}
    </>
  );
}
