import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginRun,
  CHECKPOINT_COUNT,
  loadBestMs,
  passCheckpoint,
  saveBestMs,
} from "./triathlon.ts";

/* vitest.config.ts runs this suite under environment: "node" — no jsdom, so
 * there is no ambient `localStorage`. Install a minimal in-memory stand-in
 * before each test (and delete it after) so loadBestMs/saveBestMs exercise
 * their real success path, not just the catch-and-swallow branch. */
function installFakeStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
}

describe("passCheckpoint", () => {
  it("advances through checkpoints in order and sets finishedMs on the last one", () => {
    let state = beginRun(0);
    for (let id = 0; id < CHECKPOINT_COUNT - 1; id++) {
      state = passCheckpoint(state, id, 1000 + id);
      expect(state.nextCheckpoint).toBe(id + 1);
      expect(state.finishedMs).toBeNull();
    }
    state = passCheckpoint(state, CHECKPOINT_COUNT - 1, 5000);
    expect(state.nextCheckpoint).toBe(CHECKPOINT_COUNT);
    expect(state.finishedMs).toBe(5000);
  });

  it("ignores an out-of-order pass", () => {
    const state = beginRun(0);
    const after = passCheckpoint(state, 2, 1000); // checkpoint 0 is next, not 2
    expect(after).toEqual(state);
  });

  it("ignores a repeat pass of the same checkpoint", () => {
    const start = beginRun(0);
    const afterFirst = passCheckpoint(start, 0, 1000);
    const afterRepeat = passCheckpoint(afterFirst, 0, 2000);
    expect(afterRepeat).toEqual(afterFirst);
  });
});

describe("best-time persistence", () => {
  beforeEach(() => installFakeStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the lower value when a best already exists", () => {
    saveBestMs(9000);
    saveBestMs(12000); // slower — must not overwrite
    expect(loadBestMs()).toBe(9000);

    saveBestMs(7000); // faster — must overwrite
    expect(loadBestMs()).toBe(7000);
  });

  it("loadBestMs returns null when nothing has been saved", () => {
    expect(loadBestMs()).toBeNull();
  });

  it("loadBestMs returns null when storage throws (private browsing)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    });
    expect(loadBestMs()).toBeNull();
    expect(() => saveBestMs(1000)).not.toThrow();
  });
});
