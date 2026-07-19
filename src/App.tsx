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
} from "lucide-react";
import { profile, metrics, experience, education, caseStudies, skills, projects, openSource, recentGrowth, sharedFoundation } from "./data/profile.ts";
import { FloatingChat, openChat } from "./FloatingChat.tsx";
import { AmbientBackground } from "./AmbientBackground.tsx";
import { TiltPhone } from "./TiltPhone.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { AnimatedMetric } from "./AnimatedMetric.tsx";
import { ScrollBot } from "./ScrollBot.tsx";
import { ResumeView } from "./ResumeView.tsx";
import { WritingView } from "./WritingView.tsx";
import { ProjectDetail } from "./ProjectDetail.tsx";
import { CommandPalette } from "./CommandPalette.tsx";

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
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** Fades sections in as they scroll into view; `delay` staggers siblings. */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href="#top" className="font-display text-lg font-bold tracking-tight">
          sid<span className="text-accent">.</span><span className="text-zinc-400">android</span>
        </a>
        <div className="hidden items-center gap-6 text-sm text-zinc-400 lg:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-accent">
              {l.label}
            </a>
          ))}
          <a href="#resume" className="flex items-center gap-1 transition hover:text-accent">
            <FileText size={13} /> Résumé
          </a>
        </div>
        <div className="flex items-center gap-2">
          <CommandPalette />
          <button
            onClick={openChat}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
          >
            <MessageCircle size={15} /> <span className="hidden sm:inline">Ask my AI</span>
          </button>
        </div>
      </nav>
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
          I take Android apps from <span className="text-accent">prototype to platform.</span>
        </h1>
        <p className="rise-in rise-in-2 mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300">{profile.intro}</p>
        <div className="rise-in rise-in-3 mt-8 flex flex-wrap gap-3">
          <button
            onClick={openChat}
            className="rounded-full bg-accent px-6 py-2.5 font-semibold text-ink transition hover:bg-accent-dim"
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
      </div>
      <TiltPhone />
    </section>
  );
}

function Metrics() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-line px-6 py-4 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:py-10 lg:grid-cols-4">
        {metrics.map((m) => (
          <AnimatedMetric key={m.label} metric={m} />
        ))}
      </div>
    </section>
  );
}

function CaseStudies() {
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
            <article className="card-elevated grid gap-6 rounded-2xl border border-line bg-card p-6 transition hover:border-accent/50 sm:p-8 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent/70">
                  <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" /> Flagship build
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{featured.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">{featured.problem}</p>
                <ul className="mt-5 space-y-2.5 text-sm leading-relaxed text-zinc-300">
                  {featured.approach.slice(0, 5).map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                      {a}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm font-medium text-zinc-100">{featured.outcome}</p>
              </div>
              <div className="flex flex-col justify-between gap-6 rounded-xl border border-line bg-surface/70 p-5">
                <div>
                  <p className="font-display text-metric font-bold text-accent">{featured.metric}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">at a glance</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {featured.tags.map((t) => (
                    <span key={t} className="rounded-full border border-accent/25 bg-accent/5 px-2.5 py-1 text-xs text-accent/90">
                      {t}
                    </span>
                  ))}
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
                <span className="font-display select-none text-5xl font-black leading-none text-accent/10">
                  {String(i + 2).padStart(2, "0")}
                </span>
                <p className="font-display mt-1 text-sm font-semibold text-accent">{cs.metric}</p>
                <h3 className="font-display mt-1 text-xl font-bold">{cs.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{cs.problem}</p>
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-300">
                  {cs.approach.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                      {a}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-medium text-zinc-200">{cs.outcome}</p>
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
            return (
            <Reveal key={p.slug} className="h-full" delay={(i % 2) * 120}>
              <TiltCard>
                <article
                  onClick={go}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
                  className="card-elevated group flex h-full cursor-pointer flex-col rounded-2xl border border-line bg-card p-6 transition hover:-translate-y-1 hover:border-accent/50"
                >
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
                    {p.highlights.map((h) => (
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
            {recentGrowth.map((g) => (
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
                    {job.points.map((p) => (
                      <li key={p.text} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                        <span>
                          {p.label && <strong className="text-zinc-100">{p.label}: </strong>}
                          {p.text}
                        </span>
                      </li>
                    ))}
                  </ul>
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

function Skills() {
  const [active, setActive] = useState<string | null>(null);
  const chips = useMemo(() => skills.flatMap((s) => s.items.map((item) => ({ item, group: s.group }))), []);

  return (
    <section id="skills" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// tech stack</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Skills</h2>
        <p className="mb-8 text-zinc-400">Filter by area, or just hover the cloud.</p>
      </Reveal>

      <Reveal>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <button
              key={s.group}
              type="button"
              aria-pressed={active === s.group}
              onClick={() => setActive((v) => (v === s.group ? null : s.group))}
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
        </div>
      </div>
      <footer className="relative border-t border-line py-6 text-center text-xs text-zinc-600">
        <p className="flex items-center justify-center gap-1">
          Built with React 19, Tailwind v4 and an LLM-agnostic chat backend
          <ArrowUpRight size={12} /> {new Date().getFullYear()}
        </p>
      </footer>
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

  if (hash === "#writing") {
    return (
      <div className="min-h-screen">
        <AmbientBackground />
        <WritingView />
        <FloatingChat />
      </div>
    );
  }

  if (hash.startsWith("#project/")) {
    return (
      <div className="min-h-screen">
        <ProjectDetail slug={hash.slice("#project/".length)} />
        <FloatingChat />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AmbientBackground />
      <Nav />
      <main>
        <Hero />
        <Metrics />
        <CaseStudies />
        <Projects />
        <ExperienceSection />
        <Skills />
        <Contact />
      </main>
      <ScrollBot />
      <FloatingChat />
    </div>
  );
}
