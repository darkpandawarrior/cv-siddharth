import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readToken, readColor } from "./themeColor";

// ponytail: stub the two globals rather than pull in jsdom. readToken touches
// exactly `document.documentElement` + `getComputedStyle`, so this exercises the
// real logic — and keeps the repo off a devDependency it does not otherwise need.
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

describe("themeColor", () => {
  it("follows a token change — the whole point of the bridge", () => {
    vars.set("--color-signal", "#3ddc84");
    expect(readToken("--color-signal", "#000000")).toBe("#3ddc84");

    // Swap the theme. A hardcoded scene colour would NOT move; this must.
    vars.set("--color-signal", "#d9a441");
    expect(readToken("--color-signal", "#000000")).toBe("#d9a441");
  });

  it("does not cache — a stale read is the bug being fixed", () => {
    vars.set("--color-signal", "#111111");
    readToken("--color-signal", "#000000");
    vars.set("--color-signal", "#222222");
    expect(readToken("--color-signal", "#000000")).toBe("#222222");
  });

  it("falls back when the token is absent or empty", () => {
    expect(readToken("--nope", "#abcdef")).toBe("#abcdef");
    vars.set("--empty", "   ");
    expect(readToken("--empty", "#abcdef")).toBe("#abcdef");
  });

  it("survives having no DOM at all (SSR) instead of throwing", () => {
    delete g.document;
    expect(readToken("--color-signal", "#abcdef")).toBe("#abcdef");
  });

  it("readColor yields a three Color carrying the token value", () => {
    vars.set("--color-signal", "#3ddc84");
    expect(readColor("--color-signal", "#000000").getHexString()).toBe("3ddc84");
  });
});
