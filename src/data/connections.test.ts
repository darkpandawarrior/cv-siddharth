import { describe, expect, it } from "vitest";
import { RELATED_SERIES } from "./connections.ts";
import { SERIES_COLOR, SERIES_PROJECT, PROJECT_SLUG_BY_NAME, accentOf, lessonsFor } from "./writingMeta.ts";
import { writing } from "./writing.ts";
import { caseStudies, projects } from "./profile.ts";

/**
 * THE MAPS ROT IN ONE DIRECTION AND NOBODY SEES IT.
 *
 * writing.ts is regenerated from the-loopdown on every prebuild. The three
 * maps that decorate it — RELATED_SERIES here, SERIES_COLOR and SERIES_PROJECT
 * in writingMeta.ts — are hand-kept, and all three were written on the same
 * day against the same five series. Three series have arrived upstream since.
 * Nothing broke: a series with no entry still renders, just with no field-note
 * chip, no back-link and, before accentOf derived them, whatever colour the
 * fallback happened to be. Silent omission on a page whose entire argument is
 * that work and writing connect.
 *
 * A dev-only console warning was the other option. A red test is louder, and
 * these pages are prebuilt SSR, so nobody would be watching a console anyway.
 */
const seriesIds = new Set(writing.series.map((s) => s.id));

/** Which build the registry itself says a series came from. `project` is an
 *  upstream field, so this is empty until gen-loopdown carries it through —
 *  the assertion works either way, the failure message is just richer once it
 *  does. */
const upstreamProject = (id: string) =>
  (writing.lessons as { series?: string; project?: string }[]).find((l) => l.series === id && l.project)?.project;

describe("the hand-kept maps still describe the generated registry", () => {
  const named = [
    ["RELATED_SERIES", [...new Set(Object.values(RELATED_SERIES).flat())]],
    ["SERIES_COLOR", Object.keys(SERIES_COLOR)],
    ["SERIES_PROJECT", Object.keys(SERIES_PROJECT)],
  ] as const;

  it.each(named)("%s names only series that exist upstream", (name, ids) => {
    const stale = ids.filter((id) => !seriesIds.has(id));
    expect(stale, `${name} still lists ${stale.join(", ")}, which the-loopdown no longer publishes. Renamed or retired upstream, so the entry decorates nothing.`).toEqual([]);
  });

  it("keys RELATED_SERIES only by a project or case study this site actually has", () => {
    const slugs = new Set([...projects.map((p) => p.slug), ...caseStudies.map((c) => c.slug)]);
    const orphans = Object.keys(RELATED_SERIES).filter((k) => !slugs.has(k));
    expect(orphans, `RELATED_SERIES is keyed by ${orphans.join(", ")}, which matches no project or case study in profile.ts — the chips it feeds link nowhere.`).toEqual([]);
  });

  it.each([...seriesIds])("%s has a home and a back-link", (id) => {
    const hint = upstreamProject(id);
    const where = hint ? `the-loopdown attributes its lessons to ${hint}` : "check the-loopdown registry for the project its lessons name";
    expect(
      Object.values(RELATED_SERIES).some((v) => v.includes(id)),
      `${id} is unlinked: ${where} — add it under that project's slug in RELATED_SERIES.`,
    ).toBe(true);
    expect(
      SERIES_PROJECT[id],
      `${id} has no back-link: ${where} — add an entry in writingMeta.ts's SERIES_PROJECT.`,
    ).toBeDefined();
  });

  // No colour assertion here. Accents are derived from writing.series now, so
  // coverage is structural rather than something a person can forget;
  // writingMeta.test.ts asserts the property that actually matters, which is
  // that no two series share one.
  it("gives every series an accent without a pinned entry", () => {
    for (const id of seriesIds) expect(accentOf(id)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

/**
 * lessonsFor(slug) is the lesson-level counterpart to fieldNotesFor above:
 * per-lesson links instead of per-series chips. Same rot risk, same fix —
 * check the hand-kept PROJECT_SLUG_BY_NAME map against what writing.ts and
 * profile.ts actually say, rather than trust it stays in sync on its own.
 */
describe("lessonsFor's project map stays honest", () => {
  const registryNames = new Set(projects.map((p) => p.name));
  const lessonProjectNames = new Set(
    writing.lessons.map((l) => l.project).filter((p): p is string => Boolean(p)),
  );

  it("maps every registry project a lesson actually names", () => {
    const unmapped = [...lessonProjectNames].filter(
      (name) => registryNames.has(name) && !(name in PROJECT_SLUG_BY_NAME),
    );
    expect(
      unmapped,
      `writing.ts names ${unmapped.join(", ")} as a lesson's project, and profile.ts has a ` +
        `project by that exact name, but PROJECT_SLUG_BY_NAME in writingMeta.ts has no entry for ` +
        `it — its lessons will not show up on that project's page.`,
    ).toEqual([]);
  });

  it("names only a real registry slug, or a name the registry does not carry", () => {
    const slugs = new Set(projects.map((p) => p.slug));
    const badSlugs = Object.values(PROJECT_SLUG_BY_NAME).filter((s) => !slugs.has(s));
    expect(badSlugs, `PROJECT_SLUG_BY_NAME points at ${badSlugs.join(", ")}, which is not a slug in profile.ts.`).toEqual([]);
  });

  it("gives every project-slug key in RELATED_SERIES at least one lesson via lessonsFor", () => {
    const projectSlugs = new Set(projects.map((p) => p.slug));
    const keyedProjects = Object.keys(RELATED_SERIES).filter((k) => projectSlugs.has(k));
    for (const slug of keyedProjects) {
      expect(
        lessonsFor(slug).length,
        `${slug} is keyed in RELATED_SERIES but lessonsFor(${slug}) found no lesson naming it as ` +
          `project — check writing.ts's project field and writingMeta.ts's PROJECT_SLUG_BY_NAME.`,
      ).toBeGreaterThan(0);
    }
  });
});
