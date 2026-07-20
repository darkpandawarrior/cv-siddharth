import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";

/**
 * Narrated showcase film: autoplays muted when scrolled into view, pauses
 * when scrolled away, one tap to hear the voiceover. Captions ship as a WebVTT
 * track so the narration is readable with sound off (and by screen readers
 * that surface tracks). Files are produced by the showcase workflow under
 * public/projects/<slug>/showcase/.
 */
export function ShowcaseFilm({ slug, title }: { slug: string; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const base = `/projects/${slug}/showcase`;

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Autoplay is a courtesy, not a jump-scare: muted in, paused out.
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="group relative overflow-hidden rounded-2xl border border-line bg-void">
      <video
        ref={video}
        muted={muted}
        playsInline
        preload="metadata"
        poster={`${base}/poster.jpg`}
        onEnded={() => setEnded(true)}
        onPlay={() => setEnded(false)}
        className="block w-full"
        aria-label={`${title} product tour`}
        crossOrigin="anonymous"
      >
        <source src={`${base}/showcase.mp4`} type="video/mp4" />
        <track kind="captions" src={`${base}/captions.vtt`} srcLang="en" label="English" default={muted} />
      </video>
      <div className="absolute bottom-3 right-3 flex gap-2">
        {ended && (
          <button
            type="button"
            onClick={() => { const el = video.current; if (el) { el.currentTime = 0; el.play().catch(() => {}); } }}
            aria-label="Replay tour"
            className="rounded-full border border-line bg-ink/80 p-2.5 text-zinc-200 backdrop-blur transition hover:border-accent hover:text-accent"
          >
            <RotateCcw size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute voiceover" : "Mute voiceover"}
          aria-pressed={!muted}
          className="rounded-full border border-line bg-ink/80 p-2.5 text-zinc-200 backdrop-blur transition hover:border-accent hover:text-accent"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
      <figcaption className="sr-only">{title} — narrated product tour</figcaption>
    </figure>
  );
}
