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

  it("preserves source-backed month precision and distinguishes the family move", () => {
    expect(lifePlaces.find((place) => place.slug === "mumbai")).toMatchObject({ from: "2019-07", dateNote: "Owner's account, 2026-09-30; family move" });
    expect(lifePlaces.find((place) => place.slug === "chandigarh")?.from).toBe("2021-01");
    expect(lifePlaces.find((place) => place.slug === "pune")?.from).toBe("2023-06");
    expect(lifePlaces.find((place) => place.slug === "bhopal")?.from).toBe(2017);
    expect(lifePlaces.find((place) => place.slug === "kuwait-city")?.to).toBe(2017);
  });
});
