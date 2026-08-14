/**
 * The AVIF/WebP siblings `scripts/gen-images.mjs` produces beside a raster
 * image, or null when there are none — an animated gif (the generator skips
 * them) or a path with no extension.
 *
 * In lib/ rather than beside Picture.tsx because two components need it and
 * only one of them can use the other: DeviceWall's FitImage measures the
 * decoded <img> to decide whether to crop or letterbox it, so it needs the ref
 * and the onLoad handler that Picture does not expose. Without this shared
 * helper FitImage had quietly been serving raw PNGs while the rest of the site
 * negotiated — DeviceMorph's homepage poster alone was 104 kB against a 13 kB
 * AVIF sibling.
 */
export function rasterSources(src: string): { avif: string; webp: string | null } | null {
  const dot = src.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = src.slice(dot + 1).toLowerCase();
  if (ext === "gif") return null;
  const base = src.slice(0, dot);
  return { avif: `${base}.avif`, webp: ext === "webp" ? null : `${base}.webp` };
}
