import { useState } from "react";
import { useCorpus, type Corpus } from "./lib/useCorpus.ts";

/**
 * The Board — the shell for the chess room.
 *
 * Six panes over one corpus fetch. Only the active pane is mounted: three of
 * them are three.js scenes and one is a Web Worker engine, so mounting all six
 * would pay for five rooms nobody is looking at. Same tab-strip pattern as
 * LabBench (buttons carrying `aria-pressed`, not an ARIA tablist — these are
 * toggles over one region, and the strip stays keyboard-operable for free
 * because they are real buttons).
 *
 * Tasks 7–14 replace the placeholder panes one at a time.
 */

export type ChessTab = "arc" | "graveyard" | "repertoire" | "play" | "puzzle" | "rhythm";

const TABS: { key: ChessTab; label: string }[] = [
  { key: "arc", label: "The Arc" },
  { key: "graveyard", label: "The Graveyard" },
  { key: "repertoire", label: "Repertoire" },
  { key: "play", label: "Play the Bot" },
  { key: "puzzle", label: "Guess the Move" },
  { key: "rhythm", label: "Rhythm" },
];

/** One real number per pane, straight from the corpus. A placeholder that
 *  quotes live data is honest about what has loaded and what hasn't. */
function paneNote(tab: ChessTab, c: Corpus): string {
  switch (tab) {
    case "arc":
      return `${c.arc.length} rating series loaded`;
    case "graveyard":
      return `${c.graveyard.losses.length} terminal squares loaded`;
    case "repertoire":
      return `${Object.keys(c.repertoireByPlatform).length} years of repertoire loaded`;
    case "play":
      return "no engine yet";
    case "puzzle":
      return `${c.positions.length} positions loaded`;
    case "rhythm":
      return `${c.hours.chess.length} hour buckets loaded`;
  }
}

export function ChessRoom() {
  const [tab, setTab] = useState<ChessTab>("arc");
  const { corpus, error } = useCorpus();
  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
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
        aria-busy={!corpus && !error}
        className="mt-6 rounded-xl border border-line bg-card p-6"
      >
        {error ? (
          <p className="font-mono text-sm text-zinc-300">
            The game corpus didn't load, so there is nothing honest to show here. It's a static file
            (<code>/chess/corpus.json</code>) — a reload usually fixes it.
          </p>
        ) : !corpus ? (
          <p className="font-mono text-sm text-muted">loading the game corpus…</p>
        ) : (
          <>
            <h3 className="font-display text-lg font-semibold">{active?.label}</h3>
            <p className="mt-1 font-mono text-xs text-muted">
              {/* ponytail: an honest stub, not a fake scene. Tasks 7–14 each
                  swap one of these for the real thing. */}
              not built yet — {paneNote(tab, corpus)}
            </p>
          </>
        )}
      </div>

      {corpus && (
        <p className="mt-4 font-mono text-[11px] text-muted">corpus generated {corpus.generatedAt.slice(0, 10)}</p>
      )}
    </div>
  );
}
