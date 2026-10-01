import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { education } from "../../../data/profile/core.ts";
import { experience } from "../../../data/profile/experience.ts";
import { lifePlaces } from "../../../data/profile/lifePlaces.ts";
import { openSource, recentGrowth } from "../../../data/profile/openSource.ts";
import { historyMonths } from "../../../data/history.ts";
import { fleetStats, storeApps, storeVerifiedAt } from "../../../data/store.ts";
import { GEOCODE } from "../../../data/globeGeo.ts";
import { LAYER_IDS } from "../globeStore.ts";
import { REACH_INSTALLS_CLAIM } from "../globeRows.ts";
import { buildStory, isStoryPlace, STORY_GEO, storyArc, storyDate, storyPlace } from "./index.ts";
import type { StoryEvent } from "./index.ts";

const chapters = buildStory();
const events = chapters.flatMap((c) => c.events);
const text = (s: string) => s.replaceAll("—", ",");
const byId = (id: string) => events.find((e) => e.id === id)!;

/** A path-looking string is not evidence. Resolve against the actual repo so a
 * typo or injected unsourced event fails even when its prose looks plausible. */
function checkSources(items: StoryEvent[]) {
  for (const event of items) {
    expect(event.source).toMatch(/^src\/data\/[^.].*\.ts$/);
    expect(existsSync(resolve(event.source)), event.source).toBe(true);
    if (event.metric) expect(existsSync(resolve(event.metric.source)), event.metric.source).toBe(true);
  }
}

describe("story evidence", () => {
  it("every event cites an existing source file", () => checkSources(events));
  it("rejects an unsourced event", () => {
    expect(() => checkSources([{ ...events[0], source: "src/data/not-a-real-source.ts" }])).toThrow();
  });
  it("orders chapters and all events chronologically without filling partial dates", () => {
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    expect(chapters.map((c) => c.events[0].date)).toEqual([...chapters.map((c) => c.events[0].date)].sort());
    expect(byId("education").date).toBe(education.period.split(" - ")[0]);
    expect(byId("education").precision).toBe("year");
    for (const e of events) {
      expect(e.date.length).toBe({ year: 4, month: 7, day: 10 }[e.precision]);
      expect(e.dateNote).toContain(`${e.precision} precision`);
    }
  });
  it("matches every title, detail and numeric metric to imported source values", () => {
    // Exhaustive IDs make the test fail for a new event until its actual data
    // oracle is added. Whole-string equality catches number changes in prose,
    // including versions, install suffixes and education/role date ranges.
    const ids: string[] = [];
    function check(id: string, source: StoryEvent["source"], title: string, detail: string) {
      ids.push(id);
      expect(byId(id)).toMatchObject({ source, title: text(title), detail: text(detail) });
    }
    for (const p of lifePlaces) {
      const raw = p.from ?? p.to;
      if (raw === undefined) continue; // Mumbai: undated, no chapter
      check(`life:${p.slug}`, "src/data/profile/lifePlaces.ts", `${p.city}, ${p.country}`, p.line);
      expect(byId(`life:${p.slug}`).date).toBe(String(raw));
      expect(byId(`life:${p.slug}`).dateNote).toContain(p.dateNote ?? "Owner's account; year only");
      expect(byId(`life:${p.slug}`).place?.name).toBe(`${p.city}, ${p.country}`);
    }
    expect(byId("life:kuwait-city").dateNote).toContain("left in 2017, earlier years not recorded");
    check("education", "src/data/profile/core.ts", education.school, `${education.degree} · ${education.period}`);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (const role of experience) {
      const id = `role:${role.company}`;
      check(id, "src/data/profile/experience.ts", role.company, `${role.role} · ${role.period} · ${role.location}`);
      const [month, year] = role.period.split(" - ")[0].split(" ");
      expect(byId(id).date).toBe(`${year}-${String(months.indexOf(month) + 1).padStart(2, "0")}`);
      expect(byId(id).place).toEqual(storyPlace(role.location));
    }
    recentGrowth.forEach((g, i) => {
      if (!/^\w{3} \d{4}$/.test(g.date)) return;
      check(`growth:${i}`, "src/data/profile/openSource.ts", g.title, g.detail);
      const [month, year] = g.date.split(" ");
      expect(byId(`growth:${i}`).date).toBe(`${year}-${String(months.findIndex((m) => m.startsWith(month)) + 1).padStart(2, "0")}`);
    });
    for (const org of new Set(openSource.filter((p) => p.status === "merged").map((p) => p.org))) {
      const pr = openSource.filter((p) => p.org === org && p.status === "merged").sort((a, b) => a.date.localeCompare(b.date))[0];
      check(`oss:${org}`, "src/data/profile/openSource.ts", pr.title, `${pr.repo} · ${pr.status}`);
      expect(byId(`oss:${org}`).date).toBe(pr.date);
      expect(byId(`oss:${org}`).dateNote).toContain("not a verified merge timestamp");
    }
    check("portfolio", "src/data/history.ts", historyMonths[0].subjects[0], historyMonths[0].subjects[0]);
    expect(byId("portfolio").date).toBe(historyMonths[0].ym);
    expect(byId("portfolio").metric).toEqual({ label: "commits", value: historyMonths[0].commits, unit: "commits", source: "src/data/history.ts" });
    for (const app of storeApps) {
      const id = `store:${app.id}`;
      check(id, "src/data/store.ts", app.name, `${app.installs} · ${app.role} · ${app.employer}`);
      expect(byId(id).metric).toEqual({ label: "installs", value: app.installs, unit: "Play install band", source: "src/data/store.ts" });
    }
    check("install-floor", "src/data/store.ts", "Play Store listings", REACH_INSTALLS_CLAIM);
    expect(byId("install-floor").metric).toEqual({ label: "install floor", value: fleetStats.installFloor, unit: "installs", source: "src/data/store.ts" });
    expect(events.filter((e) => e.metric).map((e) => e.id).sort()).toEqual(["portfolio", "install-floor", ...storeApps.map((a) => `store:${a.id}`)].sort());
    expect(events.map((e) => e.id).sort()).toEqual(ids.sort());
    for (const event of events.filter((e) => e.source === "src/data/store.ts")) {
      expect(event.date).toBe(storeVerifiedAt);
      expect(event.dateNote).toContain("snapshot, not a threshold crossing");
    }
  });
  it("keeps copy free of em dashes and does not emit undated ranges", () => {
    expect(JSON.stringify(chapters)).not.toContain("—");
    recentGrowth.forEach((g, i) => {
      if (g.date.includes(" - ")) expect(events.some((e) => e.id === `growth:${i}`)).toBe(false);
    });
    expect(buildStory()).toEqual(chapters);
  });
});

describe("geography guards", () => {
  it("reuses the sole supported city with exact coordinates", () => {
    expect(STORY_GEO["Pune, India"]).toEqual({ name: "Pune, India", ...GEOCODE["Pune, India"] });
    for (const event of events) if (event.place) expect(isStoryPlace(event.place)).toBe(true);
    expect(storyPlace("Remote, India")).toBeUndefined();
    expect(storyPlace("Contract, India")).toBeUndefined();
    // Only the exact registered name resolves; a looser spelling does not.
    expect(storyPlace("Bhopal")).toBeUndefined();
    expect(storyPlace("Bhopal, India")?.lat).toBe(23.25);
    expect(isStoryPlace({ ...STORY_GEO["Pune, India"], lat: 0 })).toBe(false);
    expect(isStoryPlace({ name: "Unknown", lat: 0, lon: 0 })).toBe(false);
  });
  it("puts all reach without geography above Pune, with valid layer IDs", () => {
    for (const chapter of chapters) {
      const place = chapter.events[0].place;
      expect(chapter.camera.focus).toEqual(place ?? "height over Pune");
      expect(chapter.camera.anchor).toEqual(place ?? STORY_GEO["Pune, India"]);
      expect(chapter.camera.distance).toBeGreaterThan(0);
      expect(chapter.camera.emphasise.length).toBeGreaterThan(0);
      for (const layer of chapter.camera.emphasise) expect(LAYER_IDS).toContain(layer);
      // Only roles (their location field), education (the school names its
      // city) and life chapters (the owner's own account) may stand on a
      // place; everything else is height over Pune.
      if (!chapter.id.startsWith("role:") && !chapter.id.startsWith("life:") && chapter.id !== "education") expect(place).toBeUndefined();
    }
  });
  it("never draws a journey between unknown places or between the same city", () => {
    const pune = STORY_GEO["Pune, India"];
    const fake = { name: "Invented", lat: 0, lon: 0 };
    for (const [a, b] of [[undefined, pune], [pune, undefined], [fake, pune], [pune, fake], [pune, pune]]) expect(storyArc(a, b)).toBeUndefined();
    // The life path, city to city, in chronological chapter order — never a
    // role chapter (the 2020 internship gets no arc).
    expect(chapters.flatMap((c) => c.arcs).map((a) => `${a.from.name}->${a.to.name}`)).toEqual([
      "Kuwait City, Kuwait->Bhopal, India",
      "Kuwait City, Kuwait->Mumbai, India",
      "Bhopal, India->Chandigarh, India",
      "Chandigarh, India->Pune, India",
    ]);
    for (const arc of chapters.flatMap((c) => c.arcs)) {
      expect(isStoryPlace(arc.from)).toBe(true);
      expect(isStoryPlace(arc.to)).toBe(true);
    }
    expect(chapters.filter((c) => c.id.startsWith("role:")).every((c) => c.arcs.length === 0)).toBe(true);
  });
});

it("parses only unambiguous dates and validates the calendar", () => {
  expect(storyDate("2024-02-29")).toEqual({ date: "2024-02-29", precision: "day" });
  expect(storyDate("Jun 2026")).toEqual({ date: "2026-06", precision: "month" });
  expect(storyDate("June 2026")).toEqual(storyDate("Jun 2026"));
  for (const raw of ["Present", "Jun - Aug 2026", "2023-02-29", "2026-13", "2026-00", "2026-01-00", "2026-04-31", "06/01/2026", "Nope 2026", ""]) expect(storyDate(raw)).toBeUndefined();
});

describe("the life path", () => {
  it("orders Kuwait before education (both 2017, stable sort on insertion order)", () => {
    const story = buildStory();
    const kuwaitIdx = story.findIndex((c) => c.id === "life:kuwait-city");
    const eduIdx = story.findIndex((c) => c.id === "education");
    expect(kuwaitIdx).toBeGreaterThanOrEqual(0);
    expect(kuwaitIdx).toBeLessThan(eduIdx);
  });

  it("draws exactly three arcs, one per life transition, never touching a role chapter", () => {
    const story = buildStory();
    const withArcs = story.filter((c) => c.arcs.length > 0 && !c.arcs[0].familyMove);
    const family = story.find((chapter) => chapter.id === "life:mumbai")!;
    expect(family.events[0].date).toBe("2019-07");
    expect(family.arcs[0]).toMatchObject({ familyMove: true, from: { name: "Kuwait City, Kuwait" }, to: { name: "Mumbai, India" } });
    expect(withArcs.map((c) => c.id)).toEqual(["education", "life:chandigarh", "life:pune"]);
    expect(withArcs[0].arcs[0].from.name).toBe("Kuwait City, Kuwait");
    expect(withArcs[0].arcs[0].to.name).toBe("Bhopal, India");
    expect(withArcs[1].arcs[0].from.name).toBe("Bhopal, India");
    expect(withArcs[1].arcs[0].to.name).toBe("Chandigarh, India");
    expect(withArcs[2].arcs[0].from.name).toBe("Chandigarh, India");
    expect(withArcs[2].arcs[0].to.name).toBe("Pune, India");
  });

  it("gives every source-dated life place exactly one chapter", () => {
    const story = buildStory();
    for (const p of lifePlaces) {
      const hasChapter = story.some((c) => c.id === `life:${p.slug}`);
      expect(hasChapter, p.slug).toBe(true);
    }
  });
});
