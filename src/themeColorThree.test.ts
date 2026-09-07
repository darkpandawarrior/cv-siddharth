import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readColor } from "./themeColorThree.ts";

// ponytail: same stub as themeColor.test.ts — this file exists only to keep
// readColor's one line of behaviour (Color wraps readToken) covered after the
// split off themeColor.ts (three.js kept out of the SSR-reachable half).
const vars = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
const had = "document" in g;

beforeEach(() => {
  vars.clear();
  g.document = { documentElement: {} };
  g.getComputedStyle = () => ({ getPropertyValue: (k: string) => vars.get(k) ?? "" });
});

afterAll(() => {
  if (!had) delete g.document;
});

describe("themeColorThree", () => {
  it("readColor yields a three Color carrying the token value", () => {
    vars.set("--color-signal", "#3ddc84");
    expect(readColor("--color-signal", "#000000").getHexString()).toBe("3ddc84");
  });
});
