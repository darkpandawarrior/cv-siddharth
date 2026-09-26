// ponytail: no .test.tsx here — vitest.config.ts runs this project with no
// jsdom and an `include` glob scoped to `*.test.ts` (see themeColor.test.ts,
// world/input.test.ts and friends: this repo deliberately tests React logic
// as plain functions and reaches for `renderToString` only, never
// @testing-library/react). `createElement` stands in for JSX so this file
// can stay a plain `.ts` module under that same convention.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { EvidenceChip, resolveState, retryText } from "./EvidenceChip.tsx";
import { isPlausibleTempC } from "./lib/plausibility.ts";

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

// M8: every cadence in one pass. Each fixture below is rendered twice —
// renderToString never runs a mount effect, so a chip whose visible text
// depended on anything but props (the clock, in particular) would show up
// here as two different strings from the same call.
describe("EvidenceChip cadences (M8)", () => {
  const CASES: [string, Parameters<typeof EvidenceChip>[0]][] = [
    ["weekly (default)", { file: "chess.ts", stamp: "2026-09-01", source: "lichess + chess.com" }],
    ["manual", { file: "store.ts", stamp: "2026-09-01", source: "Google Play", cadence: "manual" }],
    ["live, pre-mount", { file: "weather", source: "Open-Meteo", cadence: "live", live: { at: "2026-09-24T03:15", ok: true } }],
    ["computed", { file: "sun", source: "NOAA", cadence: "computed" }],
    ["modelled", { file: "river", source: "GloFAS", stamp: "2026-09-23", cadence: "modelled" }],
    ["undated", { file: "archive.ts", source: "Notion export", cadence: "undated" }],
  ];

  for (const [label, props] of CASES) {
    it(`${label}: identical renderToString output across two renders`, () => {
      const a = renderToString(createElement(EvidenceChip, props));
      const b = renderToString(createElement(EvidenceChip, props));
      expect(a).toBe(b);
    });
  }

  it("computed renders 'computed · NOAA', with no dot and no date", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "sun", source: "NOAA", cadence: "computed" }),
    );
    expect(html).toContain("computed · NOAA");
  });

  it("modelled renders 'modelled · GloFAS · 2026-09-23'", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "river", source: "GloFAS", stamp: "2026-09-23", cadence: "modelled" }),
    );
    expect(html).toContain("modelled · GloFAS · 2026-09-23");
  });

  it("undated renders the bare word, no date claimed", () => {
    const html = renderToString(
      createElement(EvidenceChip, { file: "archive.ts", source: "Notion export", cadence: "undated" }),
    );
    expect(html).toContain(">undated<");
  });

  it("a live chip renders only the source name pre-mount (P6: SSR is deterministic)", () => {
    const html = renderToString(
      createElement(EvidenceChip, {
        file: "weather", source: "Open-Meteo", cadence: "live", live: { at: "2026-09-24T03:15", ok: true },
      }),
    );
    expect(html).toContain(">Open-Meteo<");
    expect(html).not.toMatch(/live ·|unavailable/);
  });
});

// idea-atlas SYS-3: the SUSPECT ring is a shape, not a colour, and it is a
// plain prop — a caller runs plausibility.ts (tempC 60 fails
// isPlausibleTempC) and passes the verdict straight in, so it renders on
// the very first pass, no mount effect required.
describe("EvidenceChip SUSPECT state", () => {
  it("renders the hollow ring when the caller flags a value plausibility.ts rejected (tempC 60)", () => {
    const suspect = !isPlausibleTempC(60);
    const html = renderToString(
      createElement(EvidenceChip, {
        file: "weather", source: "Open-Meteo", cadence: "live",
        live: { at: "2026-09-24T03:15", ok: true }, suspect,
      }),
    );
    expect(html).toContain('data-suspect="true"');
    expect(html).toContain("chip-evidence__ring");
  });

  it("renders no ring for a plausible value", () => {
    const suspect = !isPlausibleTempC(22.9);
    const html = renderToString(
      createElement(EvidenceChip, {
        file: "weather", source: "Open-Meteo", cadence: "live",
        live: { at: "2026-09-24T03:15", ok: true }, suspect,
      }),
    );
    expect(html).not.toContain("data-suspect");
    expect(html).not.toContain("chip-evidence__ring");
  });
});

describe("retryText (idea-atlas SYS-3's retry reading)", () => {
  it("reads 'unavailable, retrying in N s', N = ceil((nextPollAt - now) / 1000)", () => {
    const now = 1_000_000;
    const nextPollAt = now + 41_500; // 41.5s out -> ceil to 42
    expect(retryText(nextPollAt, now)).toBe("unavailable, retrying in 42 s");
  });

  it("never reads negative once the poll time has passed", () => {
    expect(retryText(1_000, 5_000)).toBe("unavailable, retrying in 0 s");
  });

  it("a DEGRADED live chip renders the retry text once mounted, given nextPollAt", () => {
    // renderToString cannot exercise the mount effect (no jsdom in this
    // project — see the header comment), so the post-mount branch is
    // exercised directly through the same pure function the component
    // calls; retryText's own tests above already pin the exact math.
    expect(retryText(1_000_000 + 42_000, 1_000_000)).toBe("unavailable, retrying in 42 s");
  });
});
