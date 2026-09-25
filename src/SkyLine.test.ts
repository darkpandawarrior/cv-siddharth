// ponytail: no .test.tsx here — same reasoning as EvidenceChip.test.ts:
// vitest.config.ts scopes `include` to `*.test.ts` with no jsdom, so React
// logic is tested as plain functions and `renderToString`, never
// @testing-library/react. `createElement` stands in for JSX.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SkyLine, dotVisible, dotColor, dotLeftPct, horizonBackground, srSentence } from "./SkyLine.tsx";
import { skyState, type SkyState } from "./lib/sky.ts";

const NOON = new Date("2026-09-24T12:27:00+05:30");
const noon = (): SkyState => skyState(NOON, null);

describe("dotVisible", () => {
  it("hidden at night, shown in every other daypart", () => {
    expect(dotVisible("night")).toBe(false);
    for (const d of ["dawn", "golden", "day", "dusk"] as const) expect(dotVisible(d)).toBe(true);
  });
});

describe("dotColor", () => {
  it("signal green in day, amber everywhere else it renders", () => {
    expect(dotColor("day")).toBe("var(--color-signal)");
    expect(dotColor("golden")).toBe("var(--color-accent)");
    expect(dotColor("dawn")).toBe("var(--color-accent)");
    expect(dotColor("dusk")).toBe("var(--color-accent)");
  });
});

describe("dotLeftPct", () => {
  it("clamps to the line: 0 at or before sunrise, 100 at or after sunset", () => {
    expect(dotLeftPct(-0.02)).toBe(0);
    expect(dotLeftPct(0)).toBe(0);
    expect(dotLeftPct(0.5)).toBe(50);
    expect(dotLeftPct(1)).toBe(100);
    expect(dotLeftPct(1.02)).toBe(100);
  });
});

describe("horizonBackground", () => {
  it("null sky (SSR/pre-mount) falls back to the plain line colour", () => {
    expect(horizonBackground(null)).toBe("var(--color-line)");
  });
  it("mixes the live k.horizon 35% into --color-line", () => {
    const sky = noon();
    expect(horizonBackground(sky)).toBe(`color-mix(in srgb, ${sky.k.horizon} 35%, var(--color-line))`);
  });
});

describe("srSentence", () => {
  it("reads 'Pune sun, altitude N°, computed. Sunrise HH:MM, sunset HH:MM IST.'", () => {
    const sky = noon();
    const text = srSentence(sky);
    expect(text).toMatch(/^Pune sun, altitude -?\d+°, computed\. Sunrise \d{2}:\d{2}, sunset \d{2}:\d{2} IST\.$/);
  });
});

describe("SkyLine SSR (hydration safety, P7)", () => {
  it("renders a bare hairline with no dot and no daypart/progress attributes", () => {
    const html = renderToString(createElement(SkyLine));
    expect(html).toContain("data-sky-line");
    expect(html).not.toContain("data-daypart=");
    expect(html).not.toContain("data-sun-progress=");
    // No accessible sentence pre-mount: the exact sunrise/sunset instant
    // depends on the render clock, which SSR and the first client render
    // are never guaranteed to share to the second.
    expect(html).not.toContain("Pune sun,");
  });

  it("is deterministic: two renders produce identical markup", () => {
    const a = renderToString(createElement(SkyLine));
    const b = renderToString(createElement(SkyLine));
    expect(a).toBe(b);
  });
});
