import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { projects } from "./data/profile.ts";
import { galleries } from "./data/galleries.ts";

/** Adds `.revealed` to `.reveal` children as they scroll into view. */
function useScrollReveal(dep: unknown) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>(".reveal");
    if (!nodes?.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("revealed")),
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [dep]);
  return root;
}

/** Plays a muted video only while it's on screen — alive, but light. */
function AutoVideo({ src, caption }: { src: string; caption: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <figure className="float-soft">
      <div className="device glow-pulse">
        <video ref={ref} src={src} muted loop playsInline preload="metadata" className="block w-full" />
      </div>
      <figcaption className="mt-3 text-center text-xs text-zinc-500">{caption}</figcaption>
    </figure>
  );
}

/** Renders a Mermaid diagram, dark-themed. mermaid is dynamically imported so
 *  it stays out of the main bundle (loads only on project detail pages). */
function Mermaid({ code, id, accent = "#3ddc84", card = "#10231a" }: { code: string; id: string; accent?: string; card?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          flowchart: { htmlLabels: true, curve: "basis", padding: 12 },
          themeVariables: {
            fontFamily: "Inter, system-ui, sans-serif",
            background: "#171e1a",
            primaryColor: card,
            primaryBorderColor: accent,
            primaryTextColor: "#e8efe9",
            lineColor: accent,
            secondaryColor: "#0f1512",
            tertiaryColor: "#0f1512",
            clusterBkg: "#0f1512",
            clusterBorder: "#243029",
          },
        });
        const { svg } = await mermaid.render(id, code);
        if (alive) setSvg(svg);
      } catch {
        /* ignore render errors — diagram simply won't show */
      }
    })();
    return () => { alive = false; };
  }, [code, id, accent, card]);
  if (!svg) return null;
  return <div className="mermaid-wrap flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function ProjectDetail({ slug }: { slug: string }) {
  const project = projects.find((p) => p.slug === slug);
  // Prefer a curated, captioned set; fall back to the auto-generated gallery.
  const items: { src: string; caption: string }[] = project?.screens?.length
    ? project.screens.map((s) => ({ src: `/projects/${slug}/screenshots/${s.file}`, caption: s.caption }))
    : (galleries[slug] ?? []).map((src) => ({ src, caption: "" }));
  const [idx, setIdx] = useState<number | null>(null);
  const root = useScrollReveal(slug);
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRail = (dir: number) =>
    railRef.current?.scrollBy({ left: dir * railRef.current.clientWidth * 0.85, behavior: "smooth" });
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  // Swap the browser-tab favicon to this project's brand icon while its page is
  // open; restore the site default on unmount (e.g. navigating back to #work).
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link || !project?.icon) return;
    const original = link.href;
    link.href = project.icon;
    return () => {
      link.href = original;
    };
  }, [project]);

  const close = useCallback(() => setIdx(null), []);
  const step = useCallback(
    (d: number) => setIdx((i) => (i === null ? i : (i + d + items.length) % items.length)),
    [items.length],
  );
  useEffect(() => {
    if (idx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, close, step]);

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-zinc-400">Project not found.</p>
        <a href="#projects" className="mt-4 inline-flex items-center gap-1 text-accent">
          <ArrowLeft size={16} /> Back to projects
        </a>
      </div>
    );
  }
  const d = project.detail;
  const t = project.theme;
  const themeVars: Record<string, string> = {};
  if (t) {
    themeVars["--color-accent"] = t.accent;
    themeVars["--color-accent-dim"] = t.accentDim;
    if (t.ink) themeVars["--color-ink"] = t.ink;
    if (t.surface) themeVars["--color-surface"] = t.surface;
    if (t.card) themeVars["--color-card"] = t.card;
    if (t.line) themeVars["--color-line"] = t.line;
    if (t.displayFont) themeVars["--font-display"] = t.displayFont;
  }
  const themeStyle = t ? (themeVars as unknown as CSSProperties) : undefined;

  return (
    <div ref={root} className="min-h-screen bg-ink" style={themeStyle}>
      {/* Hero with animated aurora wash */}
      <div className="relative overflow-hidden border-b border-line">
        <div className="aurora pointer-events-none absolute inset-0 opacity-80" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-ink" />
        <div className="relative mx-auto max-w-5xl px-6 pb-14 pt-10">
          <a href="#projects" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> All projects
          </a>
          <p className="rise-in mt-8 text-xs font-semibold uppercase tracking-widest text-accent/70">// project</p>
          <h1 className="rise-in rise-in-1 font-display mt-2 text-4xl font-bold tracking-tight sm:text-6xl">
            {project.name}
          </h1>
          <span className="sheen rise-in rise-in-1 mt-3 block h-[3px] w-28 rounded-full bg-clip-content" />
          <p className="rise-in rise-in-2 mt-4 max-w-3xl text-lg text-accent">{project.tagline}</p>
          <p className="rise-in rise-in-2 mt-4 max-w-3xl leading-relaxed text-zinc-300">
            {d?.overview ?? project.description}
          </p>
          <div className="rise-in rise-in-3 mt-5 flex flex-wrap gap-2">
            {project.stack.map((s) => (
              <span key={s} className="rounded-full border border-accent/25 bg-accent/5 px-2.5 py-0.5 text-xs text-accent/90">
                {s}
              </span>
            ))}
          </div>
          <div className="rise-in rise-in-3 mt-6 flex flex-wrap items-center gap-4">
            {project.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target={l.url.startsWith("#") ? undefined : "_blank"}
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink shadow-[0_0_30px_-8px_rgba(61,220,132,0.6)] transition hover:bg-accent-dim"
              >
                {l.label} <ArrowUpRight size={14} />
              </a>
            ))}
            <span className="text-sm text-zinc-500">{project.status}</span>
          </div>
        </div>
      </div>

      {/* Metrics band */}
      {d?.metrics && d.metrics.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px px-6 py-8 sm:grid-cols-4">
            {d.metrics.map((m) => (
              <div key={m.label} className="px-4 py-2">
                <p className="font-display text-3xl font-bold text-accent sm:text-4xl">{m.value}</p>
                <p className="mt-1 text-xs leading-snug text-zinc-400">{m.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Videos — device-framed, autoplay on view */}
      {d?.videos && d.videos.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="reveal font-display mb-8 text-sm font-semibold uppercase tracking-widest text-accent/60">
              In motion
            </h2>
            <div className="reveal grid gap-8 sm:grid-cols-3">
              {d.videos.map((v) => (
                <AutoVideo key={v.src} src={v.src} caption={v.caption} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Deep-dive sections — scroll-revealed cards */}
      {d?.sections && d.sections.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-6 sm:grid-cols-2">
            {d.sections.map((s, i) => (
              <div
                key={s.heading}
                className="reveal gallery-item rounded-2xl border border-line bg-card p-6"
                style={{ transitionDelay: `${(i % 2) * 80}ms` }}
              >
                <h3 className="font-display text-lg font-bold text-accent">{s.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roster (e.g. Kursi's six roles) */}
      {d?.roles && d.roles.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="reveal font-display mb-8 text-sm font-semibold uppercase tracking-widest text-accent/60">
              The roster
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.roles.map((r) => (
                <div key={r.name} className="reveal gallery-item flex gap-3 rounded-2xl border border-line bg-card p-4">
                  <span
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-black/40"
                    style={{ backgroundColor: r.color }}
                  />
                  <div>
                    <h3 className="font-display text-base font-bold">{r.name}</h3>
                    <p className="mt-0.5 text-sm leading-snug text-zinc-400">{r.power}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Architecture diagrams (Mermaid) */}
      {d?.diagrams && d.diagrams.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="reveal font-display mb-8 text-sm font-semibold uppercase tracking-widest text-accent/60">
              How it's built
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {d.diagrams.map((dg, i) => (
                <div key={dg.title} className="reveal rounded-2xl border border-line bg-card p-5">
                  <h3 className="mb-4 text-sm font-semibold text-zinc-200">{dg.title}</h3>
                  <Mermaid code={dg.code} id={`mmd-${slug}-${i}`} accent={t?.accent} card={t?.card} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tech stack */}
      {d?.techStack && d.techStack.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="reveal font-display mb-8 text-sm font-semibold uppercase tracking-widest text-accent/60">
              Under the hood
            </h2>
            <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {d.techStack.map((t) => (
                <div key={t.group} className="reveal">
                  <h3 className="mb-2 text-sm font-semibold text-accent">{t.group}</h3>
                  <ul className="space-y-1 text-sm text-zinc-300">
                    {t.items.map((it) => (
                      <li key={it} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gallery — horizontal carousel (space-saving), hover glow, navigable lightbox */}
      {items.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-accent/60">
                Screens <span className="text-zinc-600">({items.length})</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => scrollRail(-1)}
                  aria-label="Scroll left"
                  className="rounded-full border border-line bg-card p-2 text-zinc-300 transition hover:border-accent/50 hover:text-accent"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => scrollRail(1)}
                  aria-label="Scroll right"
                  className="rounded-full border border-line bg-card p-2 text-zinc-300 transition hover:border-accent/50 hover:text-accent"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div ref={railRef} className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
              {items.map((it, i) => (
                <button
                  key={it.src}
                  onClick={() => setIdx(i)}
                  className="group/shot w-40 shrink-0 snap-start sm:w-44"
                  title={it.caption}
                >
                  <span className="gallery-item block overflow-hidden rounded-2xl border border-line bg-card">
                    <img src={it.src} alt={it.caption} loading="lazy" className="aspect-[9/19] h-full w-full object-cover" />
                  </span>
                  {it.caption && (
                    <span className="mt-2 block truncate text-center text-xs text-zinc-500 transition group-hover/shot:text-accent">
                      {it.caption}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-zinc-600 sm:text-left">Swipe or use the arrows · tap a screen to enlarge</p>
          </div>
        </section>
      )}

      {/* Explore more */}
      {d?.extraLinks && d.extraLinks.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent/60">Explore more</span>
            {d.extraLinks.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 transition hover:text-accent"
              >
                {l.label} <ArrowUpRight size={14} />
              </a>
            ))}
            <a href="#resume" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 transition hover:text-accent">
              Résumé
            </a>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-5xl px-6 py-12 text-center">
        <a href="#projects" className="inline-flex items-center gap-2 text-sm text-accent transition hover:text-accent-dim">
          <ArrowLeft size={16} /> Back to all projects
        </a>
      </div>

      {/* Lightbox */}
      {idx !== null && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={close}>
          <button onClick={close} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            className="absolute left-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:left-8"
          >
            <ChevronLeft size={22} />
          </button>
          <img
            key={items[idx].src}
            src={items[idx].src}
            alt={items[idx].caption}
            className="lb-in max-h-[85vh] max-w-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); step(1); }}
            className="absolute right-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:right-8"
          >
            <ChevronRight size={22} />
          </button>
          <span className="absolute bottom-5 flex flex-col items-center gap-1 text-xs text-zinc-400">
            {items[idx].caption && <span className="text-zinc-200">{items[idx].caption}</span>}
            <span>{idx + 1} / {items.length}</span>
          </span>
        </div>
      )}
    </div>
  );
}
