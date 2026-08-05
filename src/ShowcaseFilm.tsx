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
  const [line, setLine] = useState("");
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

  // The film already burns its own short caption ("Sign in, or skip it
  // entirely") into every frame. The WebVTT track carries something different
  // — the full spoken narration — so letting the UA render it `default` put
  // two unrelated caption layers in the same place, straight across the phone.
  // Instead: keep the track (it is the accessible transcript, and the <track>
  // element still exposes it) but set it to `hidden`, which fires cuechange
  // without painting, and render the narration ourselves in a strip BELOW the
  // frame where it has room to be read.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const track = el.textTracks[0];
    if (!track) return;
    track.mode = "hidden";
    const onCue = () => {
      const cue = track.activeCues?.[0] as VTTCue | undefined;
      setLine(cue?.text ?? "");
    };
    track.addEventListener("cuechange", onCue);
    onCue();
    return () => track.removeEventListener("cuechange", onCue);
  }, []);

  return (
    <figure className="group overflow-hidden rounded-2xl border border-line bg-void">
      <div className="relative">
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
        <track kind="captions" src={`${base}/captions.vtt`} srcLang="en" label="English" />
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
      </div>
      {/* The narration strip. Min-height is reserved so the card does not jump
          a line taller every time a cue with a longer sentence comes in. */}
      <p
        aria-live="off"
        className="flex min-h-[4.25rem] items-center justify-center border-t border-line bg-surface px-6 py-3 text-center text-sm leading-relaxed text-zinc-300"
      >
        {line}
      </p>
      <figcaption className="sr-only">{title} — narrated product tour</figcaption>
    </figure>
  );
}
