import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/data/mapsGazetteer.ts";
import { isResidentialReview, nearResidential } from "./gen-maps-places.mjs";

// Synthetic fixtures only -- no real Takeout data, no network. Proves the
// two rules a Codex verifier found missing: a Takeout `residential` marker
// classifies a review even when its name doesn't match, and a photo within
// 300m of a home gets no exact pin even when a public place is also nearby.
describe("gen-maps-places privacy rules", () => {
  it("classifies by name (housing society, CHS, residency, etc.)", () => {
    expect(isResidentialReview({ location: { name: "Aum Residency Co-op Housing Society" } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Shubhada CHS Ltd." } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Cafe Coffee Day" } })).toBe(false);
  });

  it("classifies by a Takeout residential marker even when the name doesn't match", () => {
    expect(isResidentialReview({ residential: true, location: { name: "Cafe Coffee Day" } })).toBe(true);
    expect(isResidentialReview({ location: { name: "Cafe Coffee Day", residential: true } })).toBe(true);
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
