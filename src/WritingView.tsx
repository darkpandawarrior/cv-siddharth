import { ArrowLeft, ArrowUpRight, Github, PenLine } from "lucide-react";
import { writing } from "./data/writing.ts";

/**
 * The Loopdown — writing hub at /#writing. Field notes (dev content) plus the
 * creative archive, pulled from github.com/darkpandawarrior/the-loopdown via
 * scripts/gen-loopdown.mjs so it stays in sync with what's published.
 */
const LOOPDOWN_REPO = "https://github.com/darkpandawarrior/the-loopdown";

// series accent colors mirror the generated post cards
const SERIES_COLOR: Record<string, string> = {
  "sensors-who-lie": "#7c5cff",
  "the-coroutine-court": "#4ec9b0",
  "the-night-shift": "#f0883e",
  "ghosts-in-the-recomposition": "#db61ff",
  "one-brain-two-bodies": "#38bdf8",
};
const accentOf = (id?: string) => (id && SERIES_COLOR[id]) || "#7c5cff";
const titleize = (id?: string) =>
  (id || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

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
          <a href={LOOPDOWN_REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-accent">
            <Github size={15} /> the-loopdown
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* hero */}
        <section className="section-y">
          <span className="flex w-fit items-center gap-2 rounded-full border border-line bg-card/80 px-4 py-1.5 text-xs font-medium text-zinc-300">
            <PenLine size={13} className="text-accent" /> The Loopdown
          </span>
          <h1 className="font-display mt-5 text-h2 font-bold tracking-tight">
            Field notes from an engineer who writes<span className="text-accent">.</span>
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
            {sorted.map((l) => {
              const accent = accentOf(l.series);
              const live = l.status === "published" && l.live;
              const inner = (
                <div
                  className="card-elevated h-full rounded-xl border border-line bg-card p-5 transition hover:border-accent/40"
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
                  {live && (
                    <span className="mt-4 flex items-center gap-1 text-sm font-medium" style={{ color: accent }}>
                      Read on dev.to <ArrowUpRight size={14} />
                    </span>
                  )}
                </div>
              );
              return live ? (
                <a key={l.slug} href={l.live} target="_blank" rel="noreferrer" className="block">{inner}</a>
              ) : (
                <div key={l.slug}>{inner}</div>
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
