import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEventHandler } from "react";
import { rasterSources } from "./lib/rasterSources.ts";

// AVIF → WebP → original fallback. src is the original raster path
// (e.g. "/projects/gaddi/screenshots/home.png"); siblings are produced by
// scripts/gen-images.mjs. An animated gif renders as its transcoded <video>
// sibling instead — see LoopingClip below.
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

/**
 * A gif rendered as the .mp4 + .avif poster gen-images.mjs writes beside it.
 *
 * Two separate bugs die here. The bytes: 31 gifs were 18.4 MB, and ten of them
 * alone were 89% of /project/doori's 9.5 MB page — the same frames as h264
 * are a tenth of that. And the timing: loading="lazy" does NOT defer a gif
 * inside an overflow-x-auto rail, so all ten doori clips were fetched in the
 * first 180 ms of the page, in document order, long before any of them could
 * be on screen. `preload="none"` plus an IntersectionObserver does what lazy
 * only promised — nothing but the ~5 KB poster transfers until you scroll to
 * it. The observer is the idiom ShowcaseFilm.tsx already uses.
 */
function LoopingClip({ base, alt, className, onClick, style, width, height }: Omit<Props, "src" | "loading"> & { base: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const decorative = !alt;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React carries `muted` as a property, not an attribute, and a muted
    // element is the only kind allowed to play without a user gesture.
    el.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={`${base}.mp4`}
      poster={`${base}.avif`}
      loop
      muted
      playsInline
      preload="none"
      // Reduced motion gets the poster frame and a play button rather than
      // motion it did not ask for. Only where the clip is announced at all:
      // in the gallery rail it is decorative (the caption below says the same
      // thing), and controls on an aria-hidden element is an axe violation.
      controls={reduced && !decorative}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : alt}
      className={className}
      style={style}
      width={width}
      height={height}
      onClick={onClick}
    />
  );
}

export function Picture({ src, alt, className, loading = "lazy", onClick, style, width, height }: Props) {
  if (src.toLowerCase().endsWith(".gif")) {
    return (
      <LoopingClip
        base={src.slice(0, -4)}
        alt={alt}
        className={className}
        onClick={onClick}
        style={style}
        width={width}
        height={height}
      />
    );
  }
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
