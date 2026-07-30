import { useEffect, useMemo, useRef, useState } from "react";
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
  LayoutGrid,
  Target,
} from "lucide-react";
import { profile, metrics, experience, education, caseStudies, skills, projects, recentGrowth, sharedFoundation, cardMedia, siteRooms } from "./data/profile.ts";
import { countWord } from "./data/labs.ts";
import { projectStats } from "./data/projectStats.ts";
import { ReposShowcase } from "./ReposShowcase.tsx";
import { FloatingChat, openChat } from "./FloatingChat.tsx";
import { FitCheck } from "./FitCheck.tsx";
import { AmbientBackground } from "./AmbientBackground.tsx";
import { ParticleHero } from "./ParticleHero.tsx";
import { Phone3D } from "./Phone3D.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { AnimatedMetric } from "./AnimatedMetric.tsx";
import { ScrollBot } from "./ScrollBot.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { FoundationGraph } from "./FoundationGraph.tsx";
import { Reveal } from "./Reveal.tsx";
import { WritingSection } from "./WritingSection.tsx";
import { Picture } from "./Picture.tsx";
import { ROOMS } from "./rooms.tsx";
import { FieldNotes } from "./FieldNotes.tsx";
import { CursorAura } from "./CursorAura.tsx";
import { SiteFooter } from "./SiteFooter.tsx";
import { SkillsOrbit } from "./SkillsOrbit.tsx";
import { openLab, type LabKey } from "./LabBench.tsx";
import { writing } from "./data/writing.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSectionNav, classifyHash } from "./lib/navigation.ts";

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
const LIVE_WEB_PROJECTS = new Set(["kursi", "mileway", "paymentslab"]);

// Real repo stats surfaced on the card, drawn from projectStats.ts (generated
// from each repo). Only the apps with generated stats get a strip.
function repoStatLine(slug: string): string | null {
  const s = projectStats[slug as keyof typeof projectStats];
  if (!s) return null;
  if (slug === "mileway" && "features" in s) return `${s.modules} modules · ${s.features} features · ${s.screenshots} tests`;
  if (slug === "paymentslab" && "gatewaysNative" in s) {
    const gateways = s.gatewaysNative + s.gatewaysHosted + s.gatewaysMobileMoney + s.gatewaysStub;
    return `${s.modules + s.composedModules} modules · ${gateways} gateways`;
  }
  if (slug === "kursi") return `${s.modules} modules · 4 platforms`;
  return `${s.modules} modules`;
}

const NAV_LINKS = [
  // First on purpose: recruiters are who this site is for, and the fit
  // analyzer is the one thing here they can't get from a PDF.
  { href: "#fit", label: "Fit check" },
  { href: "#work", label: "Case studies" },
  { href: "#projects", label: "Projects" },
  { href: "#experience", label: "Experience" },
  { href: "#skills", label: "Skills" },
  { href: "#writing", label: "Writing" },
  { href: "#contact", label: "Contact" },
];

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
  { href: "#playground", label: "▶ The Playground" },
  { href: "#loopdown", label: "The Loopdown" },
  { href: "#resume", label: "Résumé" },
];

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { goToSection } = useSectionNav();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const go = (href: string) => {
    setOpen(false);
    const c = classifyHash(href);
    if (c.kind === "section") { goToSection(c.id); return; }
    navigate(c.kind === "project" ? { to: "/project/$slug", params: { slug: c.slug } } : { to: c.to });
  };
  // Esc closes the drawer and hands focus back to the toggle — same
  // escapable-and-don't-strand-focus contract as the lightbox/command palette.
  const closeMenu = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full border border-line"
      >
        <span className="h-px w-4 bg-zinc-300" />
        <span className="h-px w-4 bg-zinc-300" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-ink/85 backdrop-blur-md" onClick={closeMenu} role="presentation">
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
              <button onClick={closeMenu} aria-label="Close menu" className="rounded-full border border-line px-2.5 py-1 text-xs text-zinc-400">
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
  const { goToSection } = useSectionNav();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur print:hidden">
      {/* max-w-6xl, not the page's max-w-5xl: at 5xl the link row was already
          exactly at capacity (976px of space for 976px of links), so adding
          "Fit check" squeezed two labels onto two lines. A nav bar sitting a
          little wider than the prose column is the cheaper fix — nothing else
          on the page moves, and no existing link had to shrink or leave. */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => goToSection("top")}
          className="font-display text-lg font-bold tracking-tight"
          style={{ viewTransitionName: "nav-wordmark" }}
        >
          sid<span className="text-accent">.</span><span className="text-zinc-400">android</span>
        </button>
        {/* gap-3 at lg (where the bar is only ~1009px wide and every label has
            to stay on one line), back to gap-6 once max-w-6xl actually fits. */}
        <div className="hidden items-center gap-3 text-sm text-zinc-400 lg:flex xl:gap-6">
          {NAV_LINKS.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => goToSection(l.href.slice(1))}
              aria-current={active === l.href.slice(1) ? "true" : undefined}
              className={`nav-link transition hover:text-accent ${active === l.href.slice(1) ? "nav-link-active text-accent" : ""}`}
            >
              {l.label}
            </button>
          ))}
          <Link to="/playground" className="flex items-center gap-1 transition hover:text-accent">
            <LayoutGrid size={13} /> Playground
          </Link>
          <Link to="/resume" className="flex items-center gap-1 transition hover:text-accent">
            <FileText size={13} /> Résumé
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <MobileMenu />
          <CommandPalette />
          <button
            onClick={() => openChat()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim"
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
  const { goToSection } = useSectionNav();
  return (
    <section id="top" className="section-y relative mx-auto grid max-w-5xl items-center gap-10 px-6 lg:grid-cols-[1fr_280px]">
      <ParticleHero />
      <div>
        <p className="hero-eyebrow rise-in mb-4 flex items-center gap-2 text-sm text-zinc-400">
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
          {/* The recruiter CTA. Accent2, not accent — it reads as a second
              distinct offer rather than competing with the chat button. */}
          <button
            type="button"
            onClick={() => goToSection("fit")}
            className="flex items-center gap-2 rounded-full border border-accent2/40 bg-accent2/5 px-6 py-2.5 font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10"
          >
            <Target size={15} /> Paste a job description
          </button>
          <Link
            to="/resume"
            className="rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            View résumé
          </Link>
          <button
            type="button"
            onClick={() => goToSection("work")}
            className="flex items-center gap-1.5 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-400 transition hover:border-accent/40 hover:text-zinc-200"
          >
            See my work ↓
          </button>
        </div>
        <p className="rise-in rise-in-3 mt-6 text-xs text-muted">{profile.availability}</p>
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
    <p className="rise-in rise-in-2 mt-4 h-5 font-mono text-sm text-accent2">
      {/* aria-label isn't a permitted attribute on a plain <p> (no naming
          role) — a genuine sr-only text node reads the same to AT without
          fighting the ARIA-in-HTML spec. */}
      <span className="sr-only">{IDENTITY_LINES.join(" · ")}</span>
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
  const { goToSection } = useSectionNav();
  const latestShip = recentGrowth[recentGrowth.length - 1];
  const latestPost = writing.lessons.find((l) => l.status === "published" && l.live);
  if (!latestShip && !latestPost) return null;
  return (
    <div className="rise-in rise-in-3 mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" /> live
      </span>
      {latestShip && (
        <button type="button" onClick={() => goToSection("projects")} className="transition hover:text-accent">
          ▲ shipped · {latestShip.title}
        </button>
      )}
      {latestPost && (
        <a href={latestPost.live} target="_blank" rel="noreferrer" className="transition hover:text-accent2">
          ✎ latest note · {latestPost.title}
        </a>
      )}
      <Link
        to="/compose"
        className="transition hover:text-accent"
        title="A live Jetpack Compose editor, built into this page"
      >
        ▶ play · live Compose editor
      </Link>
    </div>
  );
}

// Every headline number links to the section that proves it.
const METRIC_TARGETS = ["#experience", "#work", "#work", "#work"];

function Metrics() {
  const { goToSection } = useSectionNav();
  return (
    <section className="border-y border-line bg-surface">
      <Reveal>
        <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-line px-6 py-4 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:py-10 lg:grid-cols-4">
          {metrics.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onClick={() => goToSection((METRIC_TARGETS[i] ?? "#work").slice(1))}
              title="See the work behind this number"
              className="group block w-full rounded-xl text-left transition hover:bg-card/60"
            >
              <AnimatedMetric metric={m} />
            </button>
          ))}
        </div>
      </Reveal>
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
  const navigate = useNavigate();
  const [featured, ...rest] = caseStudies;
  return (
    <section id="work" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// featured work</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Case studies</h2>
        <p className="mb-10 text-zinc-400">
          The work behind the numbers. Ask the chatbot for more depth on any of these.
        </p>
      </Reveal>

      {featured && (
        <Reveal className="mb-6">
          <TiltCard maxTilt={2.5}>
            <article
              onClick={() => navigate({ to: "/project/$slug", params: { slug: "mileway" } })}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/project/$slug", params: { slug: "mileway" } }); } }}
              className="card-elevated group grid cursor-pointer gap-0 overflow-hidden rounded-2xl border border-line bg-card transition hover:border-accent/50 lg:grid-cols-[1.15fr_1fr]"
            >
              {/* Was multiplatform.gif — 108 frames cycling phone → watch →
                  widgets. Rendered at this card's crop, 3 of 4 sampled frames
                  were a near-black watch face or empty space, so the flagship
                  build's thumbnail was a black rectangle as often as not. A
                  still of the loaded home screen is always the home screen, and
                  Picture gets it through the AVIF pipeline the GIF bypassed. */}
              <div className="relative min-h-[220px] overflow-hidden border-b border-line bg-void lg:border-b-0 lg:border-r">
                <Picture
                  src="/projects/mileway/screenshots/home_screen_loaded.png"
                  alt="Mileway home screen — quick actions and 248 km tracked this month"
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
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent group-hover:text-accent-dim">
                    Full case study →
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openLab("modules"); navigate({ to: "/lab" }); }}
                    className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent transition hover:bg-accent/20"
                  >
                    ▶ Open in Lab Bench
                  </button>
                </div>
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
                      onClick={(e) => { e.stopPropagation(); openLab(LAB_OF[cs.slug]); navigate({ to: "/lab" }); }}
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
  const navigate = useNavigate();
  const { goToSection } = useSectionNav();
  return (
    <section id="projects" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// projects & open source</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Things I've built</h2>
          <p className="mb-10 text-zinc-400">
            Open-source projects and tooling outside employer work — shipped end-to-end.
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2">
          {projects.map((p, i) => {
            const externalHref = p.links[0]?.url;
            const go = () => {
              if (p.detail) { navigate({ to: "/project/$slug", params: { slug: p.slug } }); return; }
              if (externalHref) window.open(externalHref, "_blank", "noreferrer");
            };
            const platforms = platformsOf(p.stack);
            const isLive = LIVE_WEB_PROJECTS.has(p.slug);
            const statLine = repoStatLine(p.slug);
            const media = cardMedia[p.slug];
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
                      {/* object-center, and no focal override: the heroes are
                          authored at this band's own aspect, so there is no
                          "best slice" to choose any more. The scrim stays as a
                          seam softener into the text block below. */}
                      <Picture
                        src={media.src}
                        alt={media.alt}
                        className="absolute inset-0 h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
                      />
                      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/60 via-transparent to-transparent" />
                    </div>
                  )}
                  <div className="flex grow flex-col p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    {/* Shared-element morph: this title lifts into the /project/$slug
                        hero <h1> of the same name. Keyed by slug so each card morphs
                        to its own detail; unique across the grid (only grid cards
                        carry it — the featured Mileway case-study card does not, so
                        `project-title-mileway` is never duplicated on the page). */}
                    <h3
                      className="font-display text-xl font-bold transition group-hover:text-accent"
                      style={{ viewTransitionName: `project-title-${p.slug}` }}
                    >
                      {p.name}
                    </h3>
                    <span className="shrink-0 text-xs text-muted">{p.status}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-accent">{p.tagline}</p>
                  {statLine && (
                    <p className="mt-2 font-mono text-[11px] text-muted">
                      <span className="text-accent2">◇</span> {statLine}
                    </p>
                  )}
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
                    {p.links.map((l) => {
                      const linkClass = "flex items-center gap-1 text-sm font-semibold text-zinc-400 transition hover:text-accent";
                      if (!l.url.startsWith("#")) {
                        return (
                          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={linkClass}>
                            {l.label} <ArrowUpRight size={14} />
                          </a>
                        );
                      }
                      const c = classifyHash(l.url);
                      if (c.kind === "section") {
                        return (
                          <button key={l.url} type="button" onClick={(e) => { e.stopPropagation(); goToSection(c.id); }} className={linkClass}>
                            {l.label} <ArrowUpRight size={14} />
                          </button>
                        );
                      }
                      const to = c.kind === "project" ? "/project/$slug" : c.to;
                      const params = c.kind === "project" ? { slug: c.slug } : undefined;
                      return (
                        <Link key={l.url} to={to} params={params} onClick={(e) => e.stopPropagation()} className={linkClass}>
                          {l.label} <ArrowUpRight size={14} />
                        </Link>
                      );
                    })}
                  </div>
                  </div>
                </article>
              </TiltCard>
            </Reveal>
            );
          })}
        </div>

        <Reveal>
          <h3 className="font-display mb-4 mt-14 text-sm font-semibold uppercase tracking-widest text-accent/70">
            Shared foundation
          </h3>
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{sharedFoundation.blurb}</p>
            <FoundationGraph />
            <p className="mt-4 font-mono text-[11px] text-muted">
              ↓ both libraries are in <button type="button" onClick={() => goToSection("source")} className="text-accent transition hover:text-accent-dim">The Source</button>, one click from the code.
            </p>
          </div>
        </Reveal>

        <ReposShowcase />

        <Reveal>
          <h3 className="font-display mb-4 mt-14 text-sm font-semibold uppercase tracking-widest text-accent/70">
            Recently shipped
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentGrowth.slice(-4).reverse().map((g) => (
              <div key={g.title} className="rounded-xl border border-line bg-card p-4">
                <p className="text-xs text-muted">{g.date}</p>
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
  const { goToSection } = useSectionNav();
  return (
    <section id="experience" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// background</p>
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
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">receipts</span>
                      {["50% → 95% GPS", "-80% crashes", "~87% UI Compose"].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => goToSection("work")}
                          className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-0.5 text-[11px] text-accent/90 transition hover:border-accent hover:text-accent"
                        >
                          {r}
                        </button>
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
    { label: "~87% UI-layer Compose migration", href: "#work" },
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
  const { goToSection } = useSectionNav();

  return (
    <section id="skills" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// tech stack</p>
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
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">proven in</span>
          {PROVEN_IN[active].map((p) => {
            const provenClass = "rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-accent/90 transition hover:border-accent hover:text-accent";
            const c = classifyHash(p.href);
            if (c.kind === "section") {
              return (
                <button key={p.label} type="button" onClick={() => goToSection(c.id)} className={provenClass}>
                  {p.label} →
                </button>
              );
            }
            const to = c.kind === "project" ? "/project/$slug" : c.to;
            const params = c.kind === "project" ? { slug: c.slug } : undefined;
            return (
              <Link key={p.label} to={to} params={params} className={provenClass}>
                {p.label} →
              </Link>
            );
          })}
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
      <Reveal className="section-y relative mx-auto max-w-5xl px-6 text-center">
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
          <Link
            to="/resume"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
          >
            <FileText size={16} /> Résumé / PDF
          </Link>
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
          <Link
            to="/loopdown"
            className="flex items-center gap-2 rounded-full border border-line px-6 py-2.5 font-semibold text-zinc-200 transition hover:border-accent2 hover:text-accent2"
          >
            ✎ My writing
          </Link>
        </div>
      </Reveal>
      <SiteFooter />
    </section>
  );
}

/**
 * A light in-page teaser for the Playground hub — no canvases, so it costs the
 * main scroll nothing. It advertises the interactive rooms and funnels into the
 * full-screen hub (where each room renders one at a time).
 */
function PlaygroundTeaser() {
  return (
    <section id="explore" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the playground</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">This site is a live demo</h2>
          <p className="mb-6 max-w-2xl text-zinc-400">
            Not a PDF with a pulse — a running program. {countWord(siteRooms.length)} interactive rooms, each a small proof of the
            engineering above. They live behind one door now.
          </p>
          <div className="flex flex-wrap gap-2">
            {ROOMS.map(({ to, label, icon: Icon, tint }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm font-semibold text-zinc-300 transition hover:border-accent/50 hover:text-zinc-100"
              >
                <Icon size={13} style={{ color: tint }} />
                {label}
              </Link>
            ))}
          </div>
          <Link
            to="/playground"
            className="btn-primary mt-7 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 font-semibold text-ink transition hover:bg-accent-dim"
          >
            Enter the Playground →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  // Backtick summons the terminal from anywhere — unless you're typing in a
  // field (including the terminal's own input, so ` types normally there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      navigate({ to: "/terminal" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <AmbientBackground />
      <CursorAura />
      <Nav />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Metrics />
        {/* Straight after the numbers: they're what makes a recruiter want to
            check fit, and the scorecard links down into the case studies that
            follow it. Below the hero, so it costs LCP nothing. */}
        <FitCheck />
        <Circuit />
        <CaseStudies />
        <Projects />
        <ExperienceSection />
        <Circuit />
        <Skills />
        <WritingSection />
        <Circuit />
        <PlaygroundTeaser />
        <Contact />
      </main>
      <ScrollBot />
      <FloatingChat />
    </div>
  );
}
