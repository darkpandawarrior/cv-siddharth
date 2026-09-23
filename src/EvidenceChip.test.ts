// ponytail: no .test.tsx here — vitest.config.ts runs this project with no
// jsdom and an `include` glob scoped to `*.test.ts` (see themeColor.test.ts,
// world/input.test.ts and friends: this repo deliberately tests React logic
// as plain functions and reaches for `renderToString` only, never
// @testing-library/react). `createElement` stands in for JSX so this file
// can stay a plain `.ts` module under that same convention.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { EvidenceChip, resolveState } from "./EvidenceChip.tsx";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("resolveState", () => {
  // chess.ts carries a 21-day SLA (freshnessSla.ts SLA_DAYS), so DEGRADED
  // starts at floor(21 * 2/3) = 14 days and BROKEN past 21.
  it("OK: a fresh stamp", () => {
    expect(resolveState(daysAgo(0), undefined, "chess.ts")).toBe("OK");
  });

  it("DEGRADED: past two-thirds of the SLA but not past it", () => {
    expect(resolveState(daysAgo(15), undefined, "chess.ts")).toBe("DEGRADED");
  });

  it("BROKEN: past the SLA", () => {
    expect(resolveState(daysAgo(25), undefined, "chess.ts")).toBe("BROKEN");
  });

  it("no-stamp: no stamp and no cadence override", () => {
    expect(resolveState(undefined, undefined, "some-file.ts")).toBe("no-stamp");
  });

  it("manual: cadence='manual' wins even over a very stale stamp", () => {
    expect(resolveState(daysAgo(900), "manual", "store.ts")).toBe("manual");
  });

  it("manual: cadence='manual' with no stamp at all", () => {
    expect(resolveState(undefined, "manual", "excelsior.ts")).toBe("manual");
  });
});

describe("EvidenceChip hydration safety", () => {
  it("SSR renders only the absolute date, never a state word", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "chess.ts", stamp: "2026-09-01", source: "x" }),
    );
    expect(html).toContain("as of 2026-09-01");
    expect(html).not.toMatch(/\bOK\b/);
    expect(html).not.toMatch(/\bDEGRADED\b/);
    expect(html).not.toMatch(/\bBROKEN\b/);
  });

  it("SSR with no stamp renders no state word either (no-stamp text is client-only)", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "some-file.ts", source: "x" }),
    );
    expect(html).not.toContain("cadence not tracked");
    expect(html).not.toMatch(/\bOK\b|\bDEGRADED\b|\bBROKEN\b/);
  });

  it("links to /ops#<file> and carries the file name in the anchor", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "weeb.ts", stamp: "2026-09-01", source: "y" }),
    );
    expect(html).toContain('href="/ops#weeb.ts"');
    expect(html).toContain("data-evidence-chip");
  });
});
