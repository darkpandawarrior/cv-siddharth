import { PauseCircle, Star, CalendarClock, ArrowUpRight } from "lucide-react";
import { weeb } from "./data/weeb.ts";
import { Reveal } from "./Reveal.tsx";
import { TiltCard } from "./TiltCard.tsx";

/**
 * Weeb Central — a hand-kept anime list, read as evidence rather than displayed
 * as a collection.
 *
 * A watchlist is a list. Nobody needs another one. What makes this corpus worth
 * a room is that its SCHEMA confesses things its rows don't:
 *
 *  1. There is no "Dropped" status. Not one. Forty-six titles sit in "Paused",
 *     and almost none of them are caught up — so "Paused" is what quitting looks
 *     like when the schema gives you no word for it.
 *  2. The bottom of the score scale has never been used. Every score he has ever
 *     given is a 3, 4 or 5 out of 5.
 *  3. The list cannot see the present. Matching every title against AniList finds
 *     rows he marked caught-up where a sequel has since aired.
 *
 * The third one is the reason this page enriches at build time instead of just
 * rendering the export: the gap between "what I logged" and "what has happened"
 * is only visible if something outside the list is asked.
 *
 * **Every figure renders from `weeb.*`** — same rule as ChessFindings. The
 * corpus changes whenever he re-exports, so a literal in this JSX is a number
 * that silently goes stale. The generator is the claim audit.
 */

const num = (x: number) => x.toLocaleString("en-US");
const pct = (x: number) => `${x.toFixed(1)}%`;

const { anime, manga, stale, divergence } = weeb;

// The taxonomy finding rests on this absence, so derive it rather than assert
// it: if a "Dropped" status ever appears in a future export, the copy below
// stops claiming it doesn't.
const STATUSES = Object.entries(anime.byWatch) as [string, number][];
const hasDropped = STATUSES.some(([k]) => /drop/i.test(k));
const paused = anime.byWatch.Paused;
const biggestGap = anime.deepestGaps[0];

// Scores actually used, low to high — the claim is about which end is missing.
const scores = (Object.entries(anime.scoreDist) as [string, number][])
  .map(([s, n]) => ({ score: Number(s), n }))
  .sort((a, b) => a.score - b.score);
const lowestUsed = scores[0]?.score ?? 0;
const topShare = scores.length ? (scores.at(-1)!.n / anime.scored) * 100 : 0;

const maxStatus = Math.max(...STATUSES.map(([, n]) => n));

export function WeebRoom() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-24">
      <Reveal>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-300">
          {num(anime.total)} anime and {num(manga.total)} manga, kept by hand in Notion for years
          before anyone asked to see them. The interesting part isn't the titles — it's that the
          table admits three things its rows never say out loud.
        </p>
      </Reveal>

      {/* ---------------------------------------------------------------- 1 */}
      <Reveal>
        <section className="mt-14">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">Finding 01</p>
          <h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
            {hasDropped ? "Quitting is recorded" : "There is no word for quitting"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {hasDropped
              ? "A “dropped” status exists in this export, so the schema does let him admit it."
              : `The status column has ${STATUSES.length} values and not one of them is “dropped”. ` +
                `${num(paused)} titles sit in “Paused” instead.`}{" "}
            Paused is supposed to mean <em>later</em>. Set against how many are actually caught up, it
            mostly means <em>no</em>.
          </p>

          <ul className="mt-6 space-y-2">
            {STATUSES.sort((a, b) => b[1] - a[1]).map(([label, n]) => (
              <li key={label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-xs text-zinc-400">{label}</span>
                <span
                  className="h-2 rounded-full bg-accent/70"
                  style={{ width: `${(n / maxStatus) * 62}%` }}
                />
                <span className="font-mono text-xs text-muted">{n}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { k: "Completed", v: anime.caughtUp.completed, icon: Star },
              { k: "Paused", v: anime.caughtUp.paused, icon: PauseCircle },
            ].map(({ k, v, icon: Icon }) =>
              v ? (
                <TiltCard key={k}>
                  <div className="rounded-xl border border-line p-5">
                    <Icon size={17} className="text-accent" />
                    <p className="mt-3 font-display text-3xl font-bold">{pct(v.pct)}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      of the {v.n} “{k}” shows are actually caught up with every season out.
                    </p>
                  </div>
                </TiltCard>
              ) : null,
            )}
          </div>

          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {num(anime.unwatchedSeasons)} seasons sit unwatched across {num(anime.behindCount)} shows.
            {biggestGap ? (
              <>
                {" "}
                The deepest single hole is <strong className="text-zinc-200">{biggestGap.name}</strong>,
                {" "}{biggestGap.gap} seasons behind.
              </>
            ) : null}
          </p>
        </section>
      </Reveal>

      {/* ---------------------------------------------------------------- 2 */}
      <Reveal>
        <section className="mt-16">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">Finding 02</p>
          <h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
            The bottom of the scale has never been used
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {num(anime.scored)} of {num(anime.total)} titles carry a score, and every one of them is
            a {lowestUsed} or higher out of five. The lower {lowestUsed - 1} points of his own scale
            have never once been spent — the shows that would have earned them are the ones sitting
            in “Paused”, unscored.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5].map((s) => {
              const row = scores.find((x) => x.score === s);
              return (
                <div
                  key={s}
                  className={`rounded-lg border px-4 py-3 text-center ${
                    row ? "border-accent/40" : "border-line opacity-40"
                  }`}
                >
                  <p className="font-mono text-xs text-zinc-400">{"★".repeat(s)}</p>
                  <p className="mt-1 font-display text-xl font-bold">{row ? row.n : "—"}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-muted">
            {Math.round(topShare)}% of everything he scored got full marks.
          </p>

          {divergence.n > 0 && (
            <div className="mt-8">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                Against the crowd — {divergence.n} titles where both scores exist
              </p>
              <ul className="mt-3 divide-y divide-line">
                {divergence.top.slice(0, 3).map((d) => (
                  <li key={d.name} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="text-sm text-zinc-300">{d.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {d.mine * 20} vs {d.crowd} crowd
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">
                He is most generous exactly where the crowd is harshest.
              </p>
            </div>
          )}
        </section>
      </Reveal>

      {/* ---------------------------------------------------------------- 3 */}
      <Reveal>
        <section className="mt-16">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">Finding 03</p>
          <h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
            A hand-kept list cannot see the present
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Every title here was matched against AniList at build time.{" "}
            <strong className="text-zinc-200">{num(stale.length)}</strong> rows say “caught up” while
            a sequel has already aired. That gap is not carelessness — it is what a snapshot does the
            moment it is written. The only fix is to ask something outside the list.
          </p>

          <ul className="mt-6 divide-y divide-line">
            {stale.slice(0, 8).map((s) => (
              <li key={s.name} className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-sm text-zinc-300">{s.name}</span>
                <span className="shrink-0 text-right font-mono text-[11px] text-muted">
                  {s.sequel}
                  {s.year ? ` · ${s.year}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {stale.length > 8 && (
            <p className="mt-3 font-mono text-[11px] text-muted">
              + {stale.length - 8} more, oldest first in the data.
            </p>
          )}

          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <CalendarClock size={15} className="text-accent" />
            {anime.matched} of {anime.total} titles matched a public record. Corpus last read{" "}
            {weeb.generatedAt}.
          </p>
        </section>
      </Reveal>

      {/* Manga is a much smaller corpus — one honest paragraph, not a fake
          third act. */}
      <Reveal>
        <section className="mt-16 border-t border-line pt-8">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            The manga half
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {num(manga.total)} titles and {num(manga.chaptersRead)} chapters logged — too small a
            corpus to carry a finding, and saying so is better than dressing it up.{" "}
            {manga.byRead.Reading ?? 0} of them are still open.
          </p>
          <a
            href="https://anilist.co"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm text-accent transition hover:underline"
          >
            Enrichment source: AniList <ArrowUpRight size={14} />
          </a>
        </section>
      </Reveal>
    </div>
  );
}
