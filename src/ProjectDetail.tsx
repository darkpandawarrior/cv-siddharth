import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, X, ChevronLeft, ChevronRight, Share2, Check } from "lucide-react";
import { projects } from "./data/profile.ts";
import { galleries } from "./data/galleries.ts";
import { ScreenMarquee } from "./ScreenMarquee.tsx";
import { PROJECT_ORDER } from "./data/connections.ts";
import { FieldNotes, SystemStrip } from "./FieldNotes.tsx";
import { openChat } from "./FloatingChat.tsx";
import { AnimatedMetric } from "./AnimatedMetric.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { DeviceWall } from "./DeviceWall.tsx";
import { ShowcaseFilm } from "./ShowcaseFilm.tsx";
// See App.tsx: the deep-link signal lives in the plain-data registry, so a
// project page linking into a lab does not have to ship the lab.
import { openLab, type LabKey } from "./data/labs.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { Picture } from "./Picture.tsx";
import { CompareSection } from "./Compare.tsx";
import { useSectionNav, classifyHash } from "./lib/navigation.ts";
import { PipelineShowcase } from "./PipelineShowcase.tsx";

// Projects with a narrated showcase film under public/projects/<slug>/showcase/.
const FILM_PROJECTS = new Set(["doori", "gaddi", "paymentslab-kmp"]);

// Project → its Lab Bench experiment.
const LAB_OF: Record<string, LabKey> = {
  doori: "modules",
  "paymentslab-kmp": "gateways",
  gaddi: "search",
  candidai: "fanout",
  stutter: "replay",
};

/** "Next build" pager — project pages loop into each other instead of dead-ending. */
function NextProject({ slug }: { slug: string }) {
  const i = PROJECT_ORDER.indexOf(slug);
  if (i === -1) return null;
  const next = projects.find((p) => p.slug === PROJECT_ORDER[(i + 1) % PROJECT_ORDER.length]);
  if (!next) return null;
  return (
    <section className="border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/project/$slug"
          params={{ slug: next.slug }}
          className="panel card-elevated group flex items-center justify-between gap-4 p-6 transition hover:border-accent/50"
        >
          <div>
            <p className="kicker-accent">next build</p>
            <p className="font-display mt-1 text-xl font-bold transition group-hover:text-accent">{next.name}</p>
            <p className="mt-1 text-sm text-zinc-400">{next.tagline}</p>
          </div>
          <span className="text-2xl text-accent transition group-hover:translate-x-1.5">→</span>
        </Link>
      </div>
    </section>
  );
}

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
      <figcaption className="mt-3 text-center text-xs text-muted">{caption}</figcaption>
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

/** Share the project via its SSR'd /project/<slug> route — the URL whose
 *  canonical + OG card are this project's own. Uses the native share sheet on
 *  mobile, clipboard everywhere else. */
function ShareProject({ slug, name }: { slug: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const onShare = async () => {
    // Computed on click, not at render time — `window` isn't available during SSR.
    const url = `${window.location.origin}/project/${slug}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: name, url });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing else to do */
    }
  };
  return (
    <button
      onClick={onShare}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-accent hover:text-accent"
      aria-live="polite"
    >
      {copied ? <Check size={14} /> : <Share2 size={14} />} {copied ? "Link copied" : "Share"}
    </button>
  );
}

/** Section eyebrow + heading, matching the homepage's "// label" rhythm. */
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="reveal mb-8">
      <p className="section-eyebrow mb-2">// {eyebrow}</p>
      <h2 className="font-display text-h2 font-bold tracking-tight">{title}</h2>
    </div>
  );
}

export function ProjectDetail({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { goToSection } = useSectionNav();
  const project = projects.find((p) => p.slug === slug);
  // Prefer a curated, captioned set; fall back to the auto-generated gallery.
  const items: { src: string; caption: string }[] = project?.screens?.length
    ? project.screens.map((s) => ({ src: `/projects/${slug}/screenshots/${s.file}`, caption: s.caption }))
    : (galleries[slug] ?? []).map((src) => ({ src, caption: "" }));
  const [idx, setIdx] = useState<number | null>(null);
  const root = useScrollReveal(slug);
  const railRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
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

  // Tab title + description while this page is open used to be set here
  // imperatively (snapshot document.title on mount, restore it on unmount).
  // On a browser Back off this page, the destination route's OWN head()
  // (below, and every other route's) had already set the correct title before
  // this effect's cleanup fired — restoring a STALE snapshot taken back when
  // this page mounted, clobbering the destination's real title with this
  // page's. /project/$slug's `head()` already sets the same title and
  // description declaratively (see routes/project.$slug.tsx), the mechanism
  // every other route relies on with no per-component effect at all, so this
  // one is deleted rather than patched to fire correctly on every nav path.

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

  // Focus management for the lightbox overlay: it visually covers the whole
  // viewport but nothing traps Tab inside it, so a keyboard user needs a
  // clear entry point (the close button) and their focus handed back to
  // whatever they were on (the gallery thumbnail) once it closes — otherwise
  // Escape/click-away "closes" a dialog that's still holding their focus.
  const lightboxOpen = idx !== null;
  useEffect(() => {
    if (!lightboxOpen) return;
    lightboxTriggerRef.current = document.activeElement as HTMLElement | null;
    lightboxCloseRef.current?.focus();
    return () => {
      lightboxTriggerRef.current?.focus();
    };
  }, [lightboxOpen]);

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-zinc-400">Project not found.</p>
        <button type="button" onClick={() => goToSection("projects")} className="mt-4 inline-flex items-center gap-1 text-accent">
          <ArrowLeft size={16} /> Back to projects
        </button>
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
    <main ref={root} id="main-content" tabIndex={-1} className="project-detail min-h-screen bg-ink" style={themeStyle}>
      {/* Hero with animated aurora wash */}
      <div className="relative overflow-hidden border-b border-line">
        <div className="aurora pointer-events-none absolute inset-0 opacity-80 print:hidden" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-ink print:hidden" />
        <div className="section-y relative mx-auto max-w-5xl px-6">
          <button type="button" onClick={() => goToSection("projects")} className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> All projects
          </button>
          {/* Case-study triptych: the name and what it is, the brief, and what
              actually shipped — three columns you can read in any order. It
              replaced a single stacked run of paragraphs, which made every
              project read like the same block of text at a glance. */}
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.75fr)] lg:gap-12">
            <div>
              <p className="rise-in text-xs font-semibold uppercase tracking-widest text-accent/70">// project</p>
              {/* Shared-element morph target: the home projects-grid card title of
                  the same `project-title-<slug>` name lifts into this hero heading
                  on card→detail navigation (View Transitions). rise-in stays for
                  direct loads, where no morph occurs. */}
              <h1
                className="rise-in rise-in-1 font-display mt-2 text-hero font-bold tracking-tight text-balance"
                style={{ viewTransitionName: `project-title-${slug}` }}
              >
                {project.name}
              </h1>
              <span className="sheen rise-in rise-in-1 mt-3 block h-[3px] w-28 rounded-full bg-clip-content" />
              <p className="rise-in rise-in-2 mt-4 text-lg text-accent">{project.tagline}</p>
            </div>
            <div className="rise-in rise-in-2">
              <p className="brief-label">The brief</p>
              <p className="mt-3 leading-relaxed text-zinc-300">{d?.overview ?? project.description}</p>
            </div>
            {project.highlights.length > 0 && (
              <div className="rise-in rise-in-3">
                <p className="brief-label">What shipped</p>
                <ul className="mt-3 space-y-2.5 text-sm leading-snug text-zinc-300">
                  {project.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="rise-in rise-in-3 mt-8 flex flex-wrap gap-2">
            {project.stack.map((s) => (
              <span key={s} className="rounded-full border border-accent/25 bg-accent/5 px-2.5 py-0.5 text-xs text-accent/90">
                {s}
              </span>
            ))}
          </div>
          <div className="rise-in rise-in-3 mt-6 flex flex-wrap items-center gap-4 print:hidden">
            {project.links.map((l) => {
              const ctaClass = "cta-glow inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim";
              if (!l.url.startsWith("#")) {
                return (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={ctaClass}>
                    {l.label} <ArrowUpRight size={14} />
                  </a>
                );
              }
              const c = classifyHash(l.url);
              if (c.kind === "section") {
                return (
                  <button key={l.url} type="button" onClick={() => goToSection(c.id)} className={ctaClass}>
                    {l.label} <ArrowUpRight size={14} />
                  </button>
                );
              }
              const to = c.kind === "project" ? "/project/$slug" : c.to;
              const params = c.kind === "project" ? { slug: c.slug } : undefined;
              return (
                <Link key={l.url} to={to} params={params} className={ctaClass}>
                  {l.label} <ArrowUpRight size={14} />
                </Link>
              );
            })}
            {project.deployments?.some((d) => d.url) && (
              <a
                href={project.deployments.find((d) => d.url)!.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20"
              >
                Install it <ArrowUpRight size={14} />
              </a>
            )}
            {LAB_OF[slug] && (
              <button
                onClick={() => { openLab(LAB_OF[slug]); navigate({ to: "/lab" }); }}
                className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent transition hover:bg-accent/20"
              >
                Open in Lab Bench →
              </button>
            )}
            <button
              onClick={() => openChat(`Walk me through the ${project.name} build — the architecture and the hardest problems.`)}
              className={
                t
                  ? "inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/10"
                  : "inline-flex items-center gap-1.5 rounded-full border border-accent2/40 px-4 py-2 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10"
              }
            >
              ✦ Ask my AI about {project.name}
            </button>
            <ShareProject slug={slug} name={project.name} />
            <span className="text-sm text-muted">{project.status}</span>
          </div>
          <FieldNotes slug={slug} className="rise-in rise-in-3 mt-4" />
          <SystemStrip slug={slug} className="rise-in rise-in-3 mt-3" />
        </div>
      </div>

      {/* The poster band: real screens, full-bleed, straight under the header.
          Without it the page opened on three columns of prose and nothing to
          look at until well past the fold. */}
      {items.length > 0 && (
        <ScreenMarquee screens={items.map((i) => i.src)} alt={`Screens from ${project.name}`} />
      )}

      {/* Narrated product tour — storyboarded from real screens */}
      {FILM_PROJECTS.has(slug) && (
        <section className="border-b border-line bg-surface">
          <div className="section-y mx-auto max-w-4xl px-6">
            <SectionHeader eyebrow="guided tour" title="Two minutes, narrated" />
            <p className="reveal -mt-4 mb-8 max-w-2xl text-sm leading-relaxed text-zinc-400">
              A storyboarded walkthrough of the real app — tap the speaker for the voiceover, or read along with the captions.
            </p>
            <div className="reveal">
              <ShowcaseFilm slug={slug} title={project.name} />
            </div>
          </div>
        </section>
      )}

      {/* Where it actually ships. A repo proves it was written; a listing proves it ships. */}
      {project.deployments && project.deployments.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="section-y mx-auto max-w-4xl px-6">
            <SectionHeader eyebrow="shipping" title="Where you can actually get it" />
            <p className="reveal -mt-4 mb-8 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Every line below is checkable. Add the repository in an F-Droid client and the app installs,
              signed with the same key its listing pins.
            </p>
            <ul className="reveal flex flex-col gap-3">
              {project.deployments.map((dep) => (
                <li key={dep.channel} className="panel flex flex-col gap-1 p-5 sm:flex-row sm:items-start sm:gap-5">
                  <span className="font-display shrink-0 text-sm font-bold text-accent sm:w-40">{dep.channel}</span>
                  <span className="flex-1 text-sm leading-relaxed text-zinc-400">
                    {dep.detail}
                    {dep.url && (
                      <>
                        {" "}
                        <a
                          href={dep.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-accent underline-offset-2 hover:underline"
                        >
                          open <ArrowUpRight size={11} />
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="reveal mt-10">
              <SectionHeader eyebrow="pipeline" title="The build that put it there" />
              <p className="-mt-4 mb-6 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Read live from GitHub Actions and the F-Droid index. Not a badge: the actual runs,
                what shipped, and the certificate you can check the download against.
              </p>
              <PipelineShowcase slug={slug} />
            </div>
          </div>
        </section>
      )}

      {/* Metrics band — same animated count-up/gauge as the homepage */}
      {d?.metrics && d.metrics.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-line px-6 py-4 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:py-8 lg:grid-cols-4">
            {d.metrics.map((m) => (
              <AnimatedMetric key={m.label} metric={m} />
            ))}
          </div>
        </section>
      )}

      {/* Multiplatform device-wall — "one codebase, N surfaces", the thesis */}
      {project.targets && project.targets.length > 0 && (
        <section className="section-y border-b border-line">
          <div className="mx-auto max-w-4xl px-6">
            <SectionHeader eyebrow="multiplatform" title="One codebase, every surface" />
            <p className="reveal -mt-4 mb-10 max-w-2xl text-sm leading-relaxed text-zinc-400">
              The real screens (and, where it's live, the running build) per platform — not a mockup.
            </p>
            <div className="reveal">
              <DeviceWall key={slug} targets={project.targets} slug={slug} accent={t?.accent} />
            </div>
          </div>
        </section>
      )}

      {/* Videos — device-framed, autoplay on view */}
      {d?.videos && d.videos.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="section-y mx-auto max-w-5xl px-6">
            <SectionHeader eyebrow="in motion" title="Watch it run" />
            <div className="reveal grid gap-8 sm:grid-cols-3">
              {d.videos.map((v) => (
                <AutoVideo key={v.src} src={v.src} caption={v.caption} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Deep-dive sections — tilt-glow cards, same signature hover as the homepage */}
      {d?.sections && d.sections.length > 0 && (
        <section className="section-y mx-auto max-w-5xl px-6">
          <SectionHeader eyebrow="design notes" title="How it works" />
          <div className="grid gap-6 sm:grid-cols-2">
            {d.sections.map((s, i) => (
              <div key={s.heading} className="reveal h-full" style={{ transitionDelay: `${(i % 2) * 100}ms` }}>
                <TiltCard>
                  <article className="panel card-elevated h-full p-6 transition hover:border-accent/50">
                    <h3 className="font-display text-lg font-bold text-accent">{s.heading}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-300">{s.body}</p>
                  </article>
                </TiltCard>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roster (e.g. Gaddi's six roles) */}
      {d?.roles && d.roles.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="section-y mx-auto max-w-5xl px-6">
            <SectionHeader eyebrow="cast" title="The roster" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.roles.map((r, i) => (
                <div key={r.name} className="reveal h-full" style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
                  <TiltCard maxTilt={3}>
                    <div className="panel card-elevated flex h-full gap-3 p-4">
                      <span
                        className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-black/40"
                        style={{ backgroundColor: r.color }}
                      />
                      <div>
                        <h3 className="font-display text-base font-bold">{r.name}</h3>
                        <p className="mt-0.5 text-sm leading-snug text-zinc-400">{r.power}</p>
                      </div>
                    </div>
                  </TiltCard>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Architecture diagrams (Mermaid) */}
      {d?.diagrams && d.diagrams.length > 0 && (
        <section className="border-t border-line">
          <div className="section-y mx-auto max-w-5xl px-6">
            <SectionHeader eyebrow="architecture" title="How it's built" />
            <div className="grid gap-6 lg:grid-cols-2">
              {d.diagrams.map((dg, i) => (
                <div key={dg.title} className="panel reveal card-elevated p-5">
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
        <section className="border-t border-line bg-surface">
          <div className="section-y mx-auto max-w-5xl px-6">
            <SectionHeader eyebrow="under the hood" title="Tech stack" />
            <div className="panel card-elevated grid gap-x-6 gap-y-8 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
              {d.techStack.map((ts) => (
                <div key={ts.group} className="reveal">
                  <h3 className="mb-2 text-sm font-semibold text-accent">{ts.group}</h3>
                  <ul className="space-y-1 text-sm text-zinc-300">
                    {ts.items.map((it) => (
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

      {/* Design directions — renders only for projects that have a compare set */}
      <CompareSection slug={slug} />

      {/* Gallery — horizontal carousel (space-saving), hover glow, navigable lightbox */}
      {items.length > 0 && (
        <section className="border-t border-line">
          <div className="section-y mx-auto max-w-6xl px-6">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="section-eyebrow mb-2">// gallery</p>
                <h2 className="font-display text-h2 font-bold tracking-tight">
                  Screens <span className="text-muted">({items.length})</span>
                </h2>
              </div>
              <div className="flex gap-2 print:hidden">
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
                  className="group/shot shrink-0 snap-start"
                  title={it.caption}
                >
                  {/* Fixed height, natural width, capped. This used to force aspect-[9/19] + object-cover on
                      every capture, which is a phone frame — so Gaddi, whose captures are 46 desktop
                      1440x900 frames against 10 phone ones, had its landscape screenshots cropped to
                      a vertical sliver. Doori is almost all 411x891, so the bug was invisible there
                      and shipped. A rail of equal-height, varying-width tiles keeps every project's
                      real shape and still lines up. The width cap matters as much: PaymentsLab-KMP
                      ships component strips as wide as 6.67:1, which at this height would render
                      1,920px across and swallow the whole rail. */}
                  <span className="panel gallery-item flex h-72 max-w-[26rem] items-center justify-center overflow-hidden">
                    {/* alt="" when the caption is already on screen. The
                        caption sits directly below this image AND is the
                        button's `title`, so alt={it.caption} made a screen
                        reader say the same sentence twice inside one control —
                        Lighthouse flags all 64 of them as redundant alt text.
                        A decorative alt is correct here: the image is not
                        conveying anything the caption does not. When there is
                        no caption the alt has to do the work instead. */}
                    <Picture
                      src={it.src}
                      alt={it.caption ? "" : "Screenshot"}
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  {it.caption && (
                    <span className="mt-2 line-clamp-2 block max-w-64 text-center text-xs text-muted transition group-hover/shot:text-accent">
                      {it.caption}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted sm:text-left">Swipe or use the arrows · tap a screen to enlarge</p>
          </div>
        </section>
      )}

      {/* Explore more */}
      {d?.extraLinks && d.extraLinks.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent/70">Explore more</span>
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
            <Link to="/resume" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 transition hover:text-accent">
              Résumé
            </Link>
          </div>
        </section>
      )}

      {/* Keep the journey moving: next build in the loop + ways back. */}
      <NextProject slug={slug} />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-6 px-6 py-12 text-center print:hidden">
        <button type="button" onClick={() => goToSection("projects")} className="inline-flex items-center gap-2 text-sm text-accent transition hover:text-accent-dim">
          <ArrowLeft size={16} /> Back to all projects
        </button>
        <Link to="/map" className={`inline-flex items-center gap-1 text-sm text-zinc-400 transition ${t ? "hover:text-accent" : "hover:text-accent2"}`}>
          See how everything connects →
        </Link>
      </div>

      {/* Lightbox */}
      {idx !== null && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`Screenshot ${idx + 1} of ${items.length}${items[idx].caption ? `: ${items[idx].caption}` : ""}`}
        >
          <button
            ref={lightboxCloseRef}
            onClick={close}
            aria-label="Close screenshot viewer"
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Previous screenshot"
            className="absolute left-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:left-8"
          >
            <ChevronLeft size={22} />
          </button>
          <Picture
            key={items[idx].src}
            src={items[idx].src}
            alt={items[idx].caption}
            loading="eager"
            className="lb-in max-h-[85vh] max-w-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next screenshot"
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
    </main>
  );
}
