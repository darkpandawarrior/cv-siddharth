/**
 * The raster extensions gen-images.mjs derives AVIF/WebP siblings for.
 *
 * ONE list, dot-prefixed to match gen-images.mjs's own `extname()` output
 * directly. rasterSources.ts strips the dot itself — it already lowercases
 * and slices before comparing, so it derives its own no-dot form rather than
 * this file carrying two shapes of the same four strings.
 *
 * This used to be two hand-typed arrays that a comment in each promised
 * would never drift. They drifted once already (rasterSources.test.ts) and
 * broke a case study in production, which is why this file exists.
 */
export const DERIVABLE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
