import { mapsPhotos, type MapsReview, type MapsPhoto } from "../../../data/generated/mapsPlaces.ts";
import type { Selection } from "../globeStore.ts";

export function guideMedia(photos: readonly MapsPhoto[]): NonNullable<Selection["media"]> {
  return photos.map((photo) => ({ src: photo.src, alt: photo.unavailable ?? photo.caption ?? `Photo in ${photo.city}, ${photo.month}`, caption: `${photo.month} · ${photo.views.toLocaleString("en-IN")} views${photo.unavailable ? " · image unavailable" : ""}` }));
}
export function guideReviewSelection(review: MapsReview): Selection {
  return {
    id: `guide-review:${review.id}`, kind: "guide-review", title: review.name,
    rows: [{ label: "Stars", value: `${review.rating} / 5` }, { label: "Month", value: review.month }, { label: "City", value: review.city }],
    source: `Google Maps review by Siddharth, ${review.month}`,
    live: false, focus: { kind: "latlon", lat: review.lat, lon: review.lon, distance: 9.5 },
    guide: { review }, media: guideMedia(mapsPhotos.filter((photo) => photo.reviewId === review.id)),
  };
}
