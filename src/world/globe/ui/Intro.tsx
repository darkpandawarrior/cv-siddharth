import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { getIntroPhase, INTRO_DURATION_MS, INTRO_LINE, shouldPlayIntro, skipIntro, startIntro, subscribeIntro, type IntroPhase } from "../cameraIntro.ts";

/** WAVE 6 LANE X5 (cinematic, skippable first visit) owns this file.
 *
 * A plain DOM overlay, sibling to the Canvas (Globe.tsx mounts it inside the
 * same `capable`-gated block as StreetView/ExploreBar — never under SSR or
 * no-WebGL, so it can never be the thing blocking GlobePanel's fact list;
 * that gate is Globe.tsx's, not this file's, to own). It never touches the
 * 3D camera itself — CameraDirector.tsx (a Canvas-side sibling) is the only
 * thing that can, and the two coordinate through cameraIntro.ts's tiny phase
 * bus rather than props, since neither component can see the other's own
 * (tier here, the camera there). This component's whole job: decide WHETHER
 * to start (tier/reduced-motion/seen-flag), and render the skippable copy +
 * button while `phase === "playing"`.
 */

// Fade the copy in shortly after the flight starts and back out well before
// it ends, so it's never on screen for CameraDirector's own hard cut into
// orbit — a flash of copy disappearing mid-frame would read as a glitch, not
// a deliberate beat.
const COPY_FADE_MS = 700;
const COPY_IN_AT_MS = 1200;
const COPY_OUT_AT_MS = INTRO_DURATION_MS - 1800;

export default function Intro({ tier }: { tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<IntroPhase>(getIntroPhase());
  const [copyVisible, setCopyVisible] = useState(false);
  const startedRef = useRef(false);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeIntro(() => setPhase(getIntroPhase())), []);

  // Decide once, on mount, whether this visit plays the intro at all. `tier`
  // and `reducedMotion` are both already settled by the time this component
  // exists (Globe.tsx resolves both in the same effect that flips
  // `capable`, the flag this component is mounted behind), so a plain
  // mount-guarded effect is enough — no need to re-decide on a later change.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (shouldPlayIntro(tier, reducedMotion)) startIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide once, using whatever tier/reducedMotion already are at mount
  }, []);

  useEffect(() => {
    // Nothing renders once phase leaves "playing" (the early `return null`
    // below), so there's no visible copy left to hide -- no need to reset
    // `copyVisible` from here, only to arm the timers while it's showing.
    if (phase !== "playing") return;
    skipButtonRef.current?.focus();
    const inTimer = setTimeout(() => setCopyVisible(true), COPY_IN_AT_MS);
    const outTimer = setTimeout(() => setCopyVisible(false), COPY_OUT_AT_MS);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
    };
  }, [phase]);

  // "Skip button and any input skips" (the brief's own words) — every input
  // class, not just a click on the button. skipIntro() itself is a no-op
  // once phase has left "playing" (cameraIntro.ts's own guard), so the
  // button's own click bubbling to this same window listener costs nothing.
  useEffect(() => {
    if (phase !== "playing") return;
    const onInput = () => skipIntro();
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("touchstart", onInput);
    };
  }, [phase]);

  if (phase !== "playing") return null;

  return (
    <div data-globe-intro className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-end pb-16 sm:pb-24">
      {/* Decorative and transient — the same claim is always available,
          untimed, in GlobePanel's own fact list, so a screen reader visitor
          loses nothing by this line never being announced mid-flight. */}
      <p
        aria-hidden="true"
        className="pointer-events-none max-w-sm px-6 text-center font-mono text-sm text-zinc-200 transition-opacity ease-in-out"
        style={{ opacity: copyVisible ? 1 : 0, transitionDuration: `${COPY_FADE_MS}ms` }}
      >
        {INTRO_LINE}
      </p>
      <button
        ref={skipButtonRef}
        type="button"
        onClick={skipIntro}
        aria-label="Skip introduction"
        className="pointer-events-auto absolute right-4 top-4 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-200 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Skip
      </button>
    </div>
  );
}
