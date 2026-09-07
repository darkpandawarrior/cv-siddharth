import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readProgress, writeProgress } from "./excelsiorProgress.ts";

// ponytail: stub localStorage rather than pull in jsdom — same pattern as
// themeColor.test.ts. vitest's own environment is plain node, where
// `localStorage` is undefined unless the process is started with
// --experimental-webstorage, so the module under test has to see a fake one.
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
const had = "localStorage" in g;

beforeEach(() => {
  store.clear();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterAll(() => {
  if (!had) delete g.localStorage;
});

describe("excelsiorProgress", () => {
  it("round-trips a page through storage, keyed by year", () => {
    writeProgress("2021", 44, 128);
    expect(readProgress()).toEqual({ "2021": { page: 44, total: 128 } });
  });

  it("keeps each year's entry independent", () => {
    writeProgress("2021", 44, 128);
    writeProgress("2020", 10, 124);
    expect(readProgress()).toEqual({
      "2021": { page: 44, total: 128 },
      "2020": { page: 10, total: 124 },
    });
  });

  it("overwrites only the year it was called for", () => {
    writeProgress("2021", 44, 128);
    writeProgress("2021", 90, 128);
    expect(readProgress()).toEqual({ "2021": { page: 90, total: 128 } });
  });

  it("survives corrupt JSON instead of throwing", () => {
    store.set("excelsior-progress", "{not json");
    expect(readProgress()).toEqual({});
  });

  it("returns {} and no-ops when localStorage is unavailable", () => {
    delete g.localStorage;
    expect(readProgress()).toEqual({});
    expect(() => writeProgress("2021", 1, 128)).not.toThrow();
  });
});
