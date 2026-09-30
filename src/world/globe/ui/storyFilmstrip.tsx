import type { MapsPhoto } from "../../../data/generated/mapsPlaces.ts";

/** LANE C3: a small strip of the owner's own Google Maps photos for one
 *  city, beside that chapter's card in the life-journey film. City, year and
 *  view count only -- exactly the precision mapsPlaces.ts already carries
 *  (no address, no place name, no review text ever reaches this component).
 *  `key={chapter id}` at the call site remounts this on every chapter change
 *  so `.fade-in` (src/index.css) replays per city instead of firing once. */
export default function StoryFilmstrip({ photos, reducedMotion }: { photos: readonly MapsPhoto[]; reducedMotion: boolean }) {
  if (!photos.length) return null;
  return (
    <div data-story-filmstrip className="mt-2 flex gap-1.5 overflow-x-auto hide-scrollbar" aria-label="Google Maps photos from this city">
      {photos.slice(0, 6).map((photo) => (
        <figure
          key={photo.src}
          data-story-filmstrip-photo
          data-story-filmstrip-slug={photo.slug}
          className={`w-16 shrink-0 overflow-hidden rounded border border-line bg-ink/60 ${reducedMotion ? "" : "fade-in"}`}
        >
          {photo.unavailable ? <span className="flex h-16 w-16 items-center justify-center text-xs">Photo unavailable</span> : <img src={photo.src} alt={photo.caption ?? `${photo.city}, ${photo.year}`} loading="lazy" width={photo.w} height={photo.h} className="h-16 w-16 object-cover" />}
          <figcaption className="truncate px-1 py-0.5 text-xs leading-tight text-muted">
            {photo.year} · {photo.views.toLocaleString()} views
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
