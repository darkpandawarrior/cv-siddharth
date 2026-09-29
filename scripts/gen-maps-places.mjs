/**
 * The owner's Google Maps Local Guide contributions, aggregated to city
 * level for the globe's "My Maps places" layer.
 *
 * WHY IT IS NEEDED. The real Takeout export names businesses, streets and
 * exact GPS points — none of which belongs in a public repo. This script is
 * the one place that ever opens the raw export; everything it writes is a
 * city-level count plus a hand-picked, EXIF-stripped thumbnail. Reviewers of
 * this repo see the committed output only, never the export.
 *
 * Reads MAPS_TAKEOUT_DIR (required, private, gitignored wherever it lives)
 * and writes src/data/generated/mapsPlaces.ts plus public/globe/maps/*.webp.
 * Both outputs are committed, so nothing about a build depends on having the
 * export around. MAPS_PHOTOS_DIR (optional) points at the original image
 * files named by each sidecar's `title`; without it, the script keeps the
 * committed thumbnails and fails if a curated one is missing.
 *
 * Usage: MAPS_TAKEOUT_DIR=/path/to/export node scripts/gen-maps-places.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { mapsGazetteer, nearestGazetteerCity } from "../src/data/mapsGazetteer.ts";

const TAKEOUT_DIR = process.env.MAPS_TAKEOUT_DIR;
if (!TAKEOUT_DIR) throw new Error("[maps-places] set MAPS_TAKEOUT_DIR — refusing to guess");
if (!existsSync(TAKEOUT_DIR)) throw new Error(`[maps-places] no export at ${TAKEOUT_DIR}`);
const PHOTOS_DIR = process.env.MAPS_PHOTOS_DIR;

const OUT_TS = resolve(process.cwd(), "src/data/generated/mapsPlaces.ts");
const THUMB_DIR = resolve(process.cwd(), "public/globe/maps");
const THUMB_SIZE = 480;

// Only these paths are ever opened — never Timeline, My labeled places,
// Commute routes, Geocode contributions, vehicle/EV settings, requests for
// services or followed places (living-earth's privacy rule for this lane).
const REVIEWS_JSON = join(TAKEOUT_DIR, "Maps (your places)", "Reviews.json");
const PHOTOS_JSON_DIR = join(TAKEOUT_DIR, "Maps", "Photos and videos");
const ANSWERS_DIR = join(TAKEOUT_DIR, "Maps", "Answers to automated questions");
const EDITS_DIR = join(TAKEOUT_DIR, "Maps", "Suggested edits to business establishments");
const QA_JSON = join(TAKEOUT_DIR, "Maps", "Questions and Answers", "Questions and Answers.json");
const DISHES_DIR = join(TAKEOUT_DIR, "Maps", "Added dishes, products, activities");
const CURATION_JSON = join(TAKEOUT_DIR, "curation.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const jsonFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
/** File names in these two folders are epoch milliseconds, sometimes with a
 *  macOS duplicate suffix like "(1)" — parseInt stops at the first
 *  non-digit, so the suffix is silently ignored rather than breaking the
 *  parse. */
const yearFromEpochFilename = (path) => new Date(parseInt(path.split("/").pop(), 10)).getUTCFullYear();

const curation = readJson(CURATION_JSON);
const mapsExport = curation.exported;
if (!/^\d{4}-\d{2}$/.test(mapsExport)) throw new Error(`[maps-places] curation.json "exported" is not YYYY-MM: ${mapsExport}`);

/* ── City aggregates ────────────────────────────────────────────────────── */

const bySlug = new Map(mapsGazetteer.map((c) => [c.slug, { ...c, reviews: 0, photos: 0, photoViews: 0, years: new Set() }]));
let reviewsPlaced = 0;
let photosPlaced = 0;
let totalPhotoViews = 0;
const yearCounts = new Map(); // year -> { reviews, photos, answers, edits }
function bump(year, key) {
  const row = yearCounts.get(year) ?? { year, reviews: 0, photos: 0, answers: 0, edits: 0 };
  row[key]++;
  yearCounts.set(year, row);
}

/** A point at (0, 0) or with no geometry counts in the totals and is placed
 *  nowhere; a point farther than 45 km from every gazetteer city is a hard
 *  failure (this run's own bug, never silently dropped). */
function snap(lat, lon, pointLabel) {
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return undefined;
  const city = nearestGazetteerCity(lat, lon);
  if (!city) throw new Error(`[maps-places] ${pointLabel} at (${lat.toFixed(1)}, ${lon.toFixed(1)}) is farther than 45 km from every gazetteer city`);
  return city;
}

const reviews = readJson(REVIEWS_JSON).features;
for (const f of reviews) {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  const year = Number(f.properties.date.slice(0, 4));
  bump(year, "reviews");
  const city = snap(lat, lon, "a review");
  if (!city) continue;
  reviewsPlaced++;
  const row = bySlug.get(city.slug);
  row.reviews++;
  row.years.add(year);
}

const photoSidecars = jsonFiles(PHOTOS_JSON_DIR);
const photoRows = []; // { title, lat, lon, year, views, city }
for (const path of photoSidecars) {
  const d = readJson(path);
  const views = Number(d.imageViews ?? "0");
  totalPhotoViews += views;
  const ts = d.photoTakenTime?.timestamp ?? d.creationTime?.timestamp;
  const year = new Date(Number(ts) * 1000).getUTCFullYear();
  bump(year, "photos");
  const exif = d.geoDataExif ?? {};
  const plain = d.geoData ?? {};
  const lat = exif.latitude || plain.latitude || null;
  const lon = exif.longitude || plain.longitude || null;
  const city = snap(lat, lon, `a photo (${path.split("/").pop()})`);
  if (city) {
    photosPlaced++;
    const row = bySlug.get(city.slug);
    row.photos++;
    row.photoViews += views;
    row.years.add(year);
  }
  photoRows.push({ title: d.title, year, views, city });
}

for (const path of jsonFiles(ANSWERS_DIR)) bump(yearFromEpochFilename(path), "answers");
for (const path of jsonFiles(EDITS_DIR)) bump(yearFromEpochFilename(path), "edits");
const qaAnswers = readJson(QA_JSON).answers.length;
const dishes = jsonFiles(DISHES_DIR).reduce((n, p) => n + readJson(p).contributions.length, 0);

const mapsTotals = {
  reviews: reviews.length,
  reviewsPlaced,
  photos: photoSidecars.length,
  photosPlaced,
  photoViews: totalPhotoViews,
  answers: jsonFiles(ANSWERS_DIR).length,
  edits: jsonFiles(EDITS_DIR).length,
  qaAnswers,
  dishes,
};

const mapsPlaces = [...bySlug.values()]
  .filter((r) => r.reviews > 0 || r.photos > 0)
  .map((r) => ({ slug: r.slug, city: r.city, country: r.country, lat: r.lat, lon: r.lon, reviews: r.reviews, photos: r.photos, photoViews: r.photoViews, years: [...r.years].sort((a, b) => a - b) }))
  .sort((a, b) => b.reviews + b.photos - (a.reviews + a.photos) || a.slug.localeCompare(b.slug));

const mapsByYear = [...yearCounts.values()].sort((a, b) => a.year - b.year);

/* ── Thumbnails ─────────────────────────────────────────────────────────── */

mkdirSync(THUMB_DIR, { recursive: true });
const producedFiles = new Set();
const mapsPhotos = [];

// Resolve each curated entry's row first, so `n` can count from 1 per city
// in DESCENDING VIEW ORDER (the brief's own naming rule) rather than
// curation.json's own listing order.
const curatedRows = curation.photos.map((curated) => {
  const row = photoRows.find((p) => p.title === curated.title);
  if (!row) throw new Error(`[maps-places] curated photo "${curated.title}" has no sidecar in the export`);
  if (!row.city) throw new Error(`[maps-places] curated photo "${curated.title}" is not geotagged (or snaps nowhere) — pick another`);
  return { curated, row };
});
const fileNameByTitle = new Map();
for (const slug of new Set(curatedRows.map((c) => c.row.city.slug))) {
  const ordered = curatedRows.filter((c) => c.row.city.slug === slug).sort((a, b) => b.row.views - a.row.views);
  ordered.forEach(({ curated }, i) => fileNameByTitle.set(curated.title, `${slug}-${i + 1}.webp`));
}

for (const { curated, row } of curatedRows) {
  const fileName = fileNameByTitle.get(curated.title);
  producedFiles.add(fileName);
  const outPath = join(THUMB_DIR, fileName);

  if (PHOTOS_DIR) {
    const srcPath = join(PHOTOS_DIR, curated.title);
    if (!existsSync(srcPath)) throw new Error(`[maps-places] MAPS_PHOTOS_DIR is set but "${curated.title}" is missing there`);
    const buf = readFileSync(srcPath);
    // .rotate() first so EXIF orientation survives; sharp's own .webp()
    // strips metadata by default, which is exactly what this lane wants
    // (no EXIF, no XMP in the committed output) — asserted just below.
    await sharp(buf).rotate().resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 70, effort: 6 }).toFile(outPath);
  } else if (!existsSync(outPath)) {
    throw new Error(`[maps-places] no MAPS_PHOTOS_DIR and no committed thumbnail at public/globe/maps/${fileName}`);
  }
  // Read back what is actually on disk, fresh or committed: the real
  // dimensions (fit "inside" keeps each photo's own aspect) and the proof
  // that no EXIF/XMP survived.
  const meta = await sharp(outPath).metadata();
  if (meta.exif || meta.xmp) throw new Error(`[maps-places] ${fileName} still carries EXIF/XMP after encoding`);

  mapsPhotos.push({ src: `/globe/maps/${fileName}`, slug: row.city.slug, city: row.city.city, year: row.year, views: row.views, w: meta.width, h: meta.height, ...(curated.caption ? { caption: curated.caption } : {}) });
}

// Delete stale thumbnails this run did not produce.
for (const existing of readdirSync(THUMB_DIR)) {
  if (existing.endsWith(".webp") && !producedFiles.has(existing)) unlinkSync(join(THUMB_DIR, existing));
}

/* ── Write the committed data file ─────────────────────────────────────── */

const banner = `// AUTO-GENERATED by scripts/gen-maps-places.mjs, do not edit by hand.\n// Google Maps Takeout, city level only, years only: no business name,\n// address, review text, place URL or original photo filename ever reaches\n// this file (see the script's own header and privacy rule).\n`;
const iface = `export interface MapsPlace { slug: string; city: string; country: "IN" | "KW"; lat: number; lon: number; reviews: number; photos: number; photoViews: number; years: number[] }\nexport interface MapsPhoto { src: string; slug: string; city: string; year: number; views: number; w: number; h: number; caption?: string }\n`;

const ts = `${banner}${iface}
export const mapsExport = ${JSON.stringify(mapsExport)};

export const mapsTotals = ${JSON.stringify(mapsTotals, null, 2)};

export const mapsByYear: { year: number; reviews: number; photos: number; answers: number; edits: number }[] = ${JSON.stringify(mapsByYear, null, 2)};

export const mapsPlaces: MapsPlace[] = ${JSON.stringify(mapsPlaces, null, 2)};

export const mapsPhotos: MapsPhoto[] = ${JSON.stringify(mapsPhotos, null, 2)};
`;
writeFileSync(OUT_TS, ts);

console.log(
  `[maps-places] ${mapsTotals.reviews} reviews, ${mapsTotals.photos} photos and videos, ${mapsTotals.photoViews} photo views, ${mapsTotals.answers} answers, ${mapsTotals.edits} edits, ${mapsTotals.qaAnswers} Q&A answers, ${mapsTotals.dishes} dishes`,
);
console.log(`[maps-places] ${mapsPlaces.length} cities, ${mapsPhotos.length} thumbnails written to public/globe/maps/`);
