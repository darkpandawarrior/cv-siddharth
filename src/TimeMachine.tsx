import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, History } from "lucide-react";
import { useSectionNav } from "./lib/navigation.ts";
import { LauncherButton } from "./Launcher.tsx";
import { SiteFooter } from "./SiteFooter.tsx";
import { historyMonths, historyGeneratedAt, totalCommits } from "./data/history.ts";

/**
 * /time-machine — this repo's own commit history, navigable by month.
 *
 * docs/SIDOS-VISION.md's "wild idea" was a git-history time machine; nothing
 * matching it existed anywhere in the codebase. Scoped against the existing
 * repoStats/ops generators rather than a live git shell-out: `git log` runs
 * once, in scripts/gen-history.mjs, at generation time; this component only
 * ever reads the committed src/data/history.ts. A deployed static site has no
 * git binary to shell out to in the first place.
 */

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function TimeMachine() {
  const { goToSection } = useSectionNav();
  const [i, setI] = useState(historyMonths.length - 1);
  const month = historyMonths[i];
  const maxCommits = Math.max(...historyMonths.map((m) => m.commits), 1);

  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <LauncherButton />
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="label-wide">Portfolio</span>
            </button>
          </div>
          <span className="kicker flex min-w-0 items-center gap-2">
            <History size={13} className="shrink-0 text-accent" />
            <span className="truncate">The Time Machine</span>
          </span>
          <div className="w-[86px] sm:w-[110px]" aria-hidden="true" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="section-y mx-auto w-full max-w-5xl flex-1 px-6">
        <p className="section-eyebrow mb-2">// git history</p>
        <h1 className="font-display text-hero font-bold tracking-tight">This repo, one month at a time</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-zinc-400">
          {totalCommits.toLocaleString("en-US")} commits since this repo started, walked back month by
          month. Pick one below to see what actually shipped that month, not a changelog written after
          the fact.
        </p>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
          Read from a static snapshot of `git log`, taken {new Date(historyGeneratedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}.
          Nothing here shells out to git at request time; a deployed static site has no git binary to call.
        </p>

        <div className="mt-10 flex items-end gap-1 overflow-x-auto pb-2" tabIndex={0} role="group" aria-label="Pick a month, scrollable horizontally once the history grows past one screen">
          {historyMonths.map((m, idx) => (
            <button
              key={m.ym}
              type="button"
              onClick={() => setI(idx)}
              title={`${monthLabel(m.ym)}: ${m.commits} commits`}
              className="flex w-8 shrink-0 flex-col items-center gap-1 rounded-t transition"
            >
              <span
                className="w-full rounded-t"
                style={{
                  height: `${Math.max((m.commits / maxCommits) * 96, 4)}px`,
                  background: idx === i ? "var(--color-accent)" : "var(--color-line)",
                }}
              />
              <span className={`font-mono text-[9px] ${idx === i ? "text-accent" : "text-muted"}`}>
                {m.ym.slice(2)}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-accent disabled:opacity-30"
          >
            <ChevronLeft size={14} /> earlier
          </button>
          <h2 className="font-display text-h2 font-bold tracking-tight">{monthLabel(month.ym)}</h2>
          <button
            type="button"
            onClick={() => setI((n) => Math.min(historyMonths.length - 1, n + 1))}
            disabled={i === historyMonths.length - 1}
            className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-accent disabled:opacity-30"
          >
            later <ChevronRight size={14} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="card-elevated rounded-2xl border border-line bg-surface p-4">
            <p className="font-mono text-[10px] text-muted">commits this month</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight">{month.commits}</p>
          </div>
          <div className="card-elevated rounded-2xl border border-line bg-surface p-4">
            <p className="font-mono text-[10px] text-muted">lines changed</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight">
              <span style={{ color: "var(--color-signal)" }}>+{month.insertions.toLocaleString("en-US")}</span>{" "}
              <span style={{ color: "var(--color-danger)" }}>-{month.deletions.toLocaleString("en-US")}</span>
            </p>
          </div>
          <div className="card-elevated rounded-2xl border border-line bg-surface p-4">
            <p className="font-mono text-[10px] text-muted">total commits through this month</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight">{month.cumulative.commits.toLocaleString("en-US")}</p>
          </div>
        </div>

        {month.subjects.length > 0 && (
          <div className="mt-8">
            <p className="kicker mb-3">what shipped</p>
            <ul className="flex flex-col gap-2">
              {month.subjects.map((s) => (
                <li key={s} className="rounded-lg border border-line bg-card/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-300">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
