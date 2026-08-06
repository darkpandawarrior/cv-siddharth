import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { PieceDataType } from "react-chessboard";

/* ── One accessible board, used by every pane that draws one ─────────────
 * react-chessboard gives drag and rendering. Everything an assistive
 * technology needs, it does not:
 *
 * - Every piece is a dnd-kit draggable, so it renders as `role="button"`
 *   with `tabindex="0"` and no accessible name — 32 serious axe violations
 *   on an untouched board, whether or not dragging is even enabled. They are
 *   taken out of the tab order and the a11y tree here; the square carries the
 *   name instead ("e2, white pawn").
 * - Squares are plain divs. On an interactive board each becomes a real
 *   button with a roving tabindex, so the board is one tab stop, arrow keys
 *   walk it, and Enter fires a click that bubbles into react-chessboard's own
 *   `onSquareClick` — the same path a mouse takes, no second code path.
 *
 * A static board (the guess-the-move position) skips the buttons and is
 * hidden from the a11y tree instead: 64 unactionable controls are noise, and
 * the caller writes the text alternative.
 */

const FILES = "abcdefgh";
const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const KEY_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

function step(square: string, df: number, dr: number): string | null {
  const file = FILES.indexOf(square[0]) + df;
  const rank = Number(square[1]) + dr;
  return file < 0 || file > 7 || rank < 1 || rank > 8 ? null : `${FILES[file]}${rank}`;
}

function pieceName(piece: PieceDataType | null): string {
  if (!piece) return "empty";
  const colour = piece.pieceType[0];
  const type = piece.pieceType[1].toLowerCase();
  return `${colour === "w" ? "white" : "black"} ${PIECE_NAMES[type] ?? type}`;
}

/** The square a visitor has picked up, and where it may legally go. Computed
 *  by the caller in its click handler — never during render, because this
 *  repo compiles with the React Compiler and a `Chess` instance behind a
 *  stable ref would have its answers memoised for the life of the page. */
export type BoardPick = { square: string; targets: string[] } | null;

const HIGHLIGHT = "rgba(61,220,132,";

export function BoardSurface({
  id,
  fen,
  pick = null,
  orientation = "white",
  interactive = false,
  allowDragging = false,
  reduced,
  label,
  onSquareClick,
  onDrop,
}: {
  id: string;
  fen: string;
  pick?: BoardPick;
  orientation?: "white" | "black";
  interactive?: boolean;
  allowDragging?: boolean;
  reduced: boolean;
  label?: string;
  onSquareClick?: (square: string) => void;
  onDrop?: (from: string, to: string) => boolean;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(orientation === "white" ? "e2" : "e7");

  // An observer rather than a plain post-render sweep: react-chessboard adds
  // and replaces piece nodes on its own schedule (move animations mount a
  // clone), so a sweep tied to this component's renders leaves a focusable,
  // unnamed node behind often enough for axe to catch it. The observer
  // converges — removing `tabindex` is the only mutation it makes, and it is
  // the only attribute it watches.
  useEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const patch = () => {
      for (const el of root.querySelectorAll<HTMLElement>('[aria-roledescription="draggable"]')) {
        // Removed, not set to -1: axe's nested-interactive check counts
        // tabindex="-1" as focusable content inside the square button. A div
        // with no tabindex at all is not focusable, and the rule passes.
        if (el.hasAttribute("tabindex")) el.removeAttribute("tabindex");
        if (!el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
      }
    };
    patch();
    const observer = new MutationObserver(patch);
    observer.observe(root, { subtree: true, childList: true, attributeFilter: ["tabindex"] });
    return () => observer.disconnect();
  }, []);

  const onSquareKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = KEY_STEPS[e.key];
    if (!delta) return;
    e.preventDefault();
    // Arrows follow what the visitor sees, so a flipped board walks the other
    // way rather than "up" meaning "toward the opponent".
    const flip = orientation === "black" ? -1 : 1;
    const next = step(e.currentTarget.dataset.sq ?? cursor, delta[0] * flip, delta[1] * flip);
    if (!next) return;
    setCursor(next);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-sq="${next}"]`)?.focus();
  };

  return (
    <div
      ref={boardRef}
      className="w-full"
      {...(interactive ? { role: "group", "aria-label": label } : { "aria-hidden": true })}
    >
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging,
          allowDrawingArrows: false,
          showAnimations: !reduced,
          animationDurationInMs: reduced ? 0 : 200,
          darkSquareStyle: { backgroundColor: "#2a3b33" },
          lightSquareStyle: { backgroundColor: "#c9d6cd" },
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare && onDrop ? onDrop(sourceSquare, targetSquare) : false,
          onSquareClick: ({ square }) => onSquareClick?.(square),
          squareRenderer: ({ square, piece, children }) => {
            const isTarget = pick?.targets.includes(square) ?? false;
            const background =
              square === pick?.square
                ? `${HIGHLIGHT}0.42)`
                : isTarget && piece
                  ? `radial-gradient(circle, transparent 52%, ${HIGHLIGHT}0.55) 54%)`
                  : isTarget
                    ? `radial-gradient(circle, ${HIGHLIGHT}0.55) 22%, transparent 24%)`
                    : "transparent";
            const style = { width: "100%", height: "100%", background };
            if (!interactive) return <div style={style}>{children}</div>;
            return (
              <button
                type="button"
                data-sq={square}
                tabIndex={square === cursor ? 0 : -1}
                aria-label={`${square}, ${pieceName(piece)}${
                  square === pick?.square ? ", selected" : isTarget ? ", legal move" : ""
                }`}
                onFocus={() => setCursor(square)}
                onKeyDown={onSquareKeyDown}
                className="block cursor-pointer border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
                style={style}
              >
                {children}
              </button>
            );
          },
        }}
      />
    </div>
  );
}
