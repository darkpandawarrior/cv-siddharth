/**
 * The world's input singleton.
 *
 * Craft.tsx reads `input` every physics tick inside useFrame — a fresh object
 * per keystroke would mean Craft either re-subscribes constantly or reads a
 * stale closure, so instead this module owns ONE object and mutates its
 * fields in place. Every caller (Craft, the HUD's touch controls) holds the
 * same reference for the life of the page.
 *
 * `pitch` mirrors `throttle` (same W/S axis) rather than being a distinct
 * gesture: this module has no idea whether the craft is currently wheels,
 * hull or wings, and it shouldn't need to. Craft.tsx is the one place that
 * knows the mode, so it picks whichever of throttle/pitch its current mode
 * actually uses. Keeping the axis-vs-meaning split at that boundary means
 * this file never needs to change when a new mode is added.
 */

export type InputState = {
  steer: number;
  throttle: number;
  brake: boolean;
  pitch: number;
  confirm: boolean;
  /** Shift held — spend boost. Craft decides whether there is any left. */
  boost: boolean;
};

export const input: InputState = {
  steer: 0,
  throttle: 0,
  brake: false,
  pitch: 0,
  confirm: false,
  boost: false,
};

// Keys this module ever acts on. Lower-cased `KeyboardEvent.key` values —
// arrows already come through as "arrowup" etc. once lower-cased.
const STEER_LEFT = new Set(["a", "arrowleft"]);
const STEER_RIGHT = new Set(["d", "arrowright"]);
const THROTTLE_FWD = new Set(["w", "arrowup"]);
const THROTTLE_BACK = new Set(["s", "arrowdown"]);
const CAPTURED_KEYS = new Set([
  "a", "d", "w", "s",
  "arrowleft", "arrowright", "arrowup", "arrowdown",
  " ", "enter", "shift",
]);

const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"]);

// Focus on the HUD's List button, or any other real control, must keep
// working exactly as the browser expects — Enter/Space activating it, arrow
// keys doing nothing weird. So a keystroke or tap aimed at an interactive
// element is never treated as driving input, regardless of capture state.
// Duck-typed on tagName/isContentEditable rather than `instanceof HTMLElement`
// so this check doesn't depend on a DOM global existing (it also runs, via
// this module's own tests, under vitest's node environment). Shared by the
// keyboard and pointer handlers below — both need the identical rule.
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (INTERACTIVE_TAGS.has(t.tagName ?? "") || !!t.isContentEditable);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Capture state — whether the canvas currently owns WASD/arrows/Space/Enter.
 * Lives at module scope rather than inside attachKeyboard()'s closure for the
 * same reason `input` above is a module singleton: the HUD is a separate
 * React tree that never calls attachKeyboard itself, but it still needs to
 * read (to show the "controls released" affordance) and change (the resume
 * button) this state. There is only ever one live keyboard controller for
 * the one canvas, so one shared flag is the whole model — no need for
 * per-instance capture state that nothing would ever instantiate twice.
 */
let captured = true;
const captureListeners = new Set<(captured: boolean) => void>();

function setCaptured(next: boolean): void {
  if (captured === next) return;
  captured = next;
  for (const fn of captureListeners) fn(captured);
}

/** Current capture state, for anything that just needs a one-off read. */
export function isCaptured(): boolean {
  return captured;
}

/** Notifies `fn` on every capture change; returns an unsubscribe function. */
export function subscribeCaptured(fn: (captured: boolean) => void): () => void {
  captureListeners.add(fn);
  return () => captureListeners.delete(fn);
}

/**
 * Hands control back to the canvas. Exported so the HUD's visible "resume"
 * button (the design's required escape hatch back in, mirroring Escape's
 * hatch out) can call it directly — that's the one recapture path that must
 * work even when the tap/keypress lands on the button itself rather than the
 * canvas, so it deliberately bypasses the interactive-target filter below.
 */
export function recapture(): void {
  setCaptured(true);
}

// Two independent sources can be feeding steer/throttle at once on a hybrid
// device — a laptop with a touchscreen, say — the keyboard and the HUD's
// touch sticks. Each tracks its own contribution here; `recomputeAxes` is the
// single place that combines them (additively, then clamped) and mirrors the
// combined throttle onto pitch, so neither source can silently clobber the
// other's hold and pitch keeps working no matter which source drove it
// (Finding 12 — touch never routed through the mirror before).
let keySteer = 0;
let keyThrottle = 0;
let touchSteer = 0;
let touchThrottle = 0;

function recomputeAxes(): void {
  input.steer = clamp(keySteer + touchSteer, -1, 1);
  input.throttle = clamp(keyThrottle + touchThrottle, -1, 1);
  input.pitch = input.throttle;
}

/** Called by the HUD's left thumbstick. See recomputeAxes for why this
 *  composes with the keyboard rather than overwriting it outright. */
export function setTouchSteer(v: number): void {
  touchSteer = clamp(v, -1, 1);
  recomputeAxes();
}

/** Called by the HUD's right pedal. */
export function setTouchThrottle(v: number): void {
  touchThrottle = clamp(v, -1, 1);
  recomputeAxes();
}

/**
 * Wires WASD/arrows/Space/Enter/Escape to the `input` singleton and returns
 * a detach function.
 *
 * Escape is the accessibility escape hatch the design calls for: it stops
 * the craft dead and releases capture, so Tab can move focus off the
 * (aria-hidden) canvas and onto the HUD's real controls — Tab is explicitly
 * exempted from ever recapturing (below) so that path always stays open.
 * Capture comes back via any of: a driving keypress aimed at the canvas, a
 * click/tap on the canvas, or the HUD's explicit resume button calling
 * `recapture()` — see setCaptured's call sites in this function and the
 * pointerdown handler.
 */
export function attachKeyboard(): () => void {
  const pressed = new Set<string>();
  setCaptured(true); // every fresh mount starts captured
  keySteer = 0;
  keyThrottle = 0;
  touchSteer = 0; // and with no phantom stick input left over from a previous mount
  touchThrottle = 0;
  recomputeAxes();

  const anyPressed = (keys: Set<string>) => {
    for (const k of keys) if (pressed.has(k)) return true;
    return false;
  };

  const recompute = () => {
    const left = anyPressed(STEER_LEFT);
    const right = anyPressed(STEER_RIGHT);
    const fwd = anyPressed(THROTTLE_FWD);
    const back = anyPressed(THROTTLE_BACK);
    keySteer = (right ? 1 : 0) - (left ? 1 : 0);
    keyThrottle = (fwd ? 1 : 0) - (back ? 1 : 0);
    recomputeAxes();
    input.brake = pressed.has(" ");
    input.confirm = pressed.has("enter");
    input.boost = pressed.has("shift");
  };

  const releaseAll = () => {
    pressed.clear();
    keySteer = 0;
    keyThrottle = 0;
    recomputeAxes();
    input.brake = false;
    input.confirm = false;
    // Boost clears here too. Leaving it set is the same defect class as the
    // stuck-throttle bug: alt-tab while holding Shift and the craft would keep
    // burning boost with no key held and no way to stop it.
    input.boost = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isInteractiveTarget(e.target)) return;
    const key = e.key.toLowerCase();
    // Never preventDefault Escape or Tab — the page needs both for basic
    // keyboard accessibility (Escape blurs, Tab moves focus) and neither is
    // safe to swallow just because the craft happens to be driving.
    if (key === "escape") {
      setCaptured(false);
      releaseAll();
      return;
    }
    // Tab must never recapture — it's the one key a keyboard user relies on
    // to actually leave the canvas after Escape, and recapturing on it would
    // trap them right back where Finding 6 started.
    if (key === "tab" || !CAPTURED_KEYS.has(key)) return;
    if (!captured) setCaptured(true); // a driving key aimed at the canvas hands control back
    // Space/arrows would otherwise scroll the page; Enter would otherwise be
    // a no-op on a plain document, but preventing it keeps its meaning as
    // "confirm" unambiguous rather than accidentally activating a stray
    // focused element the driver didn't mean to touch.
    e.preventDefault();
    pressed.add(key);
    recompute();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    // Keyup must ALWAYS clear pressed state, regardless of where focus has
    // moved. Finding 7's bug: hold W, Tab to the HUD's List button (focus —
    // and so e.target — is now the button), release W. The old code filtered
    // keyup by the same "interactive target" rule as keydown and dropped
    // this keyup, leaving "w" stuck in `pressed` forever: throttle pinned at
    // 1, and a fresh keydown for "w" got dropped too (it was already
    // "pressed"), so there was no way back in short of a remount. Keydown
    // still needs the interactive-target filter (it starts new actions —
    // Enter activating a button — that this module must stay out of); keyup
    // only ever stops something already in flight, so filtering it the same
    // way only breaks the release, never protects anything.
    const key = e.key.toLowerCase();
    if (!CAPTURED_KEYS.has(key)) return;
    pressed.delete(key);
    recompute();
  };

  const onPointerDown = (e: PointerEvent) => {
    // A tap/click that lands on the canvas itself — never on a real HUD
    // control, so clicking "List view" or "Enter" while released doesn't
    // also silently resume driving underneath it — hands control back, the
    // same way a driving keypress does above.
    if (captured || isInteractiveTarget(e.target)) return;
    setCaptured(true);
  };

  const onBlur = () => {
    // Alt-tabbing away mid-drive never fires a keyup for whatever was held —
    // the OS just takes focus, no event reaches this listener. Without this,
    // Finding 7's stuck-throttle bug has a second way in that keyup-fixing
    // alone doesn't cover: hold W, alt-tab, the "w" keyup simply never
    // arrives.
    releaseAll();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("blur", onBlur);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("blur", onBlur);
    releaseAll();
  };
}
