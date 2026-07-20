import { ArrowLeft, ArrowUpRight, Github, PenLine } from "lucide-react";
import { writing } from "./data/writing.ts";
import { Reveal } from "./Reveal.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { openChat } from "./FloatingChat.tsx";
import {
  BOOKS_BEFORE_BROS,
  LOOPDOWN_REPO,
  PLATFORMS,
  SERIES_PROJECT,
  accentOf,
  titleize,
} from "./data/writingMeta.ts";

/**
 * The Loopdown — full writing hub at /#loopdown (teased in the home scroll
 * flow at /#writing). Field notes (dev content) plus the creative archive,
 * pulled from github.com/darkpandawarrior/the-loopdown via
 * scripts/gen-loopdown.mjs so it stays in sync with what's published.
 */

export function WritingView() {
  const { lessons, series, archive } = writing;
  const sorted = [...lessons].sort((a, b) => {
    if ((a.status === "published") !== (b.status === "published")) return a.status === "published" ? -1 : 1;
    return (b.created || "").localeCompare(a.created || "");
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> Back to portfolio
          </a>
          <div className="flex items-center gap-5">
            <a href="#projects" className="nav-link hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              Projects
            </a>
            <a href="#resume" className="nav-link hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              Résumé
            </a>
            <a href={LOOPDOWN_REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-accent">
              <Github size={15} /> the-loopdown
            </a>
            <button
              onClick={openChat}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
            >
              Ask my AI
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* hero */}
        <section className="section-y">
          <span className="flex w-fit items-center gap-2 rounded-full border border-line bg-card/80 px-4 py-1.5 text-xs font-medium text-zinc-300">
            <PenLine size={13} className="text-accent" /> The Loopdown
          </span>
          <h1 className="font-display mt-5 text-h2 font-bold tracking-tight">
            Field notes from an engineer who <span className="hero-shimmer">writes.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-zinc-400">
            Short, sharp lessons pulled from real Android and KMP work, each with a recurring cast of
            personified bugs. Plus an archive of everything I wrote before I wrote code. One idea, written
            once, adapted to dev.to, Medium, Hashnode, and LinkedIn.
          </p>
        </section>

        {/* lessons */}
        <section className="pb-16">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">Lessons</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {sorted.map((l, i) => {
              const accent = accentOf(l.series);
              const live = l.status === "published";
              const links = PLATFORMS.filter((p) => l.links?.[p.key]);
              return (
                <Reveal key={l.slug} className="h-full" delay={(i % 2) * 100}>
                <TiltCard>
                <div
                  className="card-elevated flex h-full flex-col rounded-xl border border-line bg-card p-5"
                  style={{ borderLeft: `3px solid ${accent}` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: accent }}>
                      {titleize(l.series) || l.pillar}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${live ? "bg-accent/15 text-accent" : "border border-line text-zinc-500"}`}>
                      {live ? "LIVE" : "SOON"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold leading-snug tracking-tight text-zinc-100">
                    {l.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(l.tags || []).slice(0, 3).map((t) => (
                      <span key={t} className="rounded border border-line px-2 py-0.5 text-[11px] text-zinc-400">{t}</span>
                    ))}
                  </div>
                  <div className="mt-auto pt-4">
                    {links.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Read on</span>
                        {links.map((p) => (
                          <a
                            key={p.key}
                            href={l.links![p.key]}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-xs font-medium transition hover:underline"
                            style={{ color: accent }}
                          >
                            {p.label} <ArrowUpRight size={12} />
                          </a>
                        ))}
                      </div>
                    )}
                    {l.series && SERIES_PROJECT[l.series] && (
                      <a
                        href={SERIES_PROJECT[l.series].href}
                        className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-accent/50 hover:text-accent"
                      >
                        {SERIES_PROJECT[l.series].label} →
                      </a>
                    )}
                  </div>
                </div>
                </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* series */}
        <section className="border-t border-line pb-16 pt-12">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">Series</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {series.map((s) => (
              <span
                key={s.id}
                className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-zinc-200"
                style={{ borderColor: `${accentOf(s.id)}55` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: accentOf(s.id) }} />
                {s.title}
                <span className="text-xs text-zinc-500">{s.episodes}</span>
              </span>
            ))}
          </div>
        </section>

        {/* archive */}
        <section className="border-t border-line pb-24 pt-12">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
            Archive <span className="text-zinc-600">· earlier writing</span>
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <a
              href={BOOKS_BEFORE_BROS.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-accent2/30 bg-accent2/5 p-4 transition hover:border-accent2/60 sm:col-span-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-zinc-100">
                  <PenLine size={14} className="text-accent2" /> {BOOKS_BEFORE_BROS.name}
                  <ArrowUpRight size={13} className="text-zinc-500 transition group-hover:text-accent2" />
                </h3>
                <span className="shrink-0 font-mono text-[11px] text-accent2/80">the origin blog</span>
              </div>
              <p className="mt-1.5 text-sm leading-snug text-zinc-400">
                {BOOKS_BEFORE_BROS.blurb} Most of the pieces below were first published there —
                booksbeforebros.wordpress.com.
              </p>
            </a>
            {archive.map((a) => (
              <div key={a.slug} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-zinc-100">{a.title}</h3>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">{a.form}</span>
                </div>
                {a.blurb && <p className="mt-1.5 text-sm leading-snug text-zinc-400">{a.blurb}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
