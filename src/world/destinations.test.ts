import { describe, expect, it } from "vitest";
import { destinations, landmarkDestinations, roomDestinations, projectDestinations, caseStudyDestinations } from "./destinations.ts";
import { projects, caseStudies } from "../data/profile.ts";
import { ROOMS } from "../rooms.tsx";
import { CAR_RADIUS } from "./drive.ts";

// The drift guard this file exists for: a project/case-study/room added to
// its source array without a matching destination becomes something you
// can drive right through with no way in — the exact defect PART 1 was
// meant to close. Counts are asserted as relationships to the source
// arrays, never as literals, so this test never needs updating when a new
// project ships.
describe("destinations()", () => {
  it("has exactly one destination per room, project and case study", () => {
    expect(roomDestinations()).toHaveLength(ROOMS.length);
    expect(projectDestinations()).toHaveLength(projects.length);
    expect(caseStudyDestinations()).toHaveLength(caseStudies.length);
    expect(destinations()).toHaveLength(ROOMS.length + projects.length + caseStudies.length);
  });

  it("gives every destination a unique key", () => {
    const keys = destinations().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every destination a finite position and a positive approach volume", () => {
    for (const d of destinations()) {
      for (const v of [...d.position, ...d.approachHalf]) expect(Number.isFinite(v)).toBe(true);
      for (const h of d.approachHalf) expect(h).toBeGreaterThan(0);
    }
  });

  it("landmarkDestinations() excludes rooms — Pavilions.tsx already owns those", () => {
    for (const d of landmarkDestinations()) expect(d.kind).not.toBe("room");
    expect(landmarkDestinations()).toHaveLength(projects.length + caseStudies.length);
  });

  it("sizes every landmark's approach volume beyond its solid footprint's resting distance", () => {
    // districtWest.ts's own footprint is `t.width/2` (projects) or
    // `m.radius` (case studies); drive.ts's resolveCollisions never lets the
    // car's centre closer than that + CAR_RADIUS. An approach box any
    // smaller than that would never fire — the car could never get inside it.
    for (const d of landmarkDestinations()) {
      expect(d.approachHalf[0]).toBeGreaterThan(CAR_RADIUS);
      expect(d.approachHalf[2]).toBeGreaterThan(CAR_RADIUS);
    }
  });

  it("resolves every case-study detail link the same way /hire does — a project link only when the slug is also a project", () => {
    const projectSlugs = new Set(projects.map((p) => p.slug));
    for (const d of caseStudyDestinations()) {
      if (projectSlugs.has(d.slug)) {
        expect(d.detailLink).toEqual({ kind: "project", slug: d.slug });
      } else {
        expect(d.detailLink).toEqual({ kind: "home-anchor", hash: d.slug });
      }
    }
  });

  it("gives every project a project detail link", () => {
    for (const d of projectDestinations()) {
      expect(d.detailLink).toEqual({ kind: "project", slug: d.slug });
    }
  });

  it("never invents content — every project's bullets/tags/links are the same reference profile.ts holds", () => {
    for (const d of projectDestinations()) {
      const p = projects.find((x) => x.slug === d.slug)!;
      expect(d.bullets).toBe(p.highlights);
      expect(d.tags).toBe(p.badges);
      expect(d.externalLinks).toBe(p.links);
    }
  });
});
