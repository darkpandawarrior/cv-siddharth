import { ArrowRight, ArrowUpRight, BookOpen, PenLine } from "lucide-react";
import { writing } from "./data/writing.ts";
import { Reveal } from "./Reveal.tsx";
import { TiltCard } from "./TiltCard.tsx";
import {
  BOOKS_BEFORE_BROS,
  LOOPDOWN_REPO,
  PLATFORMS,
  SERIES_PROJECT,
  accentOf,
  titleize,
} from "./data/writingMeta.ts";

/**
 * Writing, folded into the home-page scroll flow — the Loopdown is no longer
 * a top-bar-only destination. A featured published piece, what's queued next,
 * the series map, and the creative lineage back to Books Before Bros; the
 * full hub lives on at /#loopdown.
 */
export function WritingSection() {
  const { lessons, series, archive } = writing;
  const published = lessons.filter((l) => l.status === "published");
  const featured = published[0] ?? lessons[0];
  const queued = lessons
    .filter((l) => l !== featured)
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .slice(0, 3);
  const featuredLinks = featured ? PLATFORMS.filter((p) => featured.links?.[p.key]) : [];
  const featuredAccent = accentOf(featured?.series);

  return (
    <section id="writing" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the loopdown</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Writing</h2>
          <p className="mb-10 max-w-2xl text-zinc-400">
            Field notes from real Android and KMP work, told through a recurring cast of personified
            bugs — plus the creative archive that came before the code.
          </p>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* featured published piece */}
          {featured && (
            <Reveal className="h-full">
              <TiltCard>
                <article
                  className="card-elevated flex h-full flex-col rounded-2xl border border-line bg-card p-6 sm:p-8"
                  style={{ borderLeft: `3px solid ${featuredAccent}` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: featuredAccent }}>
                      {titleize(featured.series) || featured.pillar}
                    </span>
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      {featured.status === "published" ? "LATEST" : "NEXT UP"}
                    </span>
                  </div>
                  <h3 className="font-display mt-3 text-2xl font-bold leading-snug tracking-tight">
                    {featured.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(featured.tags || []).slice(0, 4).map((t) => (
                      <span key={t} className="rounded border border-line px-2 py-0.5 text-[11px] text-zinc-400">{t}</span>
                    ))}
                  </div>
                  <div className="mt-auto pt-5">
                    {featuredLinks.length > 0 && (
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Read on</span>
                        {featuredLinks.map((p) => (
                          <a
                            key={p.key}
                            href={featured.links![p.key]}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-sm font-medium transition hover:underline"
                            style={{ color: featuredAccent }}
                          >
                            {p.label} <ArrowUpRight size={13} />
                          </a>
                        ))}
                      </div>
                    )}
                    {featured.series && SERIES_PROJECT[featured.series] && (
                      <a
                        href={SERIES_PROJECT[featured.series].href}
                        className="mt-3 inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-accent/50 hover:text-accent"
                      >
                        {SERIES_PROJECT[featured.series].label} →
                      </a>
                    )}
                  </div>
                </article>
              </TiltCard>
            </Reveal>
          )}

          {/* queued lessons */}
          <Reveal delay={120} className="h-full">
            <div className="flex h-full flex-col gap-3">
              {queued.map((l) => {
                const accent = accentOf(l.series);
                return (
                  <div
                    key={l.slug}
                    className="card-elevated rounded-xl border border-line bg-card p-4"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>
                        {titleize(l.series) || l.pillar}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                        SOON
                      </span>
                    </div>
                    <p className="mt-1.5 font-display text-sm font-bold leading-snug text-zinc-100">{l.title}</p>
                  </div>
                );
              })}
              <a
                href="#loopdown"
                className="group mt-auto flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/10"
              >
                <span className="flex items-center gap-2">
                  <PenLine size={15} /> Enter the full Loopdown
                </span>
                <ArrowRight size={15} className="transition group-hover:translate-x-1" />
              </a>
            </div>
          </Reveal>
        </div>

        {/* series ticker */}
        <Reveal>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {series.map((s) => (
              <a
                key={s.id}
                href="#loopdown"
                className="tag-chip flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm text-zinc-300 transition hover:text-zinc-100"
                style={{ borderColor: `${accentOf(s.id)}55` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: accentOf(s.id) }} />
                {s.title}
                <span className="text-xs text-zinc-500">{s.episodes}</span>
              </a>
            ))}
          </div>
        </Reveal>

        {/* lineage: the archive + Books Before Bros */}
        <Reveal delay={100}>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <a
              href="#loopdown"
              className="card-elevated group flex flex-col rounded-2xl border border-line bg-card p-5 transition hover:border-accent/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-zinc-100">
                  <BookOpen size={15} className="text-accent" /> The archive
                </span>
                <ArrowRight size={14} className="text-zinc-500 transition group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <p className="mt-2 text-sm leading-snug text-zinc-400">
                {archive.length} pieces of short fiction, campus lore, satire and essays — everything I
                wrote before I wrote code.
              </p>
            </a>
            <a
              href={BOOKS_BEFORE_BROS.url}
              target="_blank"
              rel="noreferrer"
              className="card-elevated group flex flex-col rounded-2xl border border-line bg-card p-5 transition hover:border-accent2/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-zinc-100">
                  <PenLine size={15} className="text-accent2" /> {BOOKS_BEFORE_BROS.name}
                </span>
                <ArrowUpRight size={14} className="text-zinc-500 transition group-hover:text-accent2" />
              </div>
              <p className="mt-2 text-sm leading-snug text-zinc-400">{BOOKS_BEFORE_BROS.blurb}</p>
            </a>
          </div>
        </Reveal>

        <Reveal delay={140}>
          <p className="mt-6 text-xs text-zinc-500">
            Synced from{" "}
            <a href={LOOPDOWN_REPO} target="_blank" rel="noreferrer" className="text-zinc-400 underline decoration-line underline-offset-2 transition hover:text-accent">
              github.com/darkpandawarrior/the-loopdown
            </a>{" "}
            — one idea, written once, adapted to dev.to, Medium, Hashnode and LinkedIn.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
