import type { CSSProperties, MouseEventHandler } from "react";
import { rasterSources } from "./lib/rasterSources.ts";

// AVIF → WebP → original fallback. src is the original raster path
// (e.g. "/projects/kursi/screenshots/home.png"); siblings are produced by
// scripts/gen-images.mjs. Animated gifs render as a plain <img> (no avif/webp
// sibling — gen-images.mjs skips gifs since they're animated).
type Props = {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  onClick?: MouseEventHandler;
  style?: CSSProperties;
  // Optional intrinsic size, passed straight through to the <img>. Existing
  // callers lock the box with an aspect-ratio in `style` instead, so this
  // stays optional rather than forcing every caller to know its raster's
  // pixel dimensions.
  width?: number;
  height?: number;
};

export function Picture({ src, alt, className, loading = "lazy", onClick, style, width, height }: Props) {
  const sources = rasterSources(src);
  if (!sources) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={className}
        onClick={onClick}
        style={style}
        width={width}
        height={height}
      />
    );
  }
  return (
    <picture onClick={onClick}>
      <source srcSet={sources.avif} type="image/avif" />
      {sources.webp && <source srcSet={sources.webp} type="image/webp" />}
      <img src={src} alt={alt} loading={loading} className={className} style={style} width={width} height={height} />
    </picture>
  );
}
