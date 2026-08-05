import { Suspense, lazy, useMemo, useState } from "react";
import { useCorpus, type Corpus } from "./lib/useCorpus.ts";
import { ChessArc } from "./ChessArc.tsx";
import { chess } from "./data/chess.ts";
import { ChessVsCommits } from "./chess/ChessVsCommits.tsx";
import { ChessFindings } from "./chess/ChessFindings.tsx";

import { focusLines, pct, repertoireYears, shareSeries } from "./chess/repertoireModel.ts";
import type { GraveyardView } from "./chess/GraveyardScene.tsx";

const ChessArcScene = lazy(() => import("./chess/ChessArcScene.tsx"));
const GraveyardScene = lazy(() => import("./chess/GraveyardScene.tsx"));
const RepertoireTreeScene = lazy(() => import("./chess/RepertoireTreeScene.tsx"));
/* Lazy for the same reason as the scenes: this one pulls react-chessboard,
 * chess.js and the engine worker, and five of the six panes have no use for
 * any of them. */
const ChessBoardPane = lazy(() => import("./chess/ChessBoardPane.tsx"));
const GuessTheMove = lazy(() => import("./chess/GuessTheMove.tsx"));
const DailyPuzzle = lazy(() => import("./chess/DailyPuzzle.tsx"));
/* The pulse counter writes through playhtml, which needs its provider in the
 * tree — without one `usePageData`'s setter silently no-ops and the counts
 * never leave the tab. Lazy like the panes it wraps, so the ~75 kB of Yjs +
 * partysocket only loads for a visitor who opens this one tab, and the room's
 * own chunk stays clear of it. */
const PlayRoom = lazy(() => import("./play/PlayRoom.tsx").then((m) => ({ default: m.PlayRoom })));

/** Square index to algebraic name — index 0 is a1, 63 is h8, the convention the
 *  generator's `squareMatrix` fixed. Lives here rather than in the scene so the
 *  room can name squares without pulling three.js into its chunk. */
function squareName(i: number): string {
  return `${"abcdefgh"[i % 8]}${Math.floor(i / 8) + 1}`;
}

/**
 * The Board — the shell for the chess room.
 *
 * Six panes over one corpus fetch. Only the active pane is mounted: three of
 * them are three.js scenes and one is a Web Worker engine, so mounting all six
 * would pay for five rooms nobody is looking at. Same tab-strip pattern as
 * LabBench (buttons carrying `aria-pressed`, not an ARIA tablist — these are
 * toggles over one region, and the strip stays keyboard-operable for free
 * because they are real buttons).
 */

export type ChessTab = "findings" | "arc" | "graveyard" | "repertoire" | "play" | "puzzle" | "rhythm";

const TABS: { key: ChessTab; label: string }[] = [
  { key: "findings", label: "The Findings" },
  { key: "arc", label: "The Arc" },
  { key: "graveyard", label: "The Graveyard" },
  { key: "repertoire", label: "Repertoire" },
  { key: "play", label: "Play the Bot" },
  { key: "puzzle", label: "Guess the Move" },
  { key: "rhythm", label: "Rhythm" },
];

/**
 * The platform handoff, derived rather than written down: the first year
 * chess.com out-played lichess. 2021 doesn't qualify (19 games against 4,672 —
 * the false start), 2023 does. The corpus grows every time he plays, so this
 * has to be a computation, not a constant.
 */
function platformHandoff() {
  const year = chess.activityByYear.find((y) => y.chesscom > y.lichess)?.year;
  if (!year) return null;
  // ASCII only: this label is drawn inside a canvas by troika, which fetches a
  // fallback font from a CDN for any glyph the bundled font lacks.
  return { year, at: Date.UTC(Number(year), 0, 1), label: `handoff -> chess.com ${year}` };
}

/** Local WebGL probe — same shape as FoundationGraph's, kept local so this
 *  module never imports a three.js-touching file (that would drag the whole
 *  engine into the room chunk even for visitors who never see a canvas). */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** What this visitor's browser will accept: motion, and a canvas at all.
 *  Read once — neither answer changes mid-visit in any way worth re-rendering. */
function useEnv(): { reduced: boolean; webgl: boolean } {
  return useMemo(
    () => ({ reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches, webgl: supportsWebGL() }),
    [],
  );
}

const sceneFallback = (
  <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading the scene…</div>
);

/** Wrapper for every 3D pane: fixed-height canvas holder plus the text
 *  alternative underneath. A canvas is opaque to a screen reader, so each
 *  scene's finding is also written out — from the same data the scene draws. */
function ScenePane({ height, alt, children }: { height: string; alt: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className={`relative mt-4 overflow-hidden rounded-lg border border-line bg-ink ${height}`} aria-hidden>
        {children}
      </div>
      {alt}
    </>
  );
}

/**
 * The Arc — twin ribbons in 3D, the flat `ChessArc` under reduced motion or
 * without WebGL. The fallback check lives here rather than inside the scene so
 * a reduced-motion visitor never downloads three.js at all.
 */
function ArcPane({ corpus }: { corpus: Corpus }) {
  const { reduced, webgl } = useEnv();
  const flat = reduced || !webgl;
  const handoff = platformHandoff();
  const bands = useMemo(() => {
    const withPoints = corpus.arc.filter((s) => s.points.length > 1);
    return [...new Set(withPoints.map((s) => s.platform))].map((platform) => {
      const own = withPoints.filter((s) => s.platform === platform);
      const ts = own.flatMap((s) => s.points.map((p) => p.t));
      return {
        platform,
        from: new Date(Math.min(...ts)).toISOString().slice(0, 10),
        to: new Date(Math.max(...ts)).toISOString().slice(0, 10),
        formats: own.map((s) => {
          const rs = s.points.map((p) => p.r);
          return { format: s.format, min: Math.min(...rs), max: Math.max(...rs) };
        }),
      };
    });
  }, [corpus]);
  const handoffRow = handoff && chess.activityByYear.find((y) => y.year === handoff.year);

  // The handoff sentence holds in both modes; the ribbon description and the
  // range list are the canvas's text alternative, so they are only worth
  // printing when there is a canvas (the flat arc already carries both).
  const handoffNote = handoffRow && (
    <p className="mt-3 text-sm leading-relaxed text-zinc-400">
      Where the arc changes hands: in {handoffRow.year} chess.com carried {handoffRow.chesscom.toLocaleString()}{" "}
      games against lichess's {handoffRow.lichess.toLocaleString()}. One platform's ratings stop there and the
      other's start on its own scale — the two are marked apart, never joined into one line.
    </p>
  );

  const alt = (
    <div className="mt-4 text-sm leading-relaxed text-zinc-400">
      <p>
        Two ribbons, one per platform, sharing only the time axis. Each platform keeps its own vertical
        scale — the rating pools are not comparable, so a shared axis would draw a decline the games do
        not support.
      </p>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {bands.map((b) => (
          <li key={b.platform}>
            <span className="text-zinc-200">{b.platform}</span> {b.from} → {b.to} ·{" "}
            {b.formats.map((f) => `${f.format} ${f.min}–${f.max}`).join(" · ")}
          </li>
        ))}
      </ul>
      {handoffNote}
    </div>
  );

  if (flat) {
    return (
      <div className="mt-4">
        <ChessArc arcs={corpus.arc} height={110} />
        {handoffNote}
      </div>
    );
  }

  return (
    <ScenePane height="h-[460px]" alt={alt}>
      <Suspense fallback={sceneFallback}>
        <ChessArcScene corpus={corpus} handoffAt={handoff?.at ?? null} handoffLabel={handoff?.label ?? ""} />
      </Suspense>
    </ScenePane>
  );
}

/**
 * The Graveyard — the 64-square terminal-position heatmap, plus the toggle and
 * the caption that keeps its sample honest.
 */
function GraveyardPane({ corpus }: { corpus: Corpus }) {
  const { reduced, webgl } = useEnv();
  const [view, setView] = useState<GraveyardView>("losses");
  const counts = corpus.graveyard[view];

  const top = useMemo(
    () =>
      counts
        .map((n, i) => ({ square: squareName(i), n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
    [counts],
  );
  const cc = chess.platforms.find((p) => p.id === "chess.com");
  const li = chess.platforms.find((p) => p.id === "lichess");

  const caption = (
    <p className="mt-1 text-sm leading-relaxed text-zinc-400">
      Where the games actually end: each column counts the {view} whose <em>final</em> position still had a
      piece — either side's — standing on that square.{" "}
      {cc && li && (
        <>
          This board is chess.com's {cc.games.toLocaleString()} games only. lichess's{" "}
          {li.games.toLocaleString()} are not in it: its export ships no FEN, so their final positions
          were never recorded.
        </>
      )}
    </p>
  );

  const alt = (
    <div className="mt-4 text-sm leading-relaxed text-zinc-400">
      <p>
        Busiest squares at the end of a game, {view}, heights normalised against the tallest column in this
        matrix:
      </p>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        {top.map((t, i) => (
          <li key={t.square}>
            <span className="text-zinc-200">
              {i + 1}. {t.square}
            </span>{" "}
            {t.n.toLocaleString()}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <>
      {caption}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Which games to show">
        {(["losses", "wins"] as GraveyardView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
              view === v ? "border-accent bg-accent/15 text-accent" : "border-line text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {view === v ? "● " : ""}
            {v}
          </button>
        ))}
      </div>
      {webgl ? (
        <ScenePane height="h-[460px]" alt={alt}>
          <Suspense fallback={sceneFallback}>
            <GraveyardScene counts={counts} view={view} reduced={reduced} />
          </Suspense>
        </ScenePane>
      ) : (
        alt
      )}
    </>
  );
}

/**
 * Repertoire — the opening tree with a year scrubber, plus the written table
 * that is the whole arc for anyone who can't see the canvas.
 */
function RepertoirePane({ corpus }: { corpus: Corpus }) {
  const { reduced, webgl } = useEnv();
  const years = useMemo(() => repertoireYears(corpus.repertoireByPlatform), [corpus]);
  const focus = useMemo(() => focusLines(years), [years]);
  const [idx, setIdx] = useState(0);
  const handoff = platformHandoff();
  const selected = years[idx]?.year ?? "";

  // "lichess 41.1% (2019) to 3.6% (2023)" — first and last quotable year of
  // each platform's own run, never spliced across the handoff.
  const arcLines = useMemo(
    () =>
      focus.map((name) => {
        const series = shareSeries(years, name);
        const runs = (["lichess", "chesscom"] as const).flatMap((key) => {
          const run = series.filter((p) => p.key === key && !p.thin);
          if (run.length < 2) return [];
          const from = run[0];
          const to = run[run.length - 1];
          return [`${key === "lichess" ? "lichess" : "chess.com"} ${pct(from.share)} (${from.year}) → ${pct(to.share)} (${to.year})`];
        });
        return { name, runs };
      }),
    [focus, years],
  );

  const alt = (
    <div className="mt-4 text-sm leading-relaxed text-zinc-400">
      <ul className="space-y-1">
        {arcLines.map((l) => (
          <li key={l.name}>
            <span className="text-zinc-200">{l.name}</span> — {l.runs.join(" · ")}
          </li>
        ))}
      </ul>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse font-mono text-xs">
          <caption className="pb-2 text-left text-xs text-muted">
            Share of that platform-year's games as Black. A platform only appears in a year it was
            actually played, and a sample the generator marked thin carries no percentage at all.
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-zinc-300">
              <th scope="col" className="py-1 pr-3">year</th>
              <th scope="col" className="py-1 pr-3">platform</th>
              <th scope="col" className="py-1 pr-3">games as Black</th>
              {focus.map((f) => (
                <th key={f} scope="col" className="py-1 pr-3">{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.flatMap((y) =>
              y.platforms.map((p) => (
                <tr key={`${y.year}-${p.key}`} className="border-b border-line/50">
                  <th scope="row" className="py-1 pr-3 text-left font-normal text-zinc-300">{y.year}</th>
                  <td className="py-1 pr-3">{p.key === "lichess" ? "lichess" : "chess.com"}</td>
                  <td className="py-1 pr-3">{p.blackGames.toLocaleString()}</td>
                  {focus.map((f) => {
                    const o = p.openings.find((x) => x.name === f);
                    return (
                      <td key={f} className="py-1 pr-3">
                        {p.thin ? `thin (n=${o?.count ?? 0})` : `${pct(o?.share ?? 0)}`}
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">
        The two lines whose share of his games as Black moved most, tracked <em>within</em> each platform.
        {handoff && (
          <>
            {" "}
            The wall in the scene is the {handoff.year} handoff: the fall on lichess and the return on
            chess.com are two separate observations on two different sites, and the scene will not draw
            them as one line.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="repertoire-year" className="font-mono text-xs text-zinc-300">
          year
        </label>
        <input
          id="repertoire-year"
          type="range"
          min={0}
          max={Math.max(0, years.length - 1)}
          step={1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-valuetext={selected}
          className="w-56 accent-accent"
        />
        <span className="font-mono text-sm text-accent">{selected}</span>
        <span className="font-mono text-xs text-muted">
          {years[idx]?.platforms.map((p) => `${p.key === "lichess" ? "lichess" : "chess.com"} ${p.blackGames}`).join(" · ")}
        </span>
      </div>

      {webgl ? (
        <ScenePane height="h-[520px]" alt={alt}>
          <Suspense fallback={sceneFallback}>
            <RepertoireTreeScene
              years={years}
              focus={focus}
              selected={selected}
              handoffYear={handoff?.year ?? null}
              reduced={reduced}
            />
          </Suspense>
        </ScenePane>
      ) : (
        alt
      )}
    </>
  );
}

/** Play the Bot — the board, the two calibrated presets, and the worker. */
function PlayPane() {
  const { reduced } = useEnv();
  return (
    <Suspense fallback={<p className="mt-4 font-mono text-sm text-muted">loading the board…</p>}>
      <ChessBoardPane reduced={reduced} />
    </Suspense>
  );
}

/** Guess the Move — the corpus quiz, and the captured lichess daily puzzle
 *  underneath it. Both need react-chessboard, so both are lazy. */
function PuzzlePane({ corpus }: { corpus: Corpus }) {
  const { reduced } = useEnv();
  return (
    <Suspense fallback={<p className="mt-4 font-mono text-sm text-muted">loading the boards…</p>}>
      <PlayRoom>
        <div className="mt-4">
          <GuessTheMove positions={corpus.positions} reduced={reduced} />
          <DailyPuzzle builtAt={corpus.generatedAt.slice(0, 10)} reduced={reduced} />
        </div>
      </PlayRoom>
    </Suspense>
  );
}

export function ChessRoom() {
  const [tab, setTab] = useState<ChessTab>("findings");
  const { corpus, error } = useCorpus();
  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="section-y mx-auto w-full max-w-6xl px-6">
      <h2 className="font-display text-h2 font-bold tracking-tight">Seven years of games, mined</h2>
      <p className="mt-2 max-w-2xl text-zinc-400">
        Every rated game played on lichess and chess.com, pulled at build time and taken apart — the
        rating arc, where the games actually end, what the repertoire drifted into, and a bot tuned to
        play like its owner.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            id={`chess-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            aria-controls="chess-pane"
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
            }`}
          >
            {/* The bullet is not the only signal — the pressed tab also carries
                aria-pressed, a border and a background, so state never rests on
                colour alone. */}
            {tab === t.key ? "● " : ""}
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="chess-pane"
        role="region"
        aria-labelledby={`chess-tab-${tab}`}
        aria-busy={tab !== "findings" && !corpus && !error}
        className="mt-6 rounded-xl border border-line bg-card p-6"
      >
        {tab === "findings" ? (
          // Renders straight from the bundled `chess.ts` summary, not the
          // fetched corpus — the room's default landing tab shouldn't wait on
          // a 254 KB fetch for numbers that were already in the JS chunk.
          <>
            <h3 className="font-display text-lg font-semibold">{active?.label}</h3>
            <ChessFindings />
          </>
        ) : error ? (
          <p className="font-mono text-sm text-zinc-300">
            The game corpus didn't load, so there is nothing honest to show here. It's a static file
            (<code>/chess/corpus.json</code>) — a reload usually fixes it.
          </p>
        ) : !corpus ? (
          <p className="font-mono text-sm text-muted">loading the game corpus…</p>
        ) : (
          <>
            <h3 className="font-display text-lg font-semibold">{active?.label}</h3>
            {tab === "arc" ? (
              <ArcPane corpus={corpus} />
            ) : tab === "graveyard" ? (
              <GraveyardPane corpus={corpus} />
            ) : tab === "repertoire" ? (
              <RepertoirePane corpus={corpus} />
            ) : tab === "play" ? (
              <PlayPane />
            ) : tab === "puzzle" ? (
              <PuzzlePane corpus={corpus} />
            ) : (
              <ChessVsCommits hours={corpus.hours} />
            )}
          </>
        )}
      </div>

      {corpus && (
        <p className="mt-4 font-mono text-[11px] text-muted">corpus generated {corpus.generatedAt.slice(0, 10)}</p>
      )}
    </div>
  );
}
