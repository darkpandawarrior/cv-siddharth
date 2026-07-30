import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { BoardSurface, type BoardPick } from "./BoardSurface.tsx";
import { createEngine, type Engine } from "./engineClient.ts";
import { PRESETS, type PresetId } from "./calibration.ts";
import { chess } from "../data/chess.ts";

/* ── Play the bot ────────────────────────────────────────────────────────
 * react-chessboard draws; chess.js is the rules. Nothing here reimplements
 * legality, check, or how a game ends — every one of those is read back off
 * the `Chess` instance, so a draw by the fifty-move rule is named correctly
 * without this file knowing the fifty-move rule exists.
 *
 * The engine runs in a Web Worker (see engineClient), which is the whole
 * reason the board stays live while the bot thinks: a depth-4 search is
 * hundreds of milliseconds and would otherwise be hundreds of milliseconds
 * of frozen page.
 *
 * The board itself — square buttons, arrow-key navigation and the dnd-kit
 * accessibility repair — lives in BoardSurface, shared with the daily puzzle.
 *
 * !! The `Chess` instance lives in a ref and is NEVER read during render. !!
 * This repo compiles with the React Compiler (vite.config.ts). A `Chess`
 * object is mutable but its reference never changes, so the compiler
 * memoises any `game.fen()` / `game.history()` written in a render body
 * against a dependency that never changes — the board then freezes on the
 * starting position while the game underneath it plays on. That is measured,
 * not theorised: it is exactly what the first cut of this file did. Every
 * position-derived value the UI needs is snapshotted into state by
 * `snapshot()` after each mutation instead, and the legal-target list is
 * computed in the click handler rather than in render for the same reason.
 *
 * The two presets are named after ratings the owner actually held. They are
 * labels, not a measured strength — this engine has never played a rated
 * pool, so no copy in here says a bot "plays at" a rating.
 */

/** Why the game is a draw, asked in order: `isDraw()` is also true for
 *  stalemate and for insufficient material, so the specific reasons have to
 *  come first or every draw reads as "draw". */
function drawReason(game: Chess): string | null {
  if (game.isStalemate()) return "Draw by stalemate.";
  if (game.isInsufficientMaterial()) return "Draw — insufficient material.";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
  if (game.isDrawByFiftyMoves()) return "Draw by the fifty-move rule.";
  if (game.isDraw()) return "Draw.";
  return null;
}

type Snap = {
  fen: string;
  history: string[];
  turn: "w" | "b";
  over: boolean;
  check: boolean;
  mated: boolean;
  draw: string | null;
};

/** Everything the UI needs to know about a position, read off chess.js once,
 *  at the moment the position changes. */
function snapshot(game: Chess): Snap {
  return {
    fen: game.fen(),
    history: game.history(),
    turn: game.turn(),
    over: game.isGameOver(),
    check: game.isCheck(),
    mated: game.isCheckmate(),
    draw: drawReason(game),
  };
}

type Readout = { move: string; ms: number; nodes: number };

export default function ChessBoardPane({ reduced }: { reduced: boolean }) {
  const gameRef = useRef<Chess | null>(null);
  gameRef.current ??= new Chess();

  const [snap, setSnap] = useState<Snap>(() => snapshot(new Chess()));
  const [presetId, setPresetId] = useState<PresetId>("sid2019");
  const [pick, setPick] = useState<BoardPick>(null);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);

  const engineRef = useRef<Engine | null>(null);
  /** Bumped by "new game" and "resign": a search already in flight resolves
   *  into a game that no longer exists, and its move must be dropped. */
  const genRef = useRef(0);

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    // A worker left running per visit to /chess is exactly how a mysterious
    // memory climb starts. The room unmounts this pane on every tab switch.
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  const preset = PRESETS[presetId];
  const over = snap.over || resigned;
  const locked = thinking || over;

  const status = resigned
    ? `You resigned. ${preset.label} takes it.`
    : snap.mated
      ? snap.turn === "w"
        ? `Checkmate — ${preset.label} wins.`
        : "Checkmate — you win."
      : (snap.draw ??
        (thinking
          ? `${preset.label} is thinking.`
          : snap.check
            ? "You are in check — your move."
            : "Your move."));

  const think = () => {
    const engine = engineRef.current;
    const game = gameRef.current;
    if (!engine || !game) return;
    const gen = genRef.current;
    setThinking(true);
    engine
      .think(game.fen(), presetId, game.moveNumber())
      .then((result) => {
        // Identity, not null: React 19's dev double-mount disposes the first
        // engine and installs a second, so a bare null check would let the
        // disposed one's rejection through.
        if (engineRef.current !== engine || gen !== genRef.current) return;
        if (result.move) game.move(result.move);
        setReadout({ move: result.move, ms: result.ms, nodes: result.nodes });
        setThinking(false);
        setSnap(snapshot(game));
      })
      .catch((e: Error) => {
        if (engineRef.current !== engine || gen !== genRef.current) return;
        setError(e.message);
        setThinking(false);
      });
  };

  const tryMove = (from: string, to: string): boolean => {
    const game = gameRef.current;
    if (!game || locked) return false;
    if (!game.moves({ square: from as Square, verbose: true }).some((m) => m.to === to)) return false;
    // ponytail: promotions always take a queen. A promotion picker is a
    // dialog, a focus trap and four more pieces of UI for a case that shows
    // up in a fraction of games against a bot that rarely reaches an endgame.
    game.move({ from, to, promotion: "q" });
    setPick(null);
    setSnap(snapshot(game));
    if (!game.isGameOver()) think();
    return true;
  };

  /** The click-to-move fallback, and the same path a keyboard Enter takes:
   *  the square button's click bubbles to react-chessboard's own handler. */
  const clickSquare = (square: string) => {
    const game = gameRef.current;
    if (!game || locked) return;
    if (pick?.square === square) return setPick(null);
    if (pick?.targets.includes(square) && tryMove(pick.square, square)) return;
    const targets = game.moves({ square: square as Square, verbose: true }).map((m) => m.to as string);
    setPick(targets.length > 0 ? { square, targets } : null);
  };

  const newGame = () => {
    const game = gameRef.current;
    if (!game) return;
    genRef.current++;
    game.reset();
    setPick(null);
    setResigned(false);
    setThinking(false);
    setReadout(null);
    setError(null);
    setSnap(snapshot(game));
  };

  const resign = () => {
    if (over) return;
    genRef.current++;
    setThinking(false);
    setPick(null);
    setResigned(true);
  };

  const pairs = Array.from({ length: Math.ceil(snap.history.length / 2) }, (_, i) => ({
    n: i + 1,
    white: snap.history[i * 2],
    black: snap.history[i * 2 + 1],
  }));

  return (
    <>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
        An alpha-beta search running in a Web Worker, tuned to two ratings he actually held — including
        the clock habit, so it burns its thinking time through the middlegame and hurries the finish.
        The numbers below name those ratings; they are not a measured strength, because this engine has
        never played a rated pool. You are White.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Which bot to play">
        {Object.values(PRESETS).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPresetId(p.id)}
            aria-pressed={presetId === p.id}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
              presetId === p.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
            }`}
          >
            {presetId === p.id ? "● " : ""}
            {p.label} — {p.depth} ply · calibrated after {p.rating}
          </button>
        ))}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{preset.blurb}</p>

      <div className="mt-5 flex flex-col gap-6 lg:flex-row">
        <div className="w-full max-w-[420px] shrink-0">
          <BoardSurface
            id="chess-room-board"
            fen={snap.fen}
            pick={pick}
            interactive
            allowDragging={!locked}
            reduced={reduced}
            label="Chess board. Arrow keys move between squares; Enter or Space picks up a piece and then places it."
            onSquareClick={clickSquare}
            onDrop={tryMove}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={newGame}
              className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold text-accent transition hover:bg-accent/20"
            >
              new game
            </button>
            <button
              type="button"
              onClick={resign}
              disabled={over}
              className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-zinc-400 transition hover:text-zinc-200 disabled:opacity-40"
            >
              resign
            </button>
            <span className="font-mono text-[11px] text-muted">promotions auto-queen</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="rounded-lg border border-line bg-void/60 px-3 py-2 font-mono text-sm text-zinc-200"
          >
            {status}
          </p>
          {error && <p className="mt-2 font-mono text-xs text-red-400">engine error: {error}</p>}
          {readout?.move && (
            <p className="mt-2 font-mono text-xs text-muted">
              {preset.label} played {readout.move} in {readout.ms}ms over{" "}
              {readout.nodes.toLocaleString("en-US")} nodes
            </p>
          )}

          <h4 className="mt-4 font-mono text-xs text-zinc-300">moves</h4>
          {pairs.length === 0 ? (
            <p className="mt-1 font-mono text-xs text-muted">no moves yet</p>
          ) : (
            <ol className="mt-1 max-h-64 overflow-y-auto font-mono text-xs text-zinc-400">
              {pairs.map((p) => (
                <li key={p.n} className="flex gap-3 py-0.5">
                  <span className="w-6 shrink-0 text-muted">{p.n}.</span>
                  <span className="w-16">{p.white}</span>
                  <span className="w-16">{p.black ?? ""}</span>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 max-w-md font-mono text-[11px] leading-relaxed text-muted">
            Both bots are named after real ratings: {PRESETS.sid2019.rating} is what he held on{" "}
            {chess.bestUpset.at}, the day he beat a {chess.bestUpset.opRating} on{" "}
            {chess.bestUpset.platform} — a +{chess.bestUpset.gap} upset. {PRESETS.sid2026.rating} is
            his chess.com blitz peak. Neither number is this engine's Elo.
          </p>
        </div>
      </div>
    </>
  );
}
