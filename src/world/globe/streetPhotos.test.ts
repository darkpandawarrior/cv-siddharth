import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  parsePanoramaxFeatures,
  boundsToBboxParam,
  panoramaxSearchUrl,
  shouldRequery,
  photosToGeoJSON,
  formatCaptureDate,
  PANORAMAX_QUERY_LIMIT,
} from "./streetPhotos.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../e2e/fixtures/street/panoramax-pune.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const EMPTY_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../e2e/fixtures/street/panoramax-empty.json");
const emptyFixture = JSON.parse(readFileSync(EMPTY_FIXTURE, "utf8"));

describe("parsePanoramaxFeatures", () => {
  it("parses the committed real Pune fixture", () => {
    const photos = parsePanoramaxFeatures(fixture);
    expect(photos).not.toBeNull();
    expect(photos!.length).toBe(2);
    const first = photos![0];
    expect(first.id).toBe("5ea97644-0c58-4d2f-8ff4-427789916f64");
    expect(first.lat).toBeCloseTo(18.5196311, 6);
    expect(first.lon).toBeCloseTo(73.8399939, 6);
    expect(first.author).toBe("Devdatta");
    expect(first.licence).toBe("CC-BY-SA-4.0");
    expect(first.licenceUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(first.is360).toBe(true);
    expect(first.capturedAt).toBe("2022-11-09T03:15:55+00:00");
    expect(first.hdUrl).toContain("panoramax.openstreetmap.fr/images/");
    expect(first.sdUrl).toContain("/sd.jpg");
    expect(first.thumbUrl).toContain("/thumb.jpg");
  });

  it("returns an empty array (not null) for a bbox with no photos", () => {
    expect(parsePanoramaxFeatures(emptyFixture)).toEqual([]);
  });

  it("returns null on a malformed response rather than throwing", () => {
    expect(parsePanoramaxFeatures(null)).toBeNull();
    expect(parsePanoramaxFeatures({})).toBeNull();
    expect(parsePanoramaxFeatures({ features: "nope" })).toBeNull();
  });

  it("drops a feature missing coordinates or a thumbnail instead of crashing", () => {
    const bad = { features: [{ id: "x", geometry: { coordinates: [1] }, assets: {} }] };
    expect(parsePanoramaxFeatures(bad)).toEqual([]);
  });

  it("falls back sd -> thumb and hd -> sd when an asset is missing, and detects a non-360 photo", () => {
    const flat = {
      features: [
        {
          id: "flat-1",
          geometry: { coordinates: [73.84, 18.52] },
          assets: { thumb: { href: "https://panoramax.openstreetmap.fr/derivates/x/thumb.jpg" } },
          providers: [{ name: "Jordan Roe", roles: ["producer"] }],
          links: [{ rel: "license", href: "https://creativecommons.org/licenses/by-sa/4.0/" }],
          properties: {
            datetime: "2023-01-01T00:00:00+00:00",
            license: "CC-BY-SA-4.0",
            "pers:interior_orientation": { field_of_view: 75 },
          },
        },
      ],
    };
    const [photo] = parsePanoramaxFeatures(flat)!;
    expect(photo.sdUrl).toBe(photo.thumbUrl);
    expect(photo.hdUrl).toBe(photo.thumbUrl);
    expect(photo.is360).toBe(false);
    expect(photo.author).toBe("Jordan Roe");
  });
});

describe("boundsToBboxParam / panoramaxSearchUrl", () => {
  it("formats minLon,minLat,maxLon,maxLat", () => {
    expect(boundsToBboxParam({ west: 73.83, south: 18.51, east: 73.85, north: 18.53 })).toBe("73.830000,18.510000,73.850000,18.530000");
  });

  it("builds the search URL with the bbox and a limit", () => {
    const url = panoramaxSearchUrl({ west: 73.83, south: 18.51, east: 73.85, north: 18.53 });
    expect(url).toContain("https://api.panoramax.xyz/api/search?");
    expect(url).toContain("bbox=73.830000%2C18.510000%2C73.850000%2C18.530000");
    expect(url).toContain(`limit=${PANORAMAX_QUERY_LIMIT}`);
  });
});

describe("shouldRequery", () => {
  const base = { west: 73.83, south: 18.51, east: 73.85, north: 18.53 };

  it("always requeries when there is no previous bbox", () => {
    expect(shouldRequery(null, base)).toBe(true);
  });

  it("skips a re-query for a sub-threshold nudge", () => {
    expect(shouldRequery(base, { ...base, west: base.west + 0.0001 })).toBe(false);
  });

  it("requeries once the map has moved past the threshold", () => {
    expect(shouldRequery(base, { ...base, west: base.west + 0.01 })).toBe(true);
  });
});

describe("photosToGeoJSON", () => {
  it("builds one Point feature per photo, carrying id in properties", () => {
    const photos = parsePanoramaxFeatures(fixture)!;
    const fc = photosToGeoJSON(photos);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.coordinates).toEqual([photos[0].lon, photos[0].lat]);
    expect(fc.features[0].properties.id).toBe(photos[0].id);
  });
});

describe("formatCaptureDate", () => {
  it("formats a real Panoramax datetime", () => {
    expect(formatCaptureDate("2022-11-09T03:15:55+00:00")).toBe("9 Nov 2022");
  });

  it("returns null for an empty or unparseable string rather than inventing a date", () => {
    expect(formatCaptureDate("")).toBeNull();
    expect(formatCaptureDate("not-a-date")).toBeNull();
  });
});
