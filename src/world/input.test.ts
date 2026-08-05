import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachKeyboard, input, isCaptured, recapture, setTouchSteer, setTouchThrottle, subscribeCaptured } from "./input.ts";

/* vitest.config.ts runs this suite under environment: "node" — no real
 * `window`/`KeyboardEvent`. attachKeyboard only ever calls
 * window.addEventListener/removeEventListener with plain listener functions,
 * so a tiny fake event target (record handlers, let the test fire them with
 * plain objects) exercises the real branching logic without needing jsdom. */

// Loosely typed as `Event` rather than `KeyboardEvent`: attachKeyboard now
// also registers "pointerdown" and "blur" listeners on the same window, and
// this fake target is shared by all of them — the per-call helpers below
// (`key`, `pointerAt`) supply whatever shape each specific test needs.
type Handler = (e: Event) => void;

function fakeWindow() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener: (type: string, fn: Handler) => {
      (handlers.get(type) ?? handlers.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type: string, fn: Handler) => {
      handlers.get(type)?.delete(fn);
    },
    fire(type: string, e: object = {}) {
      for (const fn of handlers.get(type) ?? []) fn(e as Event);
    },
  };
}

function key(k: string, target: unknown = null): Partial<KeyboardEvent> {
  return { key: k, target: target as EventTarget, preventDefault: vi.fn() };
}

function pointerAt(target: unknown = null): Partial<PointerEvent> {
  return { target: target as EventTarget };
}

describe("attachKeyboard", () => {
  let win: ReturnType<typeof fakeWindow>;
  let detach: () => void;

  beforeEach(() => {
    win = fakeWindow();
    vi.stubGlobal("window", win);
    detach = attachKeyboard();
  });

  afterEach(() => {
    detach();
    vi.unstubAllGlobals();
  });

  it("derives steer/throttle from currently-held WASD, clearing on keyup", () => {
    win.fire("keydown", key("w"));
    win.fire("keydown", key("d"));
    expect(input.throttle).toBe(1);
    expect(input.steer).toBe(1);
    win.fire("keyup", key("w"));
    expect(input.throttle).toBe(0);
    expect(input.steer).toBe(1); // "d" is still held
  });

  it("accepts arrow keys as the same axes as WASD", () => {
    win.fire("keydown", key("ArrowLeft"));
    win.fire("keydown", key("ArrowUp"));
    expect(input.steer).toBe(-1);
    expect(input.throttle).toBe(1);
  });

  it("mirrors throttle onto pitch, since Craft — not this module — decides which axis its current mode uses", () => {
    win.fire("keydown", key("s"));
    expect(input.throttle).toBe(-1);
    expect(input.pitch).toBe(-1);
  });

  it("tracks brake and confirm as held state, not one-shot pulses", () => {
    win.fire("keydown", key(" "));
    win.fire("keydown", key("Enter"));
    expect(input.brake).toBe(true);
    expect(input.confirm).toBe(true);
    win.fire("keyup", key(" "));
    expect(input.brake).toBe(false);
    expect(input.confirm).toBe(true); // Enter still held
  });

  it("Escape zeroes the craft and genuinely releases capture — Tab can then move focus off the canvas", () => {
    win.fire("keydown", key("w"));
    expect(input.throttle).toBe(1);

    win.fire("keydown", key("Escape"));
    expect(input.throttle).toBe(0);
    expect(isCaptured()).toBe(false);

    // Tab must never be the thing that recaptures — that's the keyboard
    // user's only way out, and it has to stay open even with more Tabs.
    win.fire("keydown", key("Tab"));
    expect(isCaptured()).toBe(false);
  });

  it("Finding 6: a driving key aimed at the canvas after Escape hands control back", () => {
    win.fire("keydown", key("Escape"));
    expect(isCaptured()).toBe(false);

    win.fire("keydown", key("d"));
    expect(isCaptured()).toBe(true);
    expect(input.steer).toBe(1);
  });

  it("Finding 6: a pointerdown on the canvas (not on a HUD control) also recaptures after Escape", () => {
    win.fire("keydown", key("Escape"));
    win.fire("pointerdown", pointerAt(null));
    expect(isCaptured()).toBe(true);
  });

  it("Finding 6: a pointerdown on a real HUD control does NOT recapture — only the explicit resume affordance should", () => {
    win.fire("keydown", key("Escape"));
    win.fire("pointerdown", pointerAt({ tagName: "BUTTON" }));
    expect(isCaptured()).toBe(false);
  });

  it("Finding 6: recapture() re-engages capture directly — the call the HUD's resume button makes", () => {
    win.fire("keydown", key("Escape"));
    expect(isCaptured()).toBe(false);
    recapture();
    expect(isCaptured()).toBe(true);
  });

  it("Finding 6: subscribeCaptured notifies listeners on every capture change and unsubscribes cleanly", () => {
    const seen: boolean[] = [];
    const unsub = subscribeCaptured((c) => seen.push(c));

    win.fire("keydown", key("Escape"));
    win.fire("keydown", key("w")); // recaptures
    unsub();
    win.fire("keydown", key("Escape")); // not observed — unsubscribed

    expect(seen).toEqual([false, true]);
  });

  it("never captures a key aimed at a real interactive element (List button, etc.)", () => {
    const button = { tagName: "BUTTON" };
    win.fire("keydown", key("w", button));
    expect(input.throttle).toBe(0);
  });

  it("Finding 7: keyup always clears the pressed key even when focus has moved to a HUD button (stuck-throttle regression)", () => {
    // Hold W (throttle pinned at 1), Tab moves focus to the HUD's List
    // button, then the physical W key comes up — but by then e.target on
    // that keyup is the button, not the canvas.
    win.fire("keydown", key("w"));
    expect(input.throttle).toBe(1);

    const listButton = { tagName: "BUTTON" };
    win.fire("keydown", key("Tab", listButton));
    win.fire("keyup", key("w", listButton));
    expect(input.throttle).toBe(0); // was stuck at 1 before the fix

    // And a fresh W keydown (back on the canvas) must work again — before
    // the fix, "w" never left `pressed`, so this kept being a no-op too.
    win.fire("keydown", key("w"));
    expect(input.throttle).toBe(1);
  });

  it("Finding 7: window blur clears all held input (alt-tab mid-drive)", () => {
    win.fire("keydown", key("w"));
    win.fire("keydown", key("d"));
    expect(input.throttle).toBe(1);
    expect(input.steer).toBe(1);

    win.fire("blur");
    expect(input.throttle).toBe(0);
    expect(input.steer).toBe(0);
  });

  it("Finding 12: touch axes compose with the keyboard instead of clobbering it", () => {
    win.fire("keydown", key("w")); // keyboard throttle = 1
    expect(input.throttle).toBe(1);

    setTouchThrottle(-1); // touch pedal pulled back at the same time
    expect(input.throttle).toBe(0); // 1 + -1, clamped — composed, not overwritten
    expect(input.pitch).toBe(0); // mirror still applies to the composed value

    setTouchThrottle(0);
    expect(input.throttle).toBe(1); // keyboard's hold is still there underneath

    setTouchSteer(1);
    win.fire("keydown", key("a")); // keyboard steer = -1
    expect(input.steer).toBe(0); // -1 + 1, composed
  });

  it("preventDefault fires on a captured driving key but never on Escape or Tab", () => {
    const wEvent = key("w");
    win.fire("keydown", wEvent);
    expect(wEvent.preventDefault).toHaveBeenCalled();

    const escEvent = key("Escape");
    win.fire("keydown", escEvent);
    expect(escEvent.preventDefault).not.toHaveBeenCalled();

    const tabEvent = key("Tab");
    win.fire("keydown", tabEvent);
    expect(tabEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("detach removes listeners and zeroes state", () => {
    win.fire("keydown", key("w"));
    expect(input.throttle).toBe(1);
    detach();
    expect(input.throttle).toBe(0);
    win.fire("keydown", key("w")); // detached — no handler left to react
    expect(input.throttle).toBe(0);
  });
});
