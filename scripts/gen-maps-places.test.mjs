import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/data/mapsGazetteer.ts";
import { isResidentialReview, nearResidential, publishesReview, RESIDENTIAL } from "./gen-maps-places.mjs";

// Synthetic fixtures only -- no real Takeout data, no network. Proves the
// rules a Codex verifier found missing: a broad-enough name match (co-op
// anywhere, not just "co-op housing"), a Takeout `residential` marker
// classifying a review even when its name doesn't match, and a photo within
// 300m of a home getting no exact pin even when a public place is also
// nearby.
//
// This file is `.test.mjs`, not `.test.ts`: vitest.config.ts's `include`
// only globs `scripts/**/*.test.mjs` (plain .mjs, matching the generator
// itself, which runs under node with no build step). A same-named `.test.ts`
// here silently never runs.
describe("gen-maps-places privacy rules", () => {
  it("classifies by name (housing society, CHS, residency, etc.)", () => {
    expect(isResidentialReview({ location: { name: "Lotus Residency Co-op Housing Society" } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Kamal CHS Ltd." } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Cafe Coffee Day" } })).toBe(false);
  });

  it("catches co-op/cooperative anywhere in the name, not only followed by 'housing'", () => {
    expect(RESIDENTIAL.test("Sunset Co-op")).toBe(true);
    expect(RESIDENTIAL.test("Sunset Cooperative")).toBe(true);
    expect(RESIDENTIAL.test("Lakeview Co-operative Stores")).toBe(true);
  });

  it("matches every required residential token, one pattern at a time", () => {
    for (const name of ["Green Housing Complex", "Silver Oak Society", "Kamal CHS", "Lotus Residency", "Palm Residences", "Marked Residential Plot", "Lotus Apartment", "Lotus Apartments", "Sea View Flat", "Sea View Flats"]) {
      expect(RESIDENTIAL.test(name), name).toBe(true);
    }
  });

  it("leaves public places (restaurants, cafes) unaffected", () => {
    for (const name of ["Cafe Coffee Day", "Barbeque Nation", "The Table Restaurant", "Starbucks Koregaon Park"]) {
      expect(RESIDENTIAL.test(name), name).toBe(false);
    }
  });

  it("classifies by a Takeout residential marker even when the name doesn't match", () => {
    expect(isResidentialReview({ residential: true, location: { name: "Cafe Coffee Day" } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Cafe Coffee Day", residential: true } })).toBe(true);
  });

  it("publishes a residential review only when the owner confirmed it is not a home, by exact name", () => {
    const society = { location: { name: "Kamal CHS Ltd." } };
    expect(publishesReview(society, new Set())).toBe(false);
    expect(publishesReview(society, new Set(["Kamal CHS Ltd."]))).toBe(true);
    expect(publishesReview(society, new Set(["Kamal CHS"]))).toBe(false);
    expect(publishesReview({ location: { name: "Cafe Coffee Day" } }, new Set())).toBe(true);
  });

  it("a photo within 300m of a home gets no exact pin, even with a public place also in range", () => {
    const home = { lat: 18.5204, lon: 73.8567 };
    const cafe = { lat: 18.521, lon: 73.857 }; // ~90m from home, also "nearby"
    expect(haversineKm(home.lat, home.lon, cafe.lat, cafe.lon)).toBeLessThan(0.3);
    expect(nearResidential(cafe.lat, cafe.lon, [home])).toBe(true);
  });

  it("a photo outside 300m of every home is unaffected", () => {
    const home = { lat: 18.5204, lon: 73.8567 };
    const farAway = { lat: 18.6, lon: 73.95 };
    expect(nearResidential(farAway.lat, farAway.lon, [home])).toBe(false);
  });
});
