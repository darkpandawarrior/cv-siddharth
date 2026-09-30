/** Public reviews/months and metadata-free still thumbnails only. Inputs are
 * allowlisted below: never open labeled places, commute or geocode contributions.
 * Photo coordinates are exact only within 300m of a reviewed public place;
 * otherwise city centres or 0.1° cells protect home without reading its location.
 * All outputs are validated before replacing committed generated assets. */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { mapsGazetteer, nearestGazetteerCity, haversineKm } from "../src/data/mapsGazetteer.ts";

// A review whose place name reads as a home (co-op/cooperative anywhere,
// housing, society, CHS, residency, residences, residential, apartment(s),
// flat(s)) publishes nothing identifying: no name, text, rating or exact
// pin, only its count toward the city total. It also never anchors a
// photo's pin, because it is never added to mapsReviews at all. Deliberately
// broad: "co-op" alone (not just "co-op housing") must catch a name like
// "Sunset Co-op" that never says the word "housing".
// The Takeout record can also mark a place residential directly (no name
// match needed) -- checked wherever that marker could plausibly land.
export const RESIDENTIAL = /co-?op(?:erative)?|\bhousing\b|\bsociety\b|\bchs\b|\bresidenc(?:y|es)\b|\bresidential\b|\bapartments?\b|\bflats?\b/i;
export function isResidentialReview(props) {
  return RESIDENTIAL.test(props?.location?.name ?? "") || props?.residential === true || props?.location?.residential === true;
}
// The owner can confirm that a review matching RESIDENTIAL is not a home
// (curation.json `notHomes`: exact place names, private input only; the
// owner confirmed two on 2026-09-30). That review then publishes like any
// public place, but its location still counts as residential for photos
// below: a photo within 300m of it never gets an exact pin.
export function publishesReview(props, notHomes) {
  return !isResidentialReview(props) || notHomes.has(props?.location?.name ?? "");
}
// A photo within 300m of ANY residential place -- even one that also sits
// near a public review -- never gets an exact pin: the exclusion is on
// distance to the home, not on which review (if any) it ends up anchored to.
export function nearResidential(lat, lon, residentialLocations) {
  return residentialLocations.some((loc) => haversineKm(lat, lon, loc.lat, loc.lon) <= 0.3);
}
// Guarded so gen-maps-places.test.ts can import the pure functions above
// without a private Takeout export on disk; `node scripts/gen-maps-places.mjs`
// (the only real caller) always hits the throw exactly as before.
const isMain = import.meta.url === `file://${process.argv[1]}`;
const root = process.env.MAPS_TAKEOUT_DIR, images = process.env.MAPS_PHOTOS_DIR;
if (isMain && (!root || !images)) throw new Error("[maps-places] both private input directories are required");
if (isMain) {
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const files = (path) => readdirSync(path).filter((file) => file.endsWith(".json")).map((file) => join(path, file));
const reviews = read(join(root, "Maps (your places)", "Reviews.json")).features;
const curation = read(join(root, "curation.json"));
const mapsExport = curation.exported;
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mapsExport)) throw new Error("Invalid export month");
const notHomes = new Set(curation.notHomes ?? []);
const captions = new Map(curation.photos.map((photo) => [photo.title, photo.caption]));
const yearRows = new Map(), cityRows = new Map();
const validPoint = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
const rounded = (value, decimals) => Number(value.toFixed(decimals));
const monthOf = (value) => {
  const month = value.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid contribution month");
  return month;
};
function bump(month, key) {
  const year = Number(month.slice(0, 4));
  const row = yearRows.get(year) ?? { year, reviews: 0, photos: 0, answers: 0, edits: 0 };
  row[key]++; yearRows.set(year, row);
}
const closest = (lat, lon) => mapsGazetteer.reduce((a, b) => haversineKm(lat, lon, a.lat, a.lon) < haversineKm(lat, lon, b.lat, b.lon) ? a : b);
function aggregate(city, month, kind, views = 0) {
  const row = cityRows.get(city.slug) ?? { ...city, reviews: 0, photos: 0, photoViews: 0, years: new Set() };
  row[kind]++; row.photoViews += views; row.years.add(Number(month.slice(0, 4))); cityRows.set(city.slug, row);
}
const mapsReviews = [];
// Never exported: only used to keep a photo pin at least 300m from a home.
const residentialLocations = [];
let reviewsPlaced = 0;
for (const feature of reviews) {
  const props = feature.properties, month = monthOf(props.date), [lon, lat] = feature.geometry?.coordinates ?? [];
  bump(month, "reviews");
  if (!validPoint(lat, lon)) continue;
  reviewsPlaced++;
  const city = nearestGazetteerCity(lat, lon);
  // The address contributes only its locality, never a street or house number.
  const addressParts = props.location?.address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  const locality = addressParts.length >= 4 && !/\d|street|road|lane|plot|house/i.test(addressParts.at(-3)) ? addressParts.at(-3) : undefined;
  const cityLabel = city?.city ?? locality ?? `near ${closest(lat, lon).city}`;
  const slug = city?.slug ?? `near-${closest(lat, lon).slug}`;
  const rating = Number(props.five_star_rating_published);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Invalid review rating");
  if (publishesReview(props, notHomes)) {
    mapsReviews.push({ id: `review-${mapsReviews.length + 1}`, slug, city: cityLabel, country: props.location?.country_code ?? city?.country ?? "", lat: rounded(lat, 5), lon: rounded(lon, 5), name: props.location?.name ?? "Reviewed public place", rating, text: props.review_text_published ?? "", month, ...(isResidentialReview(props) ? { confirmedNotHome: true } : {}) });
  }
  if (isResidentialReview(props)) residentialLocations.push({ lat, lon });
  const coarse = city ?? { slug, city: cityLabel, country: props.location?.country_code ?? "", lat: rounded(lat, 1), lon: rounded(lon, 1) };
  aggregate(coarse, month, "reviews");
}
const sidecars = files(join(root, "Maps", "Photos and videos"));
const thumbnailPlans = [], mapsPhotos = [];
let photoViews = 0, photosPlaced = 0, videosExcluded = 0, photosUnavailable = 0;
for (const path of sidecars) {
  const photo = read(path), views = Number(photo.imageViews ?? 0);
  photoViews += views;
  const month = monthOf(new Date(Number(photo.photoTakenTime?.timestamp ?? photo.creationTime?.timestamp) * 1000).toISOString());
  bump(month, "photos");
  const geo = photo.geoDataExif?.latitude || photo.geoDataExif?.longitude ? photo.geoDataExif : photo.geoData;
  const lat = geo?.latitude, lon = geo?.longitude;
  if (!validPoint(lat, lon)) continue;
  if (basename(photo.title) !== photo.title) throw new Error("Unsafe photo source name");
  const input = join(images, photo.title);
  if (!existsSync(input)) throw new Error("Geotagged source image is missing");
  // Inspect real media rather than trusting a .data extension (one is HEIF).
  const header = readFileSync(input).subarray(0, 32).toString("ascii");
  if (/ftyp(?:isom|mp4|qt  |3gp)/.test(header)) { videosExcluded++; continue; }
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Still image has no dimensions");
  const city = nearestGazetteerCity(lat, lon), nearest = closest(lat, lon);
  const coarse = city ?? { slug: `near-${nearest.slug}`, city: `near ${nearest.city}`, country: nearest.country, lat: rounded(lat, 1), lon: rounded(lon, 1) };
  const review = mapsReviews.filter((review) => haversineKm(lat, lon, review.lat, review.lon) <= 0.3).sort((a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon))[0];
  // Within 300m of a home, no exact pin -- even if a public review is also
  // in range: the exclusion is about the home, not about who else is nearby.
  const pin = review && !nearResidential(lat, lon, residentialLocations) ? { lat: rounded(lat, 5), lon: rounded(lon, 5), precision: "review-nearby", reviewId: review.id } : { lat: coarse.lat, lon: coarse.lon, precision: city ? "city" : "grid" };
  aggregate(coarse, month, "photos", views); photosPlaced++;
  thumbnailPlans.push({ input, title: photo.title, slug: coarse.slug, city: coarse.city, month, year: Number(month.slice(0, 4)), views, ...pin, ...(captions.get(photo.title) ? { caption: captions.get(photo.title) } : {}) });
}
thumbnailPlans.sort((a, b) => a.slug.localeCompare(b.slug) || b.views - a.views || a.title.localeCompare(b.title));
const counters = new Map(), encoded = [];
for (const photo of thumbnailPlans) {
  const n = (counters.get(photo.slug) ?? 0) + 1; counters.set(photo.slug, n);
  const file = `${photo.slug}-${n}.avif`;
  const { input: _input, title: _title, ...record } = photo;
  let buffer;
  // AVIF quality 50 is visually indistinguishable from the WebP q70 it
  // replaces (checked by eye against crops of the previously-shipped set)
  // while running smaller: single delivered format, no duplicate derivative.
  try { buffer = await sharp(photo.input).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).avif({ quality: 50, effort: 6 }).toBuffer(); }
  catch {
    photosUnavailable++;
    const metadata = await sharp(photo.input).metadata();
    mapsPhotos.push({ src: "", ...record, w: metadata.width, h: metadata.height, unavailable: "Source still image could not be decoded" });
    continue;
  }
  const metadata = await sharp(buffer).metadata();
  if (metadata.exif || metadata.xmp || metadata.iptc || metadata.icc || metadata.width > 480 || metadata.height > 480) throw new Error("Thumbnail privacy/size check failed");
  mapsPhotos.push({ src: `/globe/maps/${file}`, ...record, w: metadata.width, h: metadata.height });
  encoded.push({ file, buffer });
}
const answers = files(join(root, "Maps", "Answers to automated questions"));
const edits = files(join(root, "Maps", "Suggested edits to business establishments"));
for (const path of answers) bump(new Date(parseInt(basename(path), 10)).toISOString().slice(0, 7), "answers");
for (const path of edits) bump(new Date(parseInt(basename(path), 10)).toISOString().slice(0, 7), "edits");
const mapsTotals = { reviews: reviews.length, reviewsPlaced, photos: sidecars.length, photosPlaced, photosUnavailable, photoViews, answers: answers.length, edits: edits.length, qaAnswers: read(join(root, "Maps", "Questions and Answers", "Questions and Answers.json")).answers.length, dishes: files(join(root, "Maps", "Added dishes, products, activities")).reduce((n, path) => n + read(path).contributions.length, 0) };
const mapsPlaces = [...cityRows.values()].map((row) => ({ ...row, years: [...row.years].sort((a, b) => a - b) })).sort((a, b) => b.reviews + b.photos - a.reviews - a.photos || a.slug.localeCompare(b.slug));
const mapsByYear = [...yearRows.values()].sort((a, b) => a.year - b.year);
const records = JSON.stringify({ mapsTotals, mapsPlaces, mapsPhotos, mapsReviews, mapsByYear });
if (/\d{4}-\d{2}-\d{2}|google\.com\/maps|cid=/.test(records) || thumbnailPlans.some((photo) => records.includes(photo.title))) throw new Error("Generated record privacy check failed");
const banner = "// AUTO-GENERATED by scripts/gen-maps-places.mjs. Public reviews and months only.\n// Photo pins are within 300m of a reviewed public place, else city centres/0.1 degree cells.\n// No private labels, commute, street address, original filenames or image metadata.\n// A review whose place name reads as a home publishes no name/text/rating/pin,\n// only its count toward the city total, unless the owner confirmed it is not a\n// home (confirmedNotHome). Either way no photo within 300m of it gets an exact pin.\n";
const interfaces = `export interface MapsPlace { slug: string; city: string; country: string; lat: number; lon: number; reviews: number; photos: number; photoViews: number; years: number[] }\nexport interface MapsReview { id: string; slug: string; city: string; country: string; lat: number; lon: number; name: string; rating: number; text: string; month: string; confirmedNotHome?: true }\nexport interface MapsPhoto { src: string; slug: string; city: string; year: number; month: string; lat: number; lon: number; precision: "city" | "grid" | "review-nearby"; reviewId?: string; views: number; w: number; h: number; caption?: string; unavailable?: string }\n`;
const declarations = [["mapsExport", mapsExport, ""], ["mapsTotals", mapsTotals, ""], ["mapsByYear", mapsByYear, ": { year: number; reviews: number; photos: number; answers: number; edits: number }[]"], ["mapsPlaces", mapsPlaces, ": MapsPlace[]"], ["mapsReviews", mapsReviews, ": MapsReview[]"], ["mapsPhotos", mapsPhotos, ": MapsPhoto[]"]].map(([name, value, type]) => `export const ${name}${type} = ${JSON.stringify(value, null, 2)};`).join("\n\n");
const out = resolve("public/globe/maps"); mkdirSync(out, { recursive: true });
for (const { file, buffer } of encoded) writeFileSync(join(out, file), buffer);
const produced = new Set(encoded.map((photo) => photo.file));
for (const file of readdirSync(out)) if ((file.endsWith(".avif") || file.endsWith(".webp")) && !produced.has(file)) unlinkSync(join(out, file));
writeFileSync(resolve("src/data/generated/mapsPlaces.ts"), `${banner}${interfaces}\n${declarations}\n`);
console.log(`[maps-places] ${mapsTotals.reviews} reviews (${reviewsPlaced} placed, ${mapsReviews.length} published, ${reviewsPlaced - mapsReviews.length} withheld as homes), ${mapsTotals.photos} photo sidecars, ${mapsTotals.photoViews} views, ${mapsTotals.answers} automated answers, ${mapsTotals.qaAnswers} Q&A answers, ${mapsTotals.edits} edits, ${mapsTotals.dishes} dishes`);
console.log(`[maps-places] ${mapsPlaces.length} cities, ${encoded.length} sanitized still thumbnails, ${photosUnavailable} unavailable still records, ${videosExcluded} geotagged videos excluded; metadata stripped on every thumbnail`);
}
