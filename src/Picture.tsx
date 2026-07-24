import type { CSSProperties, MouseEventHandler } from "react";

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
};

export function Picture({ src, alt, className, loading = "lazy", onClick, style }: Props) {
  const dot = src.lastIndexOf(".");
  const ext = dot >= 0 ? src.slice(dot + 1).toLowerCase() : "";
  if (ext === "gif" || dot < 0) {
    return <img src={src} alt={alt} loading={loading} className={className} onClick={onClick} style={style} />;
  }
  const base = src.slice(0, dot);
  return (
    <picture onClick={onClick}>
      <source srcSet={`${base}.avif`} type="image/avif" />
      {ext !== "webp" && <source srcSet={`${base}.webp`} type="image/webp" />}
      <img src={src} alt={alt} loading={loading} className={className} style={style} />
    </picture>
  );
}
