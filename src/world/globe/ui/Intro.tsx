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
    const onInput = (e: Event) => {
      // The Skip button's own onClick already handles a deliberate
      // activation of it. Letting this catch-all ALSO fire on the same
      // pointerdown/touchstart races React's resulting unmount (phase flips
      // to "skipped" synchronously, inside this same event) against the
      // browser's own click dispatch -- sometimes the button is gone from
      // the DOM before mouseup/click completes, which a real visitor never
      // notices (the intro is already skipped either way) but a driver that
      // insists on finishing its click protocol against a still-present node
      // can hang waiting for an element that will not reappear. That race
      // is pointer/touch-specific (down -> up -> click), so only those
      // event types exclude the button as a target. Keydown does NOT get
      // the same exclusion: a keyboard "click" (Enter/Space) synthesizes on
      // keyUP, well after this handler already ran, so there is no race to
      // avoid there -- and excluding it here silently broke Space
      // specifically, since a sibling global listener elsewhere
      // (TimeScrubber's own Space-to-pause-time handler) calls
      // preventDefault() on that same keydown, which suppresses the native
      // click this button was relying on. skipIntro() is idempotent past
      // the first call, so firing here AND from the button's own click
      // (when it does land) costs nothing. Every OTHER input, anywhere else
      // on the page or any key, still skips immediately regardless of
      // target.
      if (e.target === skipButtonRef.current && e.type !== "keydown") return;
      skipIntro();
    };
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
    // `absolute inset-0`, not `fixed`: this has to resolve against
    // `data-globe-stage` (the positioned ancestor Globe.tsx mounts it
    // inside), not the viewport -- a `fixed` overlay ignored the stage
    // entirely and its copy line landed at the bottom of the whole page,
    // colliding with GlobePanel's fact list (which "renders unconditionally"
    // directly below/under the stage per Globe.tsx's own comment). The
    // copy's own `bottom-[calc(45%+16px)]` on sm+ is the same clearance
    // Inspector.tsx and GlobeTour.tsx already use to stay clear of that
    // same bottom-45% fact-list band -- it has to live on the <p> itself as
    // an absolute offset, not as `padding-bottom` on this flex container:
    // percentage padding resolves against the containing block's WIDTH
    // (always, regardless of axis), but percentage `bottom` on an
    // absolutely positioned element resolves against its HEIGHT, which is
    // the number this needs. On phones the fact list is a separate flow
    // block below the stage, so the smaller `bottom-16` default is enough.
    <div data-globe-intro className="pointer-events-none absolute inset-0 z-40">
      {/* Decorative and transient — the same claim is always available,
          untimed, in GlobePanel's own fact list, so a screen reader visitor
          loses nothing by this line never being announced mid-flight. */}
      <p
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-16 mx-auto max-w-sm px-6 text-center font-mono text-sm text-zinc-200 transition-opacity ease-in-out sm:bottom-[calc(45%+16px)]"
        style={{ opacity: copyVisible ? 1 : 0, transitionDuration: `${COPY_FADE_MS}ms` }}
      >
        {INTRO_LINE}
      </p>
      <button
        ref={skipButtonRef}
        type="button"
        onClick={skipIntro}
        aria-label="Skip introduction"
        className="pointer-events-auto absolute right-4 top-4 rounded-full glass-panel px-3 py-1.5 font-mono text-xs text-zinc-200 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Skip
      </button>
    </div>
  );
}
