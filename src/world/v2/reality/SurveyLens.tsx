/**
 * The Survey lens (open-data-spec.md §5; master-plan.md#P3-03 task 3: "the
 * `L` key ... toggles on 'L' via Grade.setLook('survey') and never changes
 * landmark geometry, counts or colours").
 *
 * Module-scope boolean + `useSyncExternalStore`, the same shape
 * `src/lib/sessionRipple.ts`'s `useTouched` already uses, not React
 * context, because the toggle has to be read from TWO mounted trees that
 * share no common ancestor either owns: the canvas layer
 * (`layers/SkyObjects.tsx`, inside `<Canvas>`) and the HUD layer
 * (`hud/AircraftList.tsx`, a DOM sibling of `<Canvas>`; `layers.ts`'s own
 * doc comment explains why those two mount through separate globs).
 *
 * ponytail: `Grade.setLook("survey")` (Grade.ts, owned by P2-06a) is the
 * uniform preset swap this toggle is SUPPOSED to drive. The one live
 * `GradeEffect` instance is created inside `Post.tsx`'s `GradePass` from a
 * `look` prop that `WorldV2.tsx` hardcodes to `"golden"`
 * (`<Post tier={tier} look="golden" />`); neither file is in this lane's
 * `owns` (master-plan.json P3-03), and there is no other path (context,
 * ref, shared scene-graph node) from a `layers/*.tsx` canvas layer into
 * `Post.tsx`'s own `<EffectComposer>` subtree: `CANVAS_LAYERS.map(...)` and
 * `<Post .../>` are SIBLINGS inside `<Canvas>` in `WorldV2.tsx`, neither an
 * ancestor of the other, and `GradeEffect` extends `postprocessing`'s
 * `Effect`, not `THREE.Object3D`, so it never lands in the scene graph
 * `useThree().scene.traverse()` could search either. Editing `WorldV2.tsx`
 * or `Post.tsx` to thread this through would fail this lane's own G2
 * ownership gate. The actual visual look swap needs a follow-up lane that
 * reads `getSurveyLensOpen()` (below) into `WorldV2.tsx`'s own `look` state
 * and passes `look={open ? "survey" : "golden"}` to `<Post>`; this file
 * exposes exactly the getter/hook that wiring needs and nothing more.
 * Every OTHER effect of opening the lens (aircraft appearance and trail,
 * the satellites lazy chunk and its LOD, the ledger counts) is fully wired
 * in this lane's own files and does not depend on that follow-up.
 */
import { useEffect, useSyncExternalStore } from "react";

let open = false;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

function getSnapshot(): boolean {
  return open;
}

/** Plain, non-React read; for code that only needs a one-off check (e.g.
 *  deciding whether to fire the satellites `import()` at all) without
 *  subscribing to every future toggle. */
export function getSurveyLensOpen(): boolean {
  return open;
}

export function setSurveyLensOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  notify();
}

export function toggleSurveyLens(): void {
  setSurveyLensOpen(!open);
}

/** The Survey lens's own toggle state, read reactively. Safe to call from
 *  any mounted tree; canvas layer or HUD layer alike. */
export function useSurveyLens(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only reset; module-scope state has no other way back to closed
 *  between test files that both import this module. */
export function _resetSurveyLensForTests(): void {
  open = false;
}

const TOGGLE_KEY = "l";

/**
 * Installs the single `keydown` listener for the whole world; mounted once
 * by `layers/SkyObjects.tsx` (this lane's own canvas layer), the same "one
 * component owns the global listener, and skips it while an input has
 * focus" shape `HudV2.tsx` already uses for its own `r` (Reality ledger)
 * key. Renders nothing.
 */
export function SurveyLensKeyListener() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== TOGGLE_KEY) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select|button)$/i.test(target.tagName)) return;
      toggleSurveyLens();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
