import { describe, expect, it } from "vitest";
import { lifePlaces } from "../../../data/profile/lifePlaces.ts";
import { mapsPlaces, mapsPhotos } from "../../../data/generated/mapsPlaces.ts";
import { buildStoryFilm } from "./storyFilm.ts";

describe("story film (LANE C3, life journey)", () => {
  it("inserts the dated family move between college and the first job", () => {
    const film = buildStoryFilm();
    expect(film.map((c) => c.id)).toEqual(["film:kuwait-city", "film:bhopal", "film:mumbai", "film:chandigarh", "film:pune"]);
    expect(film.find((chapter) => chapter.id === "film:mumbai")!.arcs[0].familyMove).toBe(true);
    expect(lifePlaces.find((p) => p.slug === "mumbai")?.from).toBe("2019-07");
  });

  it("draws exactly one arc per chapter after the first, city to city, and none on Kuwait", () => {
    const film = buildStoryFilm();
    expect(film[0].arcs).toEqual([]);
    expect(film.map((c) => c.arcs[0] && `${c.arcs[0].from.name}->${c.arcs[0].to.name}`)).toEqual([
      undefined,
      "Kuwait City, Kuwait->Bhopal, India",
      "Kuwait City, Kuwait->Mumbai, India",
      "Bhopal, India->Chandigarh, India",
      "Chandigarh, India->Pune, India",
    ]);
  });

  it("matches the Kuwait chapter's Maps line to the raw mapsPlaces totals", () => {
    const film = buildStoryFilm();
    const kuwait = film.find((c) => c.id === "film:kuwait-city")!;
    const place = mapsPlaces.find((p) => p.slug === "kuwait-city")!;
    expect(kuwait.mapsLine).toBe(`${place.reviews} reviews, ${place.photos} photos on Google Maps, 2017 to 2018`);
  });

  it("gives every chapter only its own city's photos, within one year of the lived period", () => {
    const film = buildStoryFilm();
    for (const chapter of film) {
      const slug = chapter.id.replace("film:", "");
      const lp = lifePlaces.find((p) => p.slug === slug)!;
      const from = lp.from === undefined ? undefined : Number(String(lp.from).slice(0, 4));
      const to = lp.to === undefined ? undefined : Number(String(lp.to).slice(0, 4));
      const lo = Math.min(from ?? Infinity, to ?? Infinity) - 1;
      const hi = Math.max(from ?? -Infinity, to ?? -Infinity) + 1;
      for (const photo of chapter.photos) {
        expect(photo.slug).toBe(slug); // never a photo from another city
        expect(photo.year).toBeGreaterThanOrEqual(lo);
        expect(photo.year).toBeLessThanOrEqual(hi);
      }
    }
    // Chandigarh has no photos in mapsPhotos.ts at all -- an honestly empty
    // filmstrip, not a fabricated one.
    expect(mapsPhotos.some((p) => p.slug === "chandigarh")).toBe(false);
    expect(film.find((c) => c.id === "film:chandigarh")!.photos).toEqual([]);
    // Kuwait has photos; every one is verifiably in mapsPhotos.ts under that slug.
    const kuwaitPhotos = film.find((c) => c.id === "film:kuwait-city")!.photos;
    expect(kuwaitPhotos.length).toBeGreaterThan(0);
    for (const p of kuwaitPhotos) expect(mapsPhotos).toContainEqual(p);
  });

  it("cites only lifePlaces.ts as the chapter source, year precision, no invented geography", () => {
    for (const chapter of buildStoryFilm()) {
      expect(chapter.events).toHaveLength(1);
      expect(chapter.events[0].source).toBe("src/data/profile/lifePlaces.ts");
      expect(chapter.events[0].precision).toBe(chapter.events[0].date.length === 7 ? "month" : "year");
      expect(chapter.events[0].date).toMatch(/^\d{4}(-\d{2})?$/);
    }
  });

  it("is deterministic", () => {
    expect(buildStoryFilm()).toEqual(buildStoryFilm());
  });
});
