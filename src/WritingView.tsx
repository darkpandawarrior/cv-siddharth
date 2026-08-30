import { ArrowLeft, ArrowUpRight, Github, PenLine, Rss } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { writing } from "./data/writing.ts";
import { Reveal } from "./Reveal.tsx";
import { TiltCard } from "./TiltCard.tsx";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import {
  LOOPDOWN_REPO,
  PLATFORMS,
  SERIES_PROJECT,
  accentOf,
  titleize,
} from "./data/writingMeta.ts";

/**
 * The Loopdown — the engineering half of the writing, at /loopdown. Field
 * notes and the cast of personified bugs they star, pulled from
 * github.com/darkpandawarrior/the-loopdown via scripts/gen-loopdown.mjs so it
 * stays in sync with what's published.
 *
 * This used to render the creative archive too, and so did WritingSection on
 * /ink: the same corpus, twice, in two skins. The two halves are split by
 * world now. Engineering artifacts are what someone arriving at a control-room
 * page came for, so the lessons and the cast stay here and the archive lives
 * in the world it was written in. Each page keeps one sentence pointing at the
 * other, which is a cross-link; two full grids was a fork.
 */

// Cast accents cycle through the series palette — the characters roam between series.
const CAST_COLORS = ["#8f74ff", "#4ec9b0", "#f0883e", "#db61ff", "#38bdf8"];

export function WritingView() {
  const { goToSection } = useSectionNav();
  const { lessons, series, cast } = writing;
  const sorted = [...lessons].sort((a, b) => {
    if ((a.status === "published") !== (b.status === "published")) return a.status === "published" ? -1 : 1;
    return (b.created || "").localeCompare(a.created || "");
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
        {/* Wraps. "Back to portfolio" plus the Ask pill is wider than a 320px
            window — a Fold's cover screen — and with html{overflow-x:hidden}
            the page does not scroll, it just loses the right-hand button. */}
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <button type="button" onClick={() => goToSection("top")} className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> Back to portfolio
          </button>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
            <button type="button" onClick={() => goToSection("projects")} className="nav-link hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              Projects
            </button>
            <Link to="/map" className="nav-link hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              Storyboard
            </Link>
            <Link to="/resume" className="nav-link hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              Résumé
            </Link>
            <a href={LOOPDOWN_REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-accent">
              <Github size={15} /> the-loopdown
            </a>
            <a href="/feed.xml" className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-accent" title="Atom feed of the field notes">
              <Rss size={15} /> RSS
            </a>
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
            >
              Ask my AI
            </button>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-6">
        {/* hero */}
        <section className="section-y">
          <span className="flex w-fit items-center gap-2 rounded-full border border-line bg-card/80 px-4 py-1.5 text-xs font-medium text-zinc-300">
            <PenLine size={13} className="text-accent" /> The Loopdown
          </span>
          {/* Deliberately smaller than a landing-page hero, same demotion excelsior
              documents: this is a writing hub, not a doorway page. */}
          <h1 className="font-display mt-5 text-h2 font-bold tracking-tight">
            Field notes from an engineer who <span className="hero-shimmer">writes.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-zinc-400">
            Short, sharp lessons pulled from real Android and KMP work, each with a recurring cast of
            personified bugs. One idea, written once, adapted to dev.to, Medium, Hashnode, and
            LinkedIn.
          </p>
        </section>

        {/* lessons */}
        <section className="border-t border-line section-y">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted">Lessons</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {sorted.map((l, i) => {
              const accent = accentOf(l.series);
              const live = l.status === "published";
              const links = PLATFORMS.filter((p) => l.links?.[p.key]);
              return (
                <Reveal key={l.slug} className="h-full" delay={(i % 2) * 100}>
                <TiltCard>
                <div
                  className="panel-sm card-elevated flex h-full flex-col p-5"
                  style={{ borderLeft: `3px solid ${accent}` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: accent }}>
                      {titleize(l.series) || l.pillar}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${live ? "bg-accent/15 text-accent" : "border border-line text-muted"}`}>
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
                        <span className="kicker">Read on</span>
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
        <section className="border-t border-line section-y">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted">Series</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {series.map((s) => (
              // The landing target for FieldNotes' chips, which carry
              // `hash={`series-${n.id}`}`. Without an id here twelve
              // differently-labelled chips all resolved to the same unfiltered
              // index. scroll-mt-24 keeps the chip clear of the sticky header.
              <span
                key={s.id}
                id={`series-${s.id}`}
                className="flex scroll-mt-24 items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-zinc-200"
                style={{ borderColor: `${accentOf(s.id)}55` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: accentOf(s.id) }} />
                {s.title}
                <span className="text-xs text-muted">{s.episodes}</span>
              </span>
            ))}
          </div>
        </section>

        {/* the recurring cast */}
        {cast.length > 0 && (
          <section className="border-t border-line section-y">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted">
              The cast <span className="text-muted">· the bugs, personified</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400">
              Every lesson stars a recurring character, the bug itself, given a face and a motive.
              Appearances so far:
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {cast.map((c, i) => {
                const color = CAST_COLORS[i % CAST_COLORS.length];
                return (
                  <span
                    key={c.id}
                    className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-zinc-200"
                    style={{ borderColor: `${color}55` }}
                  >
                    <span className="font-display font-bold" style={{ color }}>
                      {titleize(c.id)}
                    </span>
                    <span className="rounded-full border border-line px-1.5 text-[10px] text-muted">
                      ×{c.appearances}
                    </span>
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* The other world, in one sentence. The archive grid that used to sit
            here was the same corpus /ink renders, so a reader who followed
            either page to the end met the same pieces twice and neither page
            was the canonical one. It is a link now, not a fork. */}
        <section className="border-t border-line section-y">
          <p className="max-w-2xl text-zinc-400">
            Everything I wrote before I wrote code, the magazine years, the societies and the archive
            they produced, lives in{" "}
            <Link
              to="/ink"
              className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
            >
              The Ink
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
