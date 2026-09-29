import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mapsGazetteer } from "../mapsGazetteer.ts";
import { mapsByYear, mapsPhotos, mapsPlaces, mapsTotals } from "./mapsPlaces.ts";

const gazetteerBySlug = new Map(mapsGazetteer.map((c) => [c.slug, c]));

describe("mapsPlaces", () => {
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
    const dump = JSON.stringify({ mapsPlaces, mapsPhotos, mapsByYear, mapsTotals });
    expect(dump).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(dump).not.toMatch(/cid=/);
    expect(dump).not.toMatch(/\/\d{4}-\d{2}-\d{2}\//); // dated filename path
  });

  it("every photo's src matches the naming rule and the file exists under public/", () => {
    for (const photo of mapsPhotos) {
      expect(photo.src).toMatch(/^\/globe\/maps\/[a-z-]+-\d+\.webp$/);
      expect(existsSync(resolve("public", photo.src.slice(1))), photo.src).toBe(true);
    }
  });

  it("every thumbnail has no EXIF and no XMP", async () => {
    for (const photo of mapsPhotos) {
      const meta = await sharp(resolve("public", photo.src.slice(1))).metadata();
      expect(meta.exif, photo.src).toBeUndefined();
      expect(meta.xmp, photo.src).toBeUndefined();
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
