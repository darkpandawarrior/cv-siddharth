import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mapsGazetteer, haversineKm } from "../mapsGazetteer.ts";
import { mapsByYear, mapsPhotos, mapsPlaces, mapsReviews, mapsTotals } from "./mapsPlaces.ts";

const gazetteerBySlug = new Map(mapsGazetteer.map((c) => [c.slug, c]));

describe("mapsPlaces", () => {
  it("represents every geotagged still, including one undecodable source, without fake images", () => {
    expect(mapsReviews).toHaveLength(66);
    expect(mapsPhotos).toHaveLength(118);
    expect(mapsPhotos.filter((photo) => photo.src)).toHaveLength(117);
    const unavailable = mapsPhotos.filter((photo) => photo.unavailable);
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].src).toBe("");
    expect(unavailable[0].unavailable).toContain("could not be decoded");
    expect(mapsTotals.photosUnavailable).toBe(1);
  });

  it("every month and photo pin obeys the public-place/centroid/grid privacy boundary", () => {
    for (const review of mapsReviews) {
      expect(review.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(review.rating).toBeGreaterThanOrEqual(1); expect(review.rating).toBeLessThanOrEqual(5);
    }
    for (const photo of mapsPhotos) {
      expect(photo.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      if (photo.precision === "review-nearby") {
        const review = mapsReviews.find((review) => review.id === photo.reviewId);
        expect(review).toBeDefined();
        expect(haversineKm(photo.lat, photo.lon, review!.lat, review!.lon)).toBeLessThanOrEqual(0.3);
      } else if (photo.precision === "city") {
        const city = gazetteerBySlug.get(photo.slug);
        expect(city).toBeDefined(); expect(photo.lat).toBe(city!.lat); expect(photo.lon).toBe(city!.lon);
      } else {
        expect(photo.lat * 10).toBeCloseTo(Math.round(photo.lat * 10), 8);
        expect(photo.lon * 10).toBeCloseTo(Math.round(photo.lon * 10), 8);
        expect(photo.city).toMatch(/^near /);
      }
    }
  });
  it("every place's lat/lon equals its gazetteer entry", () => {
    for (const p of mapsPlaces) {
      const city = gazetteerBySlug.get(p.slug);
      expect(city, p.slug).toBeDefined();
      expect(p.lat).toBe(city!.lat);
      expect(p.lon).toBe(city!.lon);
    }
  });

  it("years are integers from 2000 to 2100", () => {
    for (const p of mapsPlaces) {
      for (const y of p.years) {
        expect(Number.isInteger(y), `${p.slug} year ${y}`).toBe(true);
        expect(y).toBeGreaterThanOrEqual(2000);
        expect(y).toBeLessThanOrEqual(2100);
      }
    }
    for (const row of mapsByYear) {
      expect(Number.isInteger(row.year)).toBe(true);
      expect(row.year).toBeGreaterThanOrEqual(2000);
      expect(row.year).toBeLessThanOrEqual(2100);
    }
  });

  it("carries no ISO date, no maps/?cid= URL and no dated filename anywhere in the output", () => {
    const dump = JSON.stringify({ mapsPlaces, mapsPhotos, mapsReviews, mapsByYear, mapsTotals });
    expect(dump).not.toMatch(/\d{4}-\d{2}-\d{2}/); // ISO timestamp
    expect(dump).not.toMatch(/cid=/);
    expect(dump).not.toMatch(/\/\d{4}-\d{2}-\d{2}\//); // dated filename path
  });

  it("every photo's src matches the naming rule and the file exists under public/", () => {
    for (const photo of mapsPhotos.filter((photo) => !photo.unavailable)) {
      expect(photo.src).toMatch(/^\/globe\/maps\/[a-z-]+-\d+\.webp$/);
      expect(existsSync(resolve("public", photo.src.slice(1))), photo.src).toBe(true);
    }
  });

  it("every thumbnail has no EXIF and no XMP", async () => {
    for (const photo of mapsPhotos.filter((photo) => !photo.unavailable)) {
      const meta = await sharp(resolve("public", photo.src.slice(1))).metadata();
      expect(meta.exif, photo.src).toBeUndefined();
      expect(meta.xmp, photo.src).toBeUndefined();
      expect(meta.iptc, photo.src).toBeUndefined();
      expect(meta.width).toBe(photo.w); expect(meta.height).toBe(photo.h);
      expect(photo.w).toBeLessThanOrEqual(480); expect(photo.h).toBeLessThanOrEqual(480);
    }
  });

  it("mapsTotals.photoViews matches the expected sanity total", () => {
    expect(mapsTotals.photoViews).toBe(740119);
  });

  it("the sum of mapsPlaces photos equals mapsTotals.photosPlaced", () => {
    expect(mapsPlaces.reduce((n, p) => n + p.photos, 0)).toBe(mapsTotals.photosPlaced);
  });

  it("the sum of mapsPlaces reviews equals mapsTotals.reviewsPlaced", () => {
    expect(mapsPlaces.reduce((n, p) => n + p.reviews, 0)).toBe(mapsTotals.reviewsPlaced);
  });
});
