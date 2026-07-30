import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { BoardSurface, type BoardPick } from "./BoardSurface.tsx";
import { usePulse } from "../play/pulse.ts";
import { chess } from "../data/chess.ts";

/* ── The daily puzzle ────────────────────────────────────────────────────
 * lichess's daily puzzle, as it stood when this site was last built. It is
 * not live and the copy says so — the generator captures it and it ships in
 * chess.ts with everything else.
 *
 * chess.js validates: a move is legal or it isn't, and the solution is a
 * list of UCI strings the played move has to match. Same rule as the board
 * pane — the `Chess` instance lives in a ref and is never read during
 * render, because the React Compiler would memoise its answers forever.
 */

const puzzle = chess.puzzle;
const SOLUTION = puzzle.solution;

/** "g4e3" / "b7b8q" — the form lichess ships and the form a chess.js Move
 *  can be flattened back into for comparison. */
const uci = (from: string, to: string, promotion?: string) => `${from}${to}${promotion ?? ""}`;

function applyUci(game: Chess, move: string) {
  game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? "q" });
}

export default function DailyPuzzle({ builtAt, reduced }: { builtAt: string; reduced: boolean }) {
  const gameRef = useRef<Chess | null>(null);
  gameRef.current ??= new Chess(puzzle.fen);
  const replyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Widened on purpose: chess.ts is `as const`, so the literal FEN would
  // otherwise become the state's only allowed value.
  const [fen, setFen] = useState<string>(puzzle.fen);
  const [ply, setPly] = useState(0);
  const [pick, setPick] = useState<BoardPick>(null);
  const [note, setNote] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const bump = usePulse();

  useEffect(() => () => { if (replyRef.current) clearTimeout(replyRef.current); }, []);

  const side = puzzle.fen.split(" ")[1] === "b" ? "black" : "white";
  const solved = ply >= SOLUTION.length;

  const tryMove = (from: string, to: string): boolean => {
    const game = gameRef.current;
    if (!game || solved) return false;
    const legal = game.moves({ square: from as Square, verbose: true }).find((m) => m.to === to);
    if (!legal) return false;
    bump("chess:puzzle");
    if (uci(from, to, legal.promotion) !== SOLUTION[ply]) {
      setPick(null);
      setNote(`${legal.san} is legal, but it isn't the move. Try another.`);
      return false;
    }
    game.move({ from, to, promotion: legal.promotion ?? "q" });
    setPick(null);
    setNote(null);
    setFen(game.fen());
    const next = ply + 1;
    setPly(next);
    if (next >= SOLUTION.length) return true;
    // The opponent's forced reply, a beat later so the two moves read as two
    // moves rather than one jump. Under reduced motion it lands immediately.
    replyRef.current = setTimeout(
      () => {
        applyUci(game, SOLUTION[next]);
        setFen(game.fen());
        setPly(next + 1);
      },
      reduced ? 0 : 420,
    );
    return true;
  };

  const clickSquare = (square: string) => {
    const game = gameRef.current;
    if (!game || solved) return;
    if (pick?.square === square) return setPick(null);
    if (pick?.targets.includes(square) && tryMove(pick.square, square)) return;
    const targets = game.moves({ square: square as Square, verbose: true }).map((m) => m.to as string);
    setPick(targets.length > 0 ? { square, targets } : null);
  };

  const restart = () => {
    const game = gameRef.current;
    if (!game) return;
    if (replyRef.current) clearTimeout(replyRef.current);
    game.load(puzzle.fen);
    setFen(puzzle.fen);
    setPly(0);
    setPick(null);
    setNote(null);
    setRevealed(false);
  };

  const status = solved
    ? "Solved — that was the whole line."
    : (note ??
      (ply === 0
        ? `${side === "black" ? "Black" : "White"} to play. Find the move.`
        : `${SOLUTION.length - ply} more to go.`));

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h4 className="font-display text-base font-semibold">The daily puzzle</h4>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
        lichess puzzle {puzzle.id}, rated {puzzle.rating.toLocaleString("en-US")} —{" "}
        {puzzle.themes.join(", ")}. It was fetched when this site was last built ({builtAt}) and
        ships with the rest of the generated data, so <strong className="text-zinc-300">it changes
        with the daily build, not live</strong>. Your moves are checked against the real solution.
      </p>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        <div className="w-full max-w-[360px] shrink-0">
          <BoardSurface
            id="chess-puzzle-board"
            fen={fen}
            pick={pick}
            orientation={side}
            interactive
            allowDragging={!solved}
            reduced={reduced}
            label="Puzzle board. Arrow keys move between squares; Enter or Space picks up a piece and then places it."
            onSquareClick={clickSquare}
            onDrop={tryMove}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="rounded-lg border border-line bg-void/60 px-3 py-2 font-mono text-sm text-zinc-200"
          >
            {status}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restart}
              className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold text-accent transition hover:bg-accent/20"
            >
              restart
            </button>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              disabled={revealed || solved}
              className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-zinc-400 transition hover:text-zinc-200 disabled:opacity-40"
            >
              show the line
            </button>
          </div>

          {(revealed || solved) && (
            <p className="mt-3 font-mono text-xs text-zinc-400">
              {SOLUTION.map((m, i) => (
                <span key={m + i} className={i < ply ? "text-accent" : ""}>
                  {m}
                  {i < SOLUTION.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
