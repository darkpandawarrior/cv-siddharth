import { ArrowUpRight, CalendarDays, Clock, Swords } from "lucide-react";
import { chess } from "./data/chess.ts";
import { ChessArc } from "./ChessArc.tsx";
import { Reveal } from "./Reveal.tsx";
import { TiltCard } from "./TiltCard.tsx";

/**
 * Chess, folded into the home-page scroll flow after Writing.
 *
 * Thesis-led by a locked owner decision: the section opens on the measured
 * finding (games are decided by the clock, not the board) rather than on
 * ratings, because the finding is the part that says something about how he
 * works.
 *
 * **Every figure here renders from `chess.*`.** `src/data/chess.ts` is
 * generated from both platforms' public APIs and the owner is still playing —
 * the corpus grew by three games within an hour of first generation — so any
 * literal in this JSX is a number that silently goes stale on a hiring surface.
 * That includes percentages, counts, day spans, ratings and sample sizes. The
 * generator IS the claim audit for this section; typing a figure by hand breaks
 * that property.
 *
 * Three honesty constraints are load-bearing in the copy below, not polish:
 *  - `totals.hours` is lichess `playTime` only. chess.com publishes no
 *    equivalent, so it is labelled per-platform and never as a combined total.
 *  - The two platforms are a **handoff**, not parallel accounts. lichess's
 *    rating history runs into 2025 only because of a handful of games that
 *    January; the per-year game counts are what establish when he was actually
 *    playing, and they are rendered so a reader can check.
 *  - The repertoire arc is confounded with that handoff: the abandonment is a
 *    lichess-only observation and the re-adoption a chess.com-only one. They are
 *    presented as two observations, never as one continuous line.
 */

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
// Explicit locale, not the ambient one: the home route is server-rendered, so a
// visitor whose browser locale groups with "." would hydrate 18.734 over an
// 18,734 the server wrote and React would blow the tree away.
const num = (x: number) => x.toLocaleString("en-US");
// `chess.ts` is `as const`, so every count is a literal type and comparing one
// to 1 inline is a tsc error. Taking `number` widens it once, here.
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;

const SCANDINAVIAN = /scandinavian/i;

// The bucket width is a function of how many buckets the generator emitted, so
// the axis labels can't drift if the derivation ever changes its resolution.
const DECILE_STEP = 100 / chess.thesis.deciles.length;
const MAX_GAP = Math.max(...chess.thesis.deciles.map((d) => d.gap));

/**
 * Per-year repertoire rows, joined to that year's per-platform game counts so
 * the platform handoff is visible next to the opening change it confounds.
 * `scandinavian` sums only the openings that made the year's top five, so a
 * zero means "fell out of the top five", not "played zero times" — the table
 * renders it as an em dash and says so.
 */
const repertoire = chess.repertoire.map((r) => ({
  year: r.year,
  top: r.openings[0],
  scandinavian: r.openings.filter((o) => SCANDINAVIAN.test(o.name)).reduce((s, o) => s + o.share, 0),
  activity: chess.activityByYear.find((a) => a.year === r.year),
}));

// The handoff: the first year chess.com carried more games than lichess.
const handoff = chess.activityByYear.find((a) => a.chesscom > a.lichess);
const displaced = repertoire.find((r) => !SCANDINAVIAN.test(r.top.name));
const lastOnLichess = repertoire.filter((r) => !handoff || r.year < handoff.year).at(-1);
const latest = repertoire.at(-1);
// lichess's rating history runs years past the handoff purely because of a
// handful of games in its final year. Rendered so nobody reads the arc's right
// edge as an active account: game counts say when someone was playing, rating
// dates don't.
const lichessLastFlicker = [...chess.activityByYear].reverse().find((a) => a.lichess > 0);

export function ChessSection() {
  const { thesis, totals, discipline, span } = chess;
  const daysPlayed = discipline.spanDays ? discipline.distinctDays / discipline.spanDays : 0;

  return (
    <section id="chess" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the board</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Chess</h2>
          <p className="mb-10 max-w-2xl text-zinc-400">
            {num(totals.games)} rated and casual games across two platforms, pulled from both public
            APIs at build time and analysed before anything on this page was written. The finding was
            not flattering: <strong className="font-semibold text-zinc-200">{pct(thesis.decidedOnClock)} of
            my decided games ended on a clock, not on a board</strong> — {pct(thesis.lossesOnTime)} of
            every loss was a timeout, against {pct(thesis.winsOnTime)} of wins won on the opponent's.
            I don't lose positions nearly as often as I lose time.
          </p>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* the thesis, as the divergence curve */}
          <Reveal className="h-full">
            <TiltCard>
              <article className="card-elevated flex h-full flex-col rounded-2xl border border-line bg-card p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-accent">
                    <Clock size={13} /> Clock remaining, by game progress
                  </span>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    THE THESIS
                  </span>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left font-mono text-[11.5px] tabular-nums">
                    <caption className="mb-3 caption-bottom text-left text-xs leading-relaxed text-muted">
                      Mean fraction of the starting clock still on my clock, from{" "}
                      {num(thesis.sampleSize)} blitz games carrying per-move clock annotations. The
                      gap opens in the early middlegame and never closes: losses are decided by time
                      spent long before any late blunder.
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
                        <th scope="col" className="py-1.5 pr-3 font-semibold">Progress</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Wins</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Losses</th>
                        <th scope="col" className="py-1.5 text-right font-semibold">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thesis.deciles.map((d) => (
                        <tr key={d.bucket} className="border-b border-line/60 last:border-0">
                          <th scope="row" className="py-1.5 pr-3 font-normal text-zinc-400">
                            {d.bucket * DECILE_STEP}–{(d.bucket + 1) * DECILE_STEP}%
                          </th>
                          <td className="py-1.5 pr-3 text-right text-zinc-200">{pct(d.win)}</td>
                          <td className="py-1.5 pr-3 text-right text-zinc-200">{pct(d.loss)}</td>
                          <td className="py-1.5 text-right">
                            <span className="flex items-center justify-end gap-2">
                              <span aria-hidden className="hidden h-1.5 rounded-full bg-accent/60 sm:block" style={{ width: `${(d.gap / MAX_GAP) * 44}px` }} />
                              <span className="text-accent">+{pct(d.gap)}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </TiltCard>
          </Reveal>

          {/* scale and discipline */}
          <Reveal delay={120} className="h-full">
            <div className="flex h-full flex-col gap-3">
              <div className="card-elevated rounded-xl border border-line bg-card p-4">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  <Swords size={12} /> Corpus
                </p>
                <p className="font-display mt-1 text-2xl font-bold tabular-nums text-accent">{num(totals.games)}</p>
                <p className="mt-1 text-xs leading-snug text-zinc-400">
                  games, {span.from} → {span.to}. {num(totals.wins)}W / {num(totals.losses)}L /{" "}
                  {num(totals.draws)}D — a losing record by {num(totals.losses - totals.wins)}.
                </p>
              </div>

              <div className="card-elevated rounded-xl border border-line bg-card p-4">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  <Clock size={12} /> Time at the board
                </p>
                <p className="font-display mt-1 text-2xl font-bold tabular-nums text-accent2">{num(totals.hours)} h</p>
                <p className="mt-1 text-xs leading-snug text-zinc-400">
                  lichess play time only ({num(chess.platforms[0].games)} games) — chess.com publishes
                  no equivalent figure, so this is one platform's total, not both.
                </p>
              </div>

              <div className="card-elevated rounded-xl border border-line bg-card p-4">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  <CalendarDays size={12} /> Showing up
                </p>
                <p className="font-display mt-1 text-2xl font-bold tabular-nums text-accent">{pct(daysPlayed)}</p>
                <p className="mt-1 text-xs leading-snug text-zinc-400">
                  of days played — {num(discipline.distinctDays)} of {num(discipline.spanDays)} days in
                  the span, longest unbroken run {num(discipline.longestDayStreak)} days. Longest loss
                  streak {discipline.longestLoss} beats the longest win streak {discipline.longestWin}.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* the arc — one band per platform, each on its own scale */}
        <Reveal delay={80}>
          <div className="card-elevated mt-8 rounded-2xl border border-line bg-card p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent2">
              Rating arc · {new Date(span.from).getUTCFullYear()}–{new Date(span.to).getUTCFullYear()}
            </p>
            <div className="mt-4">
              <ChessArc />
            </div>
          </div>
        </Reveal>

        {/* repertoire as Black, joined to the platform handoff it is confounded with */}
        <Reveal delay={100}>
          <div className="card-elevated mt-6 rounded-2xl border border-line bg-card p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent">Repertoire as Black</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              {repertoire[0] && (
                <>
                  I opened {repertoire[0].year} with the Scandinavian — at least{" "}
                  {pct(repertoire[0].scandinavian)} of my games as Black that year.{" "}
                </>
              )}
              {displaced && (
                <>
                  By {displaced.year} it was displaced by the {displaced.top.name} ({pct(displaced.top.share)}),
                  {lastOnLichess && lastOnLichess.scandinavian === 0
                    ? ` and by ${lastOnLichess.year} it had dropped out of the top five entirely.`
                    : "."}{" "}
                </>
              )}
              {latest && SCANDINAVIAN.test(latest.top.name) && (
                <>
                  It is my most-played reply again today: {pct(latest.scandinavian)} of Black games in{" "}
                  {latest.year}.
                </>
              )}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Both halves are real, but they are two <em>within-platform</em> observations rather than
              one continuous line. The abandonment happened on lichess and the return happened on
              chess.com
              {handoff && <>, with the {handoff.year} handoff sitting between them</>} — so &ldquo;I came
              back to my first opening&rdquo; cannot be cleanly separated from &ldquo;I started fresh on
              a new site.&rdquo; It is a handoff, not two accounts running side by side
              {lichessLastFlicker && (
                <>
                  : lichess&rsquo;s last flicker is {plural(lichessLastFlicker.lichess, "game")} in{" "}
                  {lichessLastFlicker.year}, which is the only reason its rating history reaches that far
                </>
              )}
              . Game counts say when someone was actually playing; rating-history dates do not.
            </p>

            <div className="mt-5 overflow-x-auto">
              {/* min-w so the wrapper's overflow-x-auto actually scrolls on a
                  phone instead of crushing five columns of opening names into
                  four-line wraps and clipping the last one. */}
              <table className="w-full min-w-[38rem] border-collapse text-left text-[12.5px] tabular-nums">
                <caption className="mb-3 caption-bottom text-left text-xs leading-relaxed text-muted">
                  The Scandinavian column sums only the Scandinavian lines that made that year&rsquo;s
                  top five replies, so it is a floor rather than an exact share; an em dash means none
                  of them did, not that it was never played.
                </caption>
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Year</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-semibold">lichess</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-semibold">chess.com</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Most-played reply</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Scandinavian (top 5)</th>
                  </tr>
                </thead>
                <tbody>
                  {repertoire.map((r) => (
                    <tr key={r.year} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="py-1.5 pr-3 font-mono text-xs font-normal text-zinc-300">
                        {r.year}
                        {handoff?.year === r.year && (
                          <span className="ml-2 rounded-full border border-accent2/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent2">
                            handoff
                          </span>
                        )}
                      </th>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs text-zinc-400">
                        {r.activity ? num(r.activity.lichess) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs text-zinc-400">
                        {r.activity ? num(r.activity.chesscom) : "—"}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-zinc-200">
                        {r.top.name} <span className="font-mono text-[11px] text-muted">{pct(r.top.share)}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs">
                        {r.scandinavian > 0 ? (
                          <span className="text-accent">{pct(r.scandinavian)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        {/* both profiles */}
        <Reveal delay={120}>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {chess.platforms.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="card-elevated group flex flex-col rounded-2xl border border-line bg-card p-5 transition hover:border-accent/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-zinc-100">{p.id}</span>
                  <ArrowUpRight size={14} className="text-muted transition group-hover:text-accent" />
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted">
                  {num(p.games)} games · joined {p.joined} · last game {p.lastActive}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400">
                  {p.peaks.map((k) => (
                    <li key={k.format}>
                      {k.format} peak <span className="text-zinc-200">{k.rating}</span>
                      {k.at && <span className="text-muted"> · {k.at}</span>}
                    </li>
                  ))}
                  {p.puzzles && (
                    <li>
                      puzzles peak <span className="text-zinc-200">{p.puzzles.peak}</span>
                      <span className="text-muted"> · {num(p.puzzles.solved)} solved</span>
                    </li>
                  )}
                </ul>
                {p.provisional && (
                  <p className="mt-3 text-xs leading-snug text-muted">
                    Every format on this account reads provisional — rating deviation grew while it sat
                    idle after {p.lastActive}, so what it shows is a last rating, not current form.
                  </p>
                )}
              </a>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <p className="mt-6 text-xs text-muted">
            Generated {chess.generatedAt.slice(0, 10)} from the lichess and chess.com public APIs by{" "}
            <span className="font-mono text-zinc-400">scripts/gen-chess-stats.mjs</span> — every number
            on this page is build output, not prose. Re-run it and the figures move.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
