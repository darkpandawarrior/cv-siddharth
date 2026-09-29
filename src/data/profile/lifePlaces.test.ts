import { describe, expect, it } from "vitest";
import { mapsGazetteer } from "../mapsGazetteer.ts";
import { STORY_GEO } from "../../world/globe/story/storyGeo.ts";
import { GEOCODE } from "../globeGeo.ts";
import { lifePlaceGeo, lifePlaces } from "./lifePlaces.ts";

describe("lifePlaces", () => {
  it("every slug exists in the gazetteer", () => {
    for (const p of lifePlaces) {
      expect(mapsGazetteer.some((c) => c.slug === p.slug), p.slug).toBe(true);
      expect(lifePlaceGeo(p.slug)).toBeDefined();
    }
  });

  it("Bhopal and Pune coordinates equal STORY_GEO and GEOCODE — no new numbers", () => {
    expect(lifePlaceGeo("bhopal")).toEqual({ lat: STORY_GEO["Bhopal, India"].lat, lon: STORY_GEO["Bhopal, India"].lon });
    expect(lifePlaceGeo("pune")).toEqual({ lat: GEOCODE["Pune, India"].lat, lon: GEOCODE["Pune, India"].lon });
  });

  it("only Mumbai is undated (no from/to)", () => {
    for (const p of lifePlaces) {
      if (p.slug === "mumbai") expect(p.from ?? p.to).toBeUndefined();
      else expect(p.from ?? p.to).toBeDefined();
    }
  });
});
