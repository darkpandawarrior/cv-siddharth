import { useState } from "react";
import { BoardSurface } from "./BoardSurface.tsx";
import { usePulse } from "../play/pulse.ts";
import type { ChessPosition } from "../lib/useCorpus.ts";

/* ── Guess the move ──────────────────────────────────────────────────────
 * The graveyard data, made answerable. Each position is the last position of
 * a real game; the visitor calls it as a win or a loss and then sees the
 * date, the speed and what he was rated that day.
 *
 * The board is decorative to a screen reader — 64 squares of a position you
 * cannot act on is noise — so it is hidden from the a11y tree and the answer
 * text carries everything the quiz is actually about.
 */

/** The FENs in the corpus carry no move counters (chess.com's export drops
 *  them), which is fine: only the piece placement is drawn, and side-to-move
 *  is the one other field the question needs. */
function sideToMove(fen: string): string {
  return fen.split(" ")[1] === "b" ? "Black" : "White";
}

function nextIndex(current: number, n: number): number {
  if (n < 2) return current;
  const step = 1 + Math.floor(Math.random() * (n - 1));
  return (current + step) % n;
}

export default function GuessTheMove({
  positions,
  reduced,
}: {
  positions: ChessPosition[];
  reduced: boolean;
}) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(1, positions.length)));
  const [guess, setGuess] = useState<"win" | "loss" | null>(null);
  const [score, setScore] = useState({ right: 0, asked: 0 });
  const bump = usePulse();

  const position = positions[index];
  if (!position) return null;

  const answer = (g: "win" | "loss") => {
    if (guess) return;
    setGuess(g);
    setScore((s) => ({ right: s.right + (g === position.result ? 1 : 0), asked: s.asked + 1 }));
    bump("chess:guess");
  };

  const correct = guess === position.result;

  return (
    <section>
      <h4 className="font-display text-base font-semibold">Won it or lost it?</h4>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
        The last position of one of the {positions.length.toLocaleString("en-US")} finished games the
        generator kept a board for — chess.com's only, because lichess's export ships no FEN.{" "}
        {sideToMove(position.fen)} is to move. Call it.
      </p>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        <div className="w-full max-w-[320px] shrink-0">
          <BoardSurface id="chess-guess-board" fen={position.fen} reduced={reduced} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {(["win", "loss"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => answer(g)}
                disabled={guess !== null}
                className="rounded-full border border-line px-4 py-1.5 font-mono text-xs text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100 disabled:opacity-40"
              >
                he {g === "win" ? "won" : "lost"} it
              </button>
            ))}
          </div>

          <p aria-live="polite" aria-atomic="true" className="mt-3 text-sm leading-relaxed text-zinc-300">
            {guess ? (
              <>
                <span className={correct ? "text-accent" : "text-[#ff5c5c]"}>
                  {correct ? "Right" : "Wrong"}
                </span>{" "}
                — he {position.result === "win" ? "won" : "lost"} it. {position.speed} on{" "}
                {position.at}, rated {position.myRating.toLocaleString("en-US")} at the time.
              </>
            ) : (
              <span className="text-muted">Pick one.</span>
            )}
          </p>

          {guess && (
            <button
              type="button"
              onClick={() => {
                setGuess(null);
                setIndex((i) => nextIndex(i, positions.length));
              }}
              className="mt-3 rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold text-accent transition hover:bg-accent/20"
            >
              next position
            </button>
          )}

          {score.asked > 0 && (
            <p className="mt-3 font-mono text-[11px] text-muted">
              {score.right} of {score.asked} called correctly
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
