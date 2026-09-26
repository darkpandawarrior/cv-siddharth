import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LoopdownCast, castArt, seriesArt, leadCastIdOf, isSummoned, newestLiveLesson, lessonAgeLabel } from "./LoopdownCast.tsx";
import { loopdownArt } from "./data/loopdownArt.ts";
import { writing } from "./data/writing.ts";

// Named .test.ts, not .test.tsx, matching VoiceMeasured.test.ts / AnimatedMetric.test.ts:
// written with createElement rather than JSX so it needs no change to
// vitest.config.ts's include pattern (a file this lane does not own), which
// only picks up src/**/*.test.ts.
const html = renderToStaticMarkup(createElement(LoopdownCast));

describe("castArt / seriesArt", () => {
  it("finds a cast entry by id and never a series entry with the same id space", () => {
    const a = castArt("the-archivist");
    expect(a?.kind).toBe("cast");
    expect(castArt("chain-of-custody")).toBeUndefined(); // that id is a series, not cast
  });

  it("finds a series entry by id", () => {
    const s = seriesArt("sensors-who-lie");
    expect(s?.kind).toBe("series");
  });
});

describe("isSummoned (the lesson-cast join, never a hand-kept list)", () => {
  it("is derived from writing.cast, not the manifest's own 13", () => {
    const summonedIds = new Set(writing.cast.map((c) => c.id));
    for (const c of loopdownArt.filter((a) => a.kind === "cast")) {
      expect(isSummoned(c.id)).toBe(summonedIds.has(c.id));
    }
  });

  it("has at least one cast member waiting in the wings on the committed data (break-it pair)", () => {
    const waiting = loopdownArt.filter((a) => a.kind === "cast" && !isSummoned(a.id));
    expect(waiting.length).toBeGreaterThan(0);
  });
});

describe("leadCastIdOf", () => {
  it("reads the series' first billed cast id", () => {
    const s = seriesArt("sensors-who-lie")!;
    expect(leadCastIdOf("sensors-who-lie")).toBe(s.castIds[0]);
  });

  it("is undefined for an unknown or missing series id", () => {
    expect(leadCastIdOf(undefined)).toBeUndefined();
    expect(leadCastIdOf("not-a-real-series")).toBeUndefined();
  });
});

describe("newestLiveLesson", () => {
  it("is the max by created among lessons with a real publish link, not lessons[0]", () => {
    const live = writing.lessons.filter((l) => l.links?.devto || l.links?.hashnode || l.links?.medium || l.links?.linkedin);
    const expected = [...live].sort((a, b) => (b.created || "").localeCompare(a.created || ""))[0];
    expect(newestLiveLesson()?.slug).toBe(expected.slug);
  });
});

describe("lessonAgeLabel", () => {
  it("is null before the client clock mounts (SSR)", () => {
    expect(lessonAgeLabel("2026-09-02", null)).toBeNull();
  });

  it("computes whole days between the created date and now", () => {
    expect(lessonAgeLabel("2026-09-02", new Date("2026-09-24T03:15:00+05:30"))).toBe("published 21 d ago");
  });

  it("reads 'published today' for a same-day lesson (break-it pair for the day-0 branch)", () => {
    expect(lessonAgeLabel("2026-09-24", new Date("2026-09-24T20:00:00Z"))).toBe("published today");
  });
});

describe("LoopdownCast", () => {
  it("renders all 13 cast portraits, each with its manifest alt text", () => {
    const cast = loopdownArt.filter((a) => a.kind === "cast");
    expect(cast).toHaveLength(13);
    for (const c of cast) {
      expect(html).toContain(`data-testid="cast-${c.id}"`);
      // renderToStaticMarkup HTML-escapes the alt text (apostrophes become
      // &#x27; etc.), so compare against a fresh render of just that string
      // rather than hand-rolling the escaping rules here.
      const escapedAlt = renderToStaticMarkup(createElement("img", { alt: c.alt })).match(/alt="([^"]*)"/)![1];
      expect(html, c.id).toContain(`alt="${escapedAlt}"`);
    }
  });

  it("marks exactly the not-yet-summoned members data-summoned=\"false\"", () => {
    const waiting = loopdownArt.filter((a) => a.kind === "cast" && !isSummoned(a.id));
    for (const c of waiting) {
      expect(html).toContain(`data-testid="cast-${c.id}" data-summoned="false"`);
      expect(html).toContain("not yet summoned");
    }
  });

  it("has no em dash in its rendered copy", () => {
    expect(html.includes("—")).toBe(false);
  });
});
