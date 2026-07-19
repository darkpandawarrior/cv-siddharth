import { useEffect, useRef, useState } from "react";
import { Smartphone, Watch, Monitor, Globe, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { ProjectTarget } from "./data/profile.ts";

const PLATFORM_ICON: Record<ProjectTarget["platform"], React.ComponentType<{ size?: number }>> = {
  Android: Smartphone,
  iOS: Smartphone,
  "Wear OS": Watch,
  watchOS: Watch,
  Desktop: Monitor,
  Web: Globe,
};

/** Fires `inView` once, on first intersection — gates lazy iframe mounts. */
function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return [ref, inView] as const;
}

/** The live web build, mounted only once its frame scrolls into view. Falls
 *  back to a screenshot if the iframe hasn't loaded within a few seconds
 *  (e.g. blocked by the host, or offline) — never a dead grey box. */
function LiveEmbed({ url, fallback }: { url: string; fallback?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inView || loaded) return;
    const t = window.setTimeout(() => setFailed((f) => f || !loaded), 8000);
    return () => window.clearTimeout(t);
  }, [inView, loaded]);

  return (
    <div ref={ref} className="relative aspect-video w-full overflow-hidden bg-black">
      {!inView && (
        <div className="font-mono-os flex h-full flex-col items-center justify-center gap-2 text-xs text-accent/70">
          <span className="status-pulse h-2 w-2 rounded-full bg-accent" />
          scroll to boot live build…
        </div>
      )}
      {inView && !failed && (
        <>
          <iframe
            src={url}
            title="Live web build"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            className={`h-full w-full border-0 transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {!loaded && (
            <div className="font-mono-os absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-xs text-accent/70">
              <span className="boot-caret">▍</span> booting live build…
            </div>
          )}
        </>
      )}
      {failed && fallback && (
        <img src={fallback} alt="Live build unavailable — fallback capture" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Renders `src` filling the frame edge-to-edge (`object-cover`) when its
 *  real aspect ratio is close to the frame's `targetAspect`, and falls back
 *  to a letterboxed `object-contain` on a black backdrop when it isn't —
 *  so a wrong-shaped capture (e.g. a landscape desktop grab) is never
 *  silently cropped into a misleading sliver inside a mismatched frame. */
function FitImage({
  src,
  alt,
  targetAspect,
  className = "",
}: {
  src: string;
  alt: string;
  targetAspect: number;
  className?: string;
}) {
  const [contain, setContain] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={(e) => {
        const img = e.currentTarget;
        const aspect = img.naturalWidth / img.naturalHeight;
        // ponytail: >20% aspect delta means this capture doesn't match the
        // frame's shape — letterbox instead of cropping it.
        setContain(Math.abs(aspect - targetAspect) / targetAspect > 0.2);
      }}
      className={`${className} ${contain ? "bg-black object-contain" : "object-cover object-top"}`}
    />
  );
}

/** Device chrome around the active target's screens — phone bezel, round
 *  watch face, desktop title bar, or full browser chrome (with the live
 *  embed inside, for Web targets that have shipped a build). `shot` (the
 *  screen index) is owned by the parent so the shared prev/next arrows and
 *  dot-pagination can drive every frame type identically. */
function DeviceFrame({ target, slug, shot }: { target: ProjectTarget; slug: string; shot: number }) {
  const src = (file: string) => `/projects/${slug}/screenshots/${file}`;
  const shots = target.screens;

  if (target.deviceFrame === "browser") {
    return (
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-[#0c100e] shadow-[0_22px_60px_-22px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-2 border-b border-line/80 bg-card px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          <span className="ml-2 flex-1 truncate rounded-full bg-surface px-3 py-1 text-center font-mono text-[10px] text-zinc-500">
            {target.liveUrl ?? `${slug}.web (not deployed)`}
          </span>
          {target.liveUrl && (
            <span className="live-badge flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-ink">
              <Play size={9} fill="currentColor" /> Live
            </span>
          )}
        </div>
        {target.liveUrl ? (
          <LiveEmbed url={target.liveUrl} fallback={shots[0] ? src(shots[0]) : undefined} />
        ) : shots.length > 0 ? (
          <FitImage src={src(shots[shot])} alt={`${target.platform} — web`} targetAspect={16 / 9} className="aspect-video w-full" />
        ) : (
          <div className="font-mono-os flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black/40 text-xs text-zinc-500">
            <Globe size={20} className="text-zinc-600" />
            web target coming
          </div>
        )}
      </div>
    );
  }

  if (target.deviceFrame === "desktop") {
    // Also doubles as an honest stand-in for phone platforms that don't yet
    // have a real portrait capture (see Kursi's Android/iOS targets) — a
    // landscape capture shown at its real shape, never stuffed into a phone
    // bezel it doesn't match.
    const isNativeDesktop = target.platform === "Desktop";
    return (
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-[#0c100e] shadow-[0_22px_60px_-22px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-2 border-b border-line/80 bg-card px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          <span className="ml-2 text-[10px] text-zinc-500">{isNativeDesktop ? `${target.platform} window` : `${target.platform} preview (desktop capture)`}</span>
        </div>
        {shots.length > 0 && (
          <FitImage src={src(shots[shot])} alt={`${target.platform} window`} targetAspect={16 / 9} className="aspect-video w-full" />
        )}
      </div>
    );
  }

  if (target.deviceFrame === "widget") {
    // For widget / Live Activity captures — genuinely wide-short surfaces,
    // not full device screens. No bezel: a plain card, letterboxed so the
    // real widget shape is never cropped down to a sliver.
    return (
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-line bg-[#0c100e] p-3 shadow-[0_22px_60px_-22px_rgba(0,0,0,0.85)]">
        {shots.length > 0 && (
          <FitImage src={src(shots[shot])} alt={`${target.platform} widget`} targetAspect={16 / 9} className="aspect-video w-full rounded-lg" />
        )}
      </div>
    );
  }

  if (target.deviceFrame === "watch") {
    // watchOS (Apple Watch) is a rounded rectangle, not a circle — Wear OS
    // faces are genuinely round. Forcing an Apple Watch capture into a
    // circular mask both misrepresents the device and crops the corners.
    const isAppleWatch = target.platform === "watchOS";
    return (
      <div className={`device glow-pulse mx-auto w-40 sm:w-48 ${isAppleWatch ? "aspect-[4/5] !rounded-[2.5rem]" : "aspect-square !rounded-full"}`}>
        {shots.length > 0 && (
          <FitImage
            src={src(shots[shot])}
            alt={`${target.platform} watch face`}
            targetAspect={isAppleWatch ? 4 / 5 : 1}
            className="h-full w-full"
          />
        )}
      </div>
    );
  }

  // phone (default)
  return (
    <div className="device glow-pulse mx-auto aspect-[9/19] w-40 sm:w-48">
      {shots.length > 0 && (
        <FitImage src={src(shots[shot])} alt={`${target.platform} screen`} targetAspect={9 / 19} className="h-full w-full" />
      )}
    </div>
  );
}

/**
 * "One codebase, N surfaces" — a target switcher that shows a project's real
 * screenshots (or, for Web, the deployed build live) in the right device
 * chrome per platform. The tab row scrolls horizontally on narrow screens so
 * it never overflows; arrows step through a target's screens.
 */
export function DeviceWall({ targets, slug, accent }: { targets: ProjectTarget[]; slug: string; accent?: string }) {
  const [active, setActive] = useState(0);
  const [shot, setShot] = useState(0);
  const target = targets[active];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function pick(i: number) {
    setActive(i);
    setShot(0);
  }

  // Roving focus: arrow keys move both the active target and DOM focus
  // together, so repeated presses step through every tab (not just toggle
  // between the pressed button and its neighbour).
  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (active + 1) % targets.length : (active - 1 + targets.length) % targets.length;
    pick(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Platform" className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
        {targets.map((t, i) => {
          const TIcon = PLATFORM_ICON[t.platform];
          return (
            <button
              key={t.platform}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              aria-selected={i === active}
              onClick={() => pick(i)}
              onKeyDown={onTabKeyDown}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                i === active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
              }`}
            >
              <TIcon size={14} /> {t.platform}
              {t.liveUrl && <Play size={9} fill="currentColor" className="text-accent" />}
            </button>
          );
        })}
      </div>

      <div key={target.platform} className="fade-in">
        <div className="relative flex items-center justify-center gap-3">
          {target.screens.length > 1 && target.deviceFrame !== "browser" && (
            <button
              onClick={() => setShot((s) => (s - 1 + target.screens.length) % target.screens.length)}
              aria-label="Previous screen"
              className="hidden shrink-0 rounded-full border border-line bg-card p-2 text-zinc-300 transition hover:border-accent/50 hover:text-accent sm:flex"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div className="flex-1">
            <DeviceFrame target={target} slug={slug} shot={shot} />
          </div>
          {target.screens.length > 1 && target.deviceFrame !== "browser" && (
            <button
              onClick={() => setShot((s) => (s + 1) % target.screens.length)}
              aria-label="Next screen"
              className="hidden shrink-0 rounded-full border border-line bg-card p-2 text-zinc-300 transition hover:border-accent/50 hover:text-accent sm:flex"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
        {target.screens.length > 1 && target.deviceFrame !== "browser" && (
          <div className="mt-4 flex items-center justify-center gap-1.5 sm:hidden">
            {target.screens.map((_, i) => (
              <button
                key={i}
                aria-label={`Screen ${i + 1}`}
                onClick={() => setShot(i)}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === shot ? 18 : 6, backgroundColor: i === shot ? (accent ?? "var(--color-accent)") : "var(--color-line)" }}
              />
            ))}
          </div>
        )}
        {target.note && <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-zinc-500 mx-auto">{target.note}</p>}
      </div>
    </div>
  );
}
