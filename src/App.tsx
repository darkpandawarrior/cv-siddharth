import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  MapPin,
  ArrowUpRight,
  MessageCircle,
  FileText,
  Github,
  Linkedin,
  Smartphone,
  Watch,
  Monitor,
  Globe,
  Play,
} from "lucide-react";
import { profile, metrics, experience, education, caseStudies, skills, projects, openSource, recentGrowth, sharedFoundation } from "./data/profile.ts";
import { FloatingChat, openChat } from "./FloatingChat.tsx";
import { AmbientBackground } from "./AmbientBackground.tsx";
import { Phone3D } from "./Phone3D.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { AnimatedMetric } from "./AnimatedMetric.tsx";
import { ScrollBot } from "./ScrollBot.tsx";
import { ResumeView } from "./ResumeView.tsx";
import { WritingView } from "./WritingView.tsx";
import { ProjectDetail } from "./ProjectDetail.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { FoundationGraph } from "./FoundationGraph.tsx";
import { Reveal } from "./Reveal.tsx";
import { WritingSection } from "./WritingSection.tsx";
import { StoryMap } from "./StoryMap.tsx";
import { FieldNotes } from "./FieldNotes.tsx";
import { CursorAura } from "./CursorAura.tsx";
import { SiteFooter } from "./SiteFooter.tsx";
import { SkillsOrbit } from "./SkillsOrbit.tsx";
import { LabBench, openLab, type LabKey } from "./LabBench.tsx";
import { writing } from "./data/writing.ts";

// The tldraw SDK loads only when someone actually enters the Blueprint Room.
const BlueprintRoom = lazy(() => import("./BlueprintRoom.tsx"));

const SKILL_ICONS: Record<string, string> = {
  "UI & Architecture": "🎨",
  "Concurrency & Data": "⚡",
  "Platform & Systems": "🛰️",
  "Security & Ops": "🔐",
};

// Known multiplatform targets a project's `stack` might declare — matched in
// declared order so the badge row reads like a device lineup, not a bag of tags.
const PLATFORM_ICONS: { match: (s: string) => boolean; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { match: (s) => s === "Android", label: "Android", icon: Smartphone },
  { match: (s) => s === "iOS", label: "iOS", icon: Smartphone },
  { match: (s) => s === "Wear OS", label: "Wear OS", icon: Watch },
  { match: (s) => s === "watchOS", label: "watchOS", icon: Watch },
  { match: (s) => s === "Desktop", label: "Desktop", icon: Monitor },
  { match: (s) => s.startsWith("Web"), label: "Web", icon: Globe },
];

function platformsOf(stack: string[]) {
  return stack.flatMap((s) => {
    const hit = PLATFORM_ICONS.find((p) => p.match(s));
    return hit ? [hit] : [];
  });
}

// Projects with a playable web build — hints the "▶ Live" badge on the card;
// the detail page is where it's actually embedded/linked.
const LIVE_WEB_PROJECTS = new Set(["kursi", "mileway"]);

// Card-top media per project — the daily-synced gifs finally surface on the
// home page instead of living only inside detail-page galleries.
const CARD_MEDIA: Record<string, { src: string; alt: string }> = {
  kursi: { src: "/projects/kursi/screenshots/home.gif", alt: "Kursi home screen" },
  mileway: { src: "/projects/mileway/screenshots/track_a_trip.gif", alt: "Mileway trip tracking flow" },
  // ponytail: checkout_flow.gif opens on the FLAG_SECURE "screenshots blocked"
  // frame — great security story, terrible thumbnail. Static catalog shot instead.
  paymentslab: { src: "/projects/paymentslab/screenshots/lab_home_screen_catalog.png", alt: "PaymentsLab gateway catalog" },
};

const NAV_LINKS = [
  { href: "#work", label: "Case studies" },
  { href: "#projects", label: "Projects" },
  { href: "#experience", label: "Experience" },
  { href: "#skills", label: "Skills" },
  { href: "#writing", label: "Writing" },
  { href: "#contact", label: "Contact" },
];

/**
 * Resolve the active route. Hash wins, but we also accept `?project=<slug>`
 * because link-preview crawlers (e.g. LinkedIn Featured) strip the URL
 * #fragment — a query param survives, so deep links into a project page work.
 */
function resolveInitialHash(): string {
  if (window.location.hash) return window.location.hash;
  const project = new URLSearchParams(window.location.search).get("project");
  return project ? `#project/${project}` : "";
}

function useHashRoute(): string {
  const [hash, setHash] = useState(resolveInitialHash);
  useEffect(() => {
    // Normalize ?project=<slug> into the canonical hash route and drop the query.
    if (!window.location.hash) {
      const project = new URLSearchParams(window.location.search).get("project");
      if (project) {
        window.history.replaceState(null, "", `${window.location.pathname}#project/${project}`);
        setHash(`#project/${project}`);
      }
    }
    const onChange = () => {
      const apply = () => setHash(window.location.hash);
      // View Transitions API: cross-fade between routes where supported.
      if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(apply);
      } else {
        apply();
      }
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}


/**
 * Reads scroll per frame (same rAF-to-DOM pattern as TimelineSpine): fills
 * the progress beam under the nav and marks the section currently in view,
 * so the top bar doubles as a live map of the scroll journey.
 */
function useScrollSpy(): { progressRef: React.RefObject<HTMLDivElement | null>; active: string } {
  const progressRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("");

  useEffect(() => {
    let raf = 0;
    const ids = NAV_LINKS.map((l) => l.href.slice(1));
    const apply = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.width = `${max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0}%`;
      }
      // Current section: the last one whose top has crossed the upper third.
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.34) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, []);

  return { progressRef, active };
}

// Everything reachable from the phone drawer — sections plus the sub-worlds.
const DRAWER_EXTRAS = [
  { href: "#map", label: "3D Storyboard" },
  { href: "#loopdown", label: "The Loopdown" },
  { href: "#blueprint", label: "Blueprint Room" },
  { href: "#resume", label: "Résumé" },
];

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const go = (href: string) => {
    setOpen(false);
    if (!document.getElementById(href.slice(1))) window.scrollTo({ top: 0 });
    window.location.hash = href;
  };
  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-8 w-8 flex-col items-center justify-center gap-1.5 rounded-full border border-line"
      >
        <span className="h-px w-4 bg-zinc-300" />
        <span className="h-px w-4 bg-zinc-300" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-ink/85 backdrop-blur-md" onClick={() => setOpen(false)} role="presentation">
          <nav
            className="palette-in glass-panel absolute inset-x-4 top-4 rounded-2xl p-5"
            style={{ backgroundColor: "rgba(8, 11, 10, 0.97)" }}
            aria-label="Site menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold">
                sid<span className="text-accent">.</span><span className="text-zinc-400">android</span>
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full border border-line px-2.5 py-1 text-xs text-zinc-400">
                esc
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[...NAV_LINKS, ...DRAWER_EXTRAS].map((l) => (
                <button
                  key={l.href}
                  onClick={() => go(l.href)}
                  className="rounded-xl border border-line bg-card px-4 py-3 text-left text-sm font-semibold text-zinc-200 transition hover:border-accent/50 hover:text-accent"
                >
                  {l.label}
                </button>
              ))}
              <button
                onClick={() => { setOpen(false); openChat(); }}
                className="col-span-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-ink"
              >
                Ask my AI
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

function Nav() {
  const { progressRef, active } = useScrollSpy();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href="#top" className="font-display text-lg font-bold tracking-tight">
          sid<span className="text-accent">.</span><span className="text-zinc-400">android</span>
        </a>
        <div className="hidden items-center gap-6 text-sm text-zinc-400 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={active === l.href.slice(1) ? "true" : undefined}
              className={`nav-link transition hover:text-accent ${active === l.href.slice(1) ? "nav-link-active text-accent" : ""}`}
            >
              {l.label}
            </a>
          ))}
          <a href="#resume" className="flex items-center gap-1 transition hover:text-accent">
            <FileText size={13} /> Résumé
          </a>
        </div>
        <div className="flex items-center gap-2">
          <MobileMenu />
          <CommandPalette />
          <button
            onClick={() => openChat()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
          >
            <MessageCircle size={15} /> <span className="hidden sm:inline">Ask my AI</span>
          </button>
        </div>
      </nav>
      {/* Scroll-progress beam: the journey, measured. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px" aria-hidden>
        <div ref={progressRef} className="nav-progress h-full" style={{ width: 0 }} />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="section-y relative mx-auto grid max-w-5xl items-center gap-10 px-6 lg:grid-cols-[1fr_280px]">
      <div>
        <p className="rise-in mb-4 flex items-center gap-2 text-sm text-zinc-400">
          <MapPin size={14} className="text-accent" /> {profile.location} · {profile.title}
        </p>
        <h1 className="rise-in rise-in-1 font-display max-w-3xl text-hero font-bold tracking-tight">
          I take Android apps from <span className="hero-shimmer">prototype to platform.</span>
        </h1>
        <Typewriter />
        <p className="rise-in rise-in-2 mt-5 max-w-2xl text-lg leading-relaxed text-zinc-300">{profile.intro}</p>
        <div className="rise-in rise-in-3 mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => openChat()}
            className="btn-primary rounded-full bg-accent px-6 py-2.5 font-semibold text-ink hover:bg-accent-dim"
          >
            Chat with my AI assistant
          </button>
          <a
            href="#resume"
            className="rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            View résumé
          </a>
          <a
            href="#work"
            className="flex items-center gap-1.5 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-400 transition hover:border-accent/40 hover:text-zinc-200"
          >
            See my work ↓
          </a>
        </div>
        <p className="rise-in rise-in-3 mt-6 text-xs text-zinc-500">{profile.availability}</p>
        <LiveTicker />
      </div>
      <Phone3D />
    </section>
  );
}

const IDENTITY_LINES = [
  "platform owner · 50k+ MAU fintech",
  "5 platforms · one Kotlin codebase",
  "GPS 50% → 95% · crashes -80%",
  "an engineer who writes",
];

/** Cycling typewriter identity line; reduced motion gets the first line, static. */
function Typewriter() {
  const [text, setText] = useState(IDENTITY_LINES[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let line = 0;
    let len = IDENTITY_LINES[0].length;
    let deleting = false;
    let timer = 0;
    const tick = () => {
      const current = IDENTITY_LINES[line];
      len += deleting ? -1 : 1;
      setText(current.slice(0, len));
      let delay = deleting ? 26 : 44;
      if (!deleting && len === current.length) {
        deleting = true;
        delay = 2600;
      } else if (deleting && len === 0) {
        deleting = false;
        line = (line + 1) % IDENTITY_LINES.length;
        delay = 350;
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p className="rise-in rise-in-2 mt-4 h-5 font-mono text-sm text-accent2" aria-label={IDENTITY_LINES.join(" · ")}>
      <span aria-hidden>
        {"> "}
        {text}
        <span className="boot-caret">▌</span>
      </span>
    </p>
  );
}

/** Animated circuit divider — a signal pulse traveling the seam between sections. */
function Circuit() {
  return (
    <div aria-hidden className="mx-auto max-w-5xl px-6">
      <div className="circuit-line" />
    </div>
  );
}

/** Live pulse under the hero: the latest ship and the latest field note. */
function LiveTicker() {
  const latestShip = recentGrowth[recentGrowth.length - 1];
  const latestPost = writing.lessons.find((l) => l.status === "published" && l.live);
  if (!latestShip && !latestPost) return null;
  return (
    <div className="rise-in rise-in-3 mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" /> live
      </span>
      {latestShip && (
        <a href="#projects" className="transition hover:text-accent">
          ▲ shipped · {latestShip.title}
        </a>
      )}
      {latestPost && (
        <a href={latestPost.live} target="_blank" rel="noreferrer" className="transition hover:text-accent2">
          ✎ latest note · {latestPost.title}
        </a>
      )}
    </div>
  );
}

// Every headline number links to the section that proves it.
const METRIC_TARGETS = ["#experience", "#work", "#work", "#work"];

function Metrics() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-line px-6 py-4 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:py-10 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <a
            key={m.label}
            href={METRIC_TARGETS[i] ?? "#work"}
            title="See the work behind this number"
            className="group block rounded-xl transition hover:bg-card/60"
          >
            <AnimatedMetric metric={m} />
          </a>
        ))}
      </div>
    </section>
  );
}

/** Native-disclosure expander: approach bullets stay one click away. */
function HowExpander({ items }: { items: string[] }) {
  return (
    <details className="expander mt-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-accent/80 transition hover:text-accent">
        How I did it
      </summary>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
        {items.map((a) => (
          <li key={a} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
            {a}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Case study → its Lab Bench experiment.
const LAB_OF: Record<string, LabKey> = {
  "gps-accuracy": "signal",
  "crash-reduction": "crashes",
  "compose-migration": "recompose",
  "white-label": "theme",
};

function CaseStudies() {
  // Mileway leads as a media banner (full story lives at #project/mileway);
  // the Dice-era studies render as compact stat-led cards.
  const [featured, ...rest] = caseStudies;
  return (
    <section id="work" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// featured work</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Case studies</h2>
        <p className="mb-10 text-zinc-400">
          The work behind the numbers. Ask the chatbot for more depth on any of these.
        </p>
      </Reveal>

      {featured && (
        <Reveal className="mb-6">
          <TiltCard maxTilt={2.5}>
            <article
              onClick={() => { window.location.hash = "#project/mileway"; window.scrollTo({ top: 0 }); }}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.location.hash = "#project/mileway"; window.scrollTo({ top: 0 }); } }}
              className="card-elevated group grid cursor-pointer gap-0 overflow-hidden rounded-2xl border border-line bg-card transition hover:border-accent/50 lg:grid-cols-[1.15fr_1fr]"
            >
              <div className="relative min-h-[220px] overflow-hidden border-b border-line bg-void lg:border-b-0 lg:border-r">
                <img
                  src="/projects/mileway/screenshots/multiplatform.gif"
                  alt="Mileway running on phone, watch and desktop"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent/70">
                  <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" /> Flagship build
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold sm:text-3xl">Mileway</h3>
                <p className="font-display mt-1 text-sm font-semibold text-accent">{featured.metric}</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">{featured.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {featured.tags.map((t) => (
                    <span key={t} className="rounded-full border border-accent/25 bg-accent/5 px-2.5 py-1 text-xs text-accent/90">
                      {t}
                    </span>
                  ))}
                </div>
                <FieldNotes slug="mileway" className="mt-4" />
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent group-hover:text-accent-dim">
                  Full case study →
                </span>
              </div>
            </article>
          </TiltCard>
        </Reveal>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {rest.map((cs, i) => (
          <Reveal key={cs.slug} className="h-full" delay={(i % 2) * 120}>
            <TiltCard>
              <article className="card-elevated group flex h-full flex-col rounded-2xl border border-line bg-card p-6 transition hover:border-accent/50">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-metric font-bold leading-none text-accent">{cs.metric}</p>
                  <span className="font-display select-none text-4xl font-black leading-none text-accent/10">
                    {String(i + 2).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-display mt-2 text-lg font-bold">{cs.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{cs.problem}</p>
                <p className="mt-3 text-sm font-medium text-zinc-200">{cs.outcome}</p>
                <HowExpander items={cs.approach} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openChat(`Tell me more about "${cs.title}" — what was the hardest part?`); }}
                    className="flex items-center gap-1.5 rounded-full border border-accent2/30 bg-accent2/5 px-3 py-1 text-[11px] font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10"
                  >
                    <MessageCircle size={11} /> ask my AI about this
                  </button>
                  {LAB_OF[cs.slug] && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openLab(LAB_OF[cs.slug]); }}
                      className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent transition hover:bg-accent/20"
                    >
                      ▶ watch it work, live
                    </button>
                  )}
                </div>
                <FieldNotes slug={cs.slug} className="mt-4" />
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  {cs.tags.map((t) => (
                    <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-zinc-400">
                      {t}
                    </span>
                  ))}
                </div>
              </article>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Projects() {
  return (
    <section id="projects" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// projects & open source</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Things I've built</h2>
          <p className="mb-10 text-zinc-400">
            Open-source projects and tooling outside employer work — shipped end-to-end.
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2">
          {projects.map((p, i) => {
            const href = p.detail ? `#project/${p.slug}` : p.links[0]?.url;
            const go = () => {
              if (!href) return;
              if (p.detail) { window.location.hash = href; window.scrollTo({ top: 0 }); }
              else window.open(href, "_blank", "noreferrer");
            };
            const platforms = platformsOf(p.stack);
            const isLive = LIVE_WEB_PROJECTS.has(p.slug);
            const media = CARD_MEDIA[p.slug];
            return (
            <Reveal key={p.slug} className="h-full" delay={(i % 2) * 120}>
              <TiltCard>
                <article
                  onClick={go}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
                  className="card-elevated group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:-translate-y-1 hover:border-accent/50"
                >
                  {media && (
                    <div className="relative h-44 shrink-0 overflow-hidden border-b border-line bg-void">
                      <img
                        src={media.src}
                        alt={media.alt}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  )}
                  <div className="flex grow flex-col p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-display text-xl font-bold transition group-hover:text-accent">{p.name}</h3>
                    <span className="shrink-0 text-xs text-zinc-500">{p.status}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-accent">{p.tagline}</p>
                  {platforms.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {platforms.map(({ label, icon: Icon }) => (
                        <span
                          key={label}
                          title={label}
                          className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-[10px] font-medium text-zinc-400"
                        >
                          <Icon size={11} />
                          {label}
                        </span>
                      ))}
                      {isLive && (
                        <span
                          title="Playable web build"
                          className="live-badge flex items-center gap-1 rounded-full border border-accent/40 px-2 py-1 text-[10px] font-semibold text-ink"
                        >
                          <Play size={10} fill="currentColor" /> Live
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">{p.description}</p>
                  <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-300">
                    {p.highlights.slice(0, 2).map((h) => (
                      <li key={h} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {p.badges.map((b) => (
                      <span key={b} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-zinc-400">
                        {b}
                      </span>
                    ))}
                  </div>
                  <FieldNotes slug={p.slug} className="mt-3" />
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                    {p.detail && (
                      <span className="flex items-center gap-1 text-sm font-semibold text-accent group-hover:text-accent-dim">
                        View case study →
                      </span>
                    )}
                    {p.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target={l.url.startsWith("#") ? undefined : "_blank"}
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-sm font-semibold text-zinc-400 transition hover:text-accent"
                      >
                        {l.label} <ArrowUpRight size={14} />
                      </a>
                    ))}
                  </div>
                  </div>
                </article>
              </TiltCard>
            </Reveal>
            );
          })}
        </div>

        <Reveal>
          <h3 className="font-display mb-4 mt-14 text-sm font-semibold uppercase tracking-widest text-accent/60">
            Shared foundation
          </h3>
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{sharedFoundation.blurb}</p>
            <FoundationGraph />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {sharedFoundation.libs.map((lib) => (
                <a
                  key={lib.name}
                  href={lib.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-accent">{lib.name}</span>
                    <ArrowUpRight size={14} className="text-zinc-500 transition group-hover:text-accent" />
                  </div>
                  <p className="mt-2 text-sm leading-snug text-zinc-400">{lib.role}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lib.usedBy.map((app) => (
                      <span key={app} className="rounded-full border border-accent/25 bg-accent/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent/80">
                        {app}
                      </span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <h3 className="font-display mb-4 mt-14 text-sm font-semibold uppercase tracking-widest text-accent/60">
            Open-source contributions
          </h3>
          <ul className="space-y-2">
            {openSource.map((c) => (
              <li key={c.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-zinc-200 transition hover:text-accent">
                  {c.title}
                </a>
                <span className="text-xs text-zinc-500">{c.repo}</span>
                <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent/80">{c.status}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <h3 className="font-display mb-4 mt-14 text-sm font-semibold uppercase tracking-widest text-accent/60">
            Recently shipped
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentGrowth.slice(-4).reverse().map((g) => (
              <div key={g.title} className="rounded-xl border border-line bg-card p-4">
                <p className="text-xs text-zinc-500">{g.date}</p>
                <p className="mt-1 font-semibold text-zinc-100">{g.title}</p>
                <p className="mt-1 text-sm leading-snug text-zinc-400">{g.detail}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The vertical spine's accent fill tracks scroll progress through the
 * timeline — a lightweight rAF-to-DOM readout, same pattern as ScrollBot.
 */
function TimelineSpine({ trackRef }: { trackRef: React.RefObject<HTMLDivElement | null> }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const fill = fillRef.current;
    if (!track || !fill) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fill.style.height = "100%";
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = track.getBoundingClientRect();
      const progressed = Math.min(Math.max(window.innerHeight * 0.7 - rect.top, 0), rect.height);
      fill.style.height = `${((progressed / rect.height) * 100).toFixed(1)}%`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [trackRef]);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 top-3 w-px" aria-hidden>
      <div className="timeline-spine absolute inset-0" />
      <div ref={fillRef} className="timeline-fill absolute left-0 top-0 w-px" style={{ height: 0 }} />
    </div>
  );
}

function ExperienceSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  return (
    <section id="experience" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// background</p>
          <h2 className="font-display mb-10 text-h2 font-bold tracking-tight">Experience</h2>
        </Reveal>
        <div ref={trackRef} className="relative space-y-10 pl-8 sm:pl-10">
          <TimelineSpine trackRef={trackRef} />
          {experience.map((job) => (
            <Reveal key={job.company}>
              <div className="relative">
                <span className="timeline-dot absolute -left-8 top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-ink sm:-left-10" />
                <div className="card-elevated rounded-2xl border border-line bg-card p-5 transition hover:border-accent/40 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-display text-xl font-bold">
                      {job.role} <span className="text-accent">@ {job.company}</span>
                    </h3>
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-zinc-400">{job.period}</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                    {job.points.slice(0, 4).map((p) => (
                      <li key={p.text} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                        <span>
                          {p.label && <strong className="text-zinc-100">{p.label}: </strong>}
                          {p.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {job.company.toLowerCase().includes("dice") && (
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">receipts</span>
                      {["50% → 95% GPS", "-80% crashes", "92% Compose"].map((r) => (
                        <a
                          key={r}
                          href="#work"
                          className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-0.5 text-[11px] text-accent/90 transition hover:border-accent hover:text-accent"
                        >
                          {r}
                        </a>
                      ))}
                    </div>
                  )}
                  {job.points.length > 4 && (
                    <details className="expander mt-3">
                      <summary className="cursor-pointer select-none text-sm font-semibold text-accent/80 transition hover:text-accent">
                        + {job.points.length - 4} more
                      </summary>
                      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
                        {job.points.slice(4).map((p) => (
                          <li key={p.text} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                            <span>
                              {p.label && <strong className="text-zinc-100">{p.label}: </strong>}
                              {p.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal>
            <div className="relative">
              <span className="timeline-dot absolute -left-8 top-1.5 h-3 w-3 rounded-full border-2 border-accent2 bg-ink sm:-left-10" />
              <div className="card-elevated rounded-2xl border border-line bg-card p-5 transition hover:border-accent2/40 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-display text-xl font-bold">
                    {education.degree} <span className="text-accent2">@ {education.school}</span>
                  </h3>
                  <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-zinc-400">{education.period}</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Each skill group points at the work that proves it — synergy, not a tag soup.
const PROVEN_IN: Record<string, { label: string; href: string }[]> = {
  "UI & Architecture": [
    { label: "92% Compose migration", href: "#work" },
    { label: "Mileway · 35 modules", href: "#project/mileway" },
  ],
  "Concurrency & Data": [
    { label: "-80% crashes", href: "#work" },
    { label: "The Coroutine Court", href: "#loopdown" },
  ],
  "Platform & Systems": [
    { label: "Mileway · 5 platforms", href: "#project/mileway" },
    { label: "Shared foundation", href: "#projects" },
  ],
  "Security & Ops": [
    { label: "PaymentsLab", href: "#project/paymentslab" },
    { label: "White-label · 80% faster", href: "#work" },
  ],
};

function Skills() {
  const [active, setActive] = useState<string | null>(null);
  const chips = useMemo(() => skills.flatMap((s) => s.items.map((item) => ({ item, group: s.group }))), []);
  const toggle = (group: string) => setActive((v) => (v === group ? null : group));

  return (
    <section id="skills" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// tech stack</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Skills</h2>
        <p className="mb-8 text-zinc-400">Filter by area, spin the orbit, or just hover the cloud.</p>
      </Reveal>

      <SkillsOrbit active={active} onSelect={toggle} />

      <Reveal>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <button
              key={s.group}
              type="button"
              aria-pressed={active === s.group}
              onClick={() => toggle(s.group)}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                active === s.group
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
              }`}
            >
              {SKILL_ICONS[s.group] && <span aria-hidden>{SKILL_ICONS[s.group]}</span>}
              {s.group}
            </button>
          ))}
        </div>
      </Reveal>

      {active && PROVEN_IN[active] && (
        <div className="fade-in mt-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">proven in</span>
          {PROVEN_IN[active].map((p) => (
            <a
              key={p.label}
              href={p.href}
              onClick={() => { if (!document.getElementById(p.href.slice(1))) window.scrollTo({ top: 0 }); }}
              className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-accent/90 transition hover:border-accent hover:text-accent"
            >
              {p.label} →
            </a>
          ))}
        </div>
      )}

      <Reveal delay={100}>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {chips.map(({ item, group }) => {
            const dimmed = active !== null && active !== group;
            const highlighted = active === group;
            return (
              <span
                key={item}
                className={`tag-chip rounded-full border px-3.5 py-1.5 text-sm ${
                  highlighted
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-line bg-card text-zinc-300 hover:border-accent/40 hover:text-zinc-100"
                }`}
                style={{ opacity: dimmed ? 0.32 : 1 }}
              >
                {item}
              </span>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function CopyEmail() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(profile.email);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // clipboard unavailable — the mailto button next door still works
        }
      }}
      className="flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
      aria-live="polite"
    >
      {copied ? "✓ copied" : "copy email"}
    </button>
  );
}

function Contact() {
  return (
    <section id="contact" className="relative overflow-hidden border-t border-line">
      <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
      <div className="section-y relative mx-auto max-w-5xl px-6 text-center">
        <span className="mx-auto flex w-fit items-center gap-2 rounded-full border border-line bg-card/80 px-4 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur">
          <span className="status-pulse h-2 w-2 rounded-full bg-accent" />
          {profile.availability}
        </span>
        <h2 className="font-display mt-6 text-h2 font-bold tracking-tight">Hiring for a senior Android role?</h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          Ask my AI assistant anything about my work, or reach out directly — I reply fast.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`mailto:${profile.email}`}
            className="card-elevated flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 font-semibold text-ink transition hover:bg-accent-dim"
          >
            <Mail size={16} /> {profile.email}
          </a>
          <CopyEmail />
          <a
            href="#resume"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            <FileText size={16} /> Résumé / PDF
          </a>
          <a
            href={profile.github}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            <Github size={16} /> GitHub
          </a>
          <a
            href={profile.linkedin}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            <Linkedin size={16} /> LinkedIn
          </a>
          <a
            href="#loopdown"
            onClick={() => window.scrollTo({ top: 0 })}
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent2 hover:text-accent2"
          >
            ✎ My writing
          </a>
        </div>
      </div>
      <SiteFooter />
    </section>
  );
}

export default function App() {
  const hash = useHashRoute();

  useEffect(() => {
    // The portfolio is dark; the résumé prints on white.
    document.documentElement.classList.toggle("resume-mode", hash === "#resume");
  }, [hash]);

  if (hash === "#resume") return <ResumeView />;

  if (hash === "#blueprint") {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center font-mono text-sm text-zinc-500">
            drafting the blueprint room…
          </div>
        }
      >
        <BlueprintRoom />
        <FloatingChat />
      </Suspense>
    );
  }

  // Full Loopdown hub moved to #loopdown; #writing is now an in-flow home
  // section, so old /#writing links land on it naturally.
  if (hash === "#loopdown") {
    return (
      <div className="min-h-screen">
        <AmbientBackground />
        <CursorAura />
        <WritingView />
        <FloatingChat />
      </div>
    );
  }

  if (hash.startsWith("#project/")) {
    return (
      <div className="min-h-screen">
        <CursorAura />
        <ProjectDetail slug={hash.slice("#project/".length)} />
        <FloatingChat />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AmbientBackground />
      <CursorAura />
      <Nav />
      <main>
        <Hero />
        <Metrics />
        <CaseStudies />
        <LabBench />
        <Projects />
        <ExperienceSection />
        <Circuit />
        <Skills />
        <WritingSection />
        <Circuit />
        <StoryMap />
        <Contact />
      </main>
      <ScrollBot />
      <FloatingChat />
    </div>
  );
}
