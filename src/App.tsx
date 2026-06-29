import { useEffect, useRef, useState } from "react";
import { Mail, MapPin, ArrowUpRight, MessageCircle, FileText, Github, Linkedin } from "lucide-react";
import { profile, metrics, experience, education, caseStudies, skills, projects, openSource, recentGrowth } from "./data/profile.ts";
import { FloatingChat, openChat } from "./FloatingChat.tsx";
import { TiltPhone } from "./TiltPhone.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { ScrollBot } from "./ScrollBot.tsx";
import { ResumeView } from "./ResumeView.tsx";

const SKILL_ICONS: Record<string, string> = {
  "UI & Architecture": "🎨",
  "Concurrency & Data": "⚡",
  "Platform & Systems": "🛰️",
  "Security & Ops": "🔐",
};

const NAV_LINKS = [
  { href: "#work", label: "Case studies" },
  { href: "#projects", label: "Projects" },
  { href: "#experience", label: "Experience" },
  { href: "#skills", label: "Skills" },
  { href: "#contact", label: "Contact" },
];

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
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
        <div className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-accent">
              {l.label}
            </a>
          ))}
          <a href="#resume" className="flex items-center gap-1 transition hover:text-accent">
            <FileText size={13} /> Résumé
          </a>
        </div>
        <button
          onClick={openChat}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
        >
          <MessageCircle size={15} /> Ask my AI
        </button>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto grid max-w-5xl items-center gap-10 px-6 pb-20 pt-20 lg:grid-cols-[1fr_280px]">
      <div>
        <p className="rise-in mb-4 flex items-center gap-2 text-sm text-zinc-400">
          <MapPin size={14} className="text-accent" /> {profile.location} · {profile.title}
        </p>
        <h1 className="rise-in rise-in-1 font-display max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
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
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px px-6 py-10 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="px-4 py-3">
            <p className="font-display text-3xl font-bold text-accent sm:text-4xl">{m.value}</p>
            <p className="mt-1 text-sm font-medium text-zinc-200">{m.label}</p>
            <p className="mt-1 text-xs leading-snug text-zinc-500">{m.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CaseStudies() {
  return (
    <section id="work" className="mx-auto max-w-5xl px-6 py-20">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// featured work</p>
        <h2 className="font-display mb-2 text-3xl font-bold tracking-tight">Case studies</h2>
        <p className="mb-10 text-zinc-400">
          The work behind the numbers. Ask the chatbot for more depth on any of these.
        </p>
      </Reveal>
      <div className="grid gap-6 sm:grid-cols-2">
        {caseStudies.map((cs, i) => (
          <Reveal key={cs.slug} className="h-full" delay={(i % 2) * 120}>
            <TiltCard>
            <article className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 transition hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5">
              <span className="font-display select-none text-5xl font-black leading-none text-accent/10">
                {String(i + 1).padStart(2, "0")}
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
      <div className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// projects & open source</p>
          <h2 className="font-display mb-2 text-3xl font-bold tracking-tight">Things I've built</h2>
          <p className="mb-10 text-zinc-400">
            Open-source projects and tooling outside employer work — shipped end-to-end.
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2">
          {projects.map((p, i) => (
            <Reveal key={p.slug} className="h-full" delay={(i % 2) * 120}>
              <TiltCard>
                <article className="group flex h-full flex-col rounded-2xl border border-line bg-card p-6 transition hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-xl font-bold">{p.name}</h3>
                    <span className="shrink-0 text-xs text-zinc-500">{p.status}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-accent">{p.tagline}</p>
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
                  <div className="mt-auto flex flex-wrap gap-3 pt-5">
                    {p.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target={l.url.startsWith("#") ? undefined : "_blank"}
                        rel="noreferrer"
                        className="flex items-center gap-1 text-sm font-semibold text-accent transition hover:text-accent-dim"
                      >
                        {l.label} <ArrowUpRight size={14} />
                      </a>
                    ))}
                  </div>
                </article>
              </TiltCard>
            </Reveal>
          ))}
        </div>

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

function ExperienceSection() {
  return (
    <section id="experience" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// background</p>
          <h2 className="font-display mb-10 text-3xl font-bold tracking-tight">Experience</h2>
        </Reveal>
        <div className="space-y-12">
          {experience.map((job) => (
            <Reveal key={job.company}>
              <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:gap-8">
                <div>
                  <p className="text-sm text-zinc-500">{job.period}</p>
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">
                    {job.role} <span className="text-accent">@ {job.company}</span>
                  </h3>
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
            <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:gap-8">
              <p className="text-sm text-zinc-500">{education.period}</p>
              <div>
                <h3 className="font-display text-xl font-bold">
                  {education.degree} <span className="text-accent">@ {education.school}</span>
                </h3>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section id="skills" className="mx-auto max-w-5xl px-6 py-20">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// tech stack</p>
        <h2 className="font-display mb-10 text-3xl font-bold tracking-tight">Skills</h2>
      </Reveal>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {skills.map((s, i) => (
          <Reveal key={s.group} delay={i * 90}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent">
              {SKILL_ICONS[s.group] && <span>{SKILL_ICONS[s.group]}</span>}
              {s.group}
            </h3>
            <ul className="space-y-2 text-sm text-zinc-300">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Hiring for a senior Android role?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          Ask my AI assistant anything about my work, or reach out directly — I reply fast.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`mailto:${profile.email}`}
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 font-semibold text-ink transition hover:bg-accent-dim"
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
      <footer className="border-t border-line py-6 text-center text-xs text-zinc-600">
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

  return (
    <div className="min-h-screen">
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
