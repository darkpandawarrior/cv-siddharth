import { Chess, type PieceSymbol } from "chess.js";

/* ── Alpha-beta search ───────────────────────────────────────────────────
 * A pure function of (fen, opts). No worker, no DOM, no clock unless a
 * budget is passed — which is what makes it unit-testable, and what lets
 * ChessSearchLab render the real tree instead of a simulation.
 *
 * ponytail: no transposition table, no quiescence, no move ordering beyond
 * captures-first. Upgrade path in order of payoff if the bot ever needs to
 * be stronger than ~1400: (1) quiescence at the horizon — add it only if the
 * bot visibly hangs pieces at the target rating, and measure before
 * building; (2) a Zobrist-keyed transposition table, which is also what
 * would make iterative deepening pay for itself; (3) killer/history
 * ordering. Deliberately absent: the calibration targets 1078 and 1425, and
 * every strength knob added above that has to be tuned back down again.
 */

/** One parent→child link in the search tree. `from` is always < `to`: ids
 * are handed out in visit order, so a parent is numbered before its child.
 * `depth` is the ply from the root at which the edge was expanded. */
export type TreeEdge = { from: number; to: number; move: string; score: number; depth: number };

export type SearchOptions = {
  depth: number;
  noise: number;
  seed: number;
  /** Wall-clock ceiling. Iterative deepening stops early when it passes, so
   * a hurried bot searches shallower than its nominal depth — the point of
   * `clockBudget`. Omitted in tests, which keeps `search` deterministic. */
  budgetMs?: number;
};

export type SearchResult = { move: string; score: number; nodes: number; tree: TreeEdge[] };

const MATE = 100_000;
const MAX_TREE_EDGES = 3_000;

const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Centrality, indexed by file or rank offset. Weighted per piece so knights
// and bishops develop toward the middle while rooks and the queen are not
// dragged there in the opening.
const CENTRE = [0, 1, 2, 3, 3, 2, 1, 0];
const CENTRE_WEIGHT: Record<PieceSymbol, number> = { p: 2, n: 4, b: 3, r: 0, q: 0, k: 0 };

/** mulberry32 — 32-bit, seedable, no dependency. The whole reason
 * `search(fen, { seed })` reproduces exactly for a given seed. */
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centipawns of jitter at `noise: 1`, split either side of the true score. */
const NOISE_SPAN = 140;

type Ctx = {
  rand: () => number;
  noise: number;
  nodes: number;
  lastId: number;
  tree: TreeEdge[];
  deadline: number;
  aborted: boolean;
};

/** Material plus the centrality term, from White's point of view. */
function evaluate(board: Chess): number {
  let score = 0;
  const rows = board.board();
  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    for (let c = 0; c < 8; c++) {
      const sq = row[c];
      if (!sq) continue;
      const value = VALUE[sq.type] + CENTRE_WEIGHT[sq.type] * (CENTRE[c] + CENTRE[r]);
      score += sq.color === "w" ? value : -value;
    }
  }
  return score;
}

/* The search walks SAN strings rather than `moves({ verbose: true })` Move
 * objects. Measured on a middlegame position: verbose costs 0.95ms per call
 * against 0.04ms for the SAN form, because every verbose Move eagerly builds
 * the FEN before and after itself. That one substitution is worth ~20x on
 * node throughput, and SAN is what the result and the tree want anyway. */

/** Mate, then checks, then captures — pawn captures ahead of the rest, since
 * SAN names the attacker but not the victim, so a real MVV-LVA ordering isn't
 * available without paying for verbose moves. Ordering only affects how much
 * alpha-beta can prune; it never changes the move chosen. */
function rank(san: string): number {
  let score = 0;
  if (san.includes("#")) score += 1000;
  else if (san.includes("+")) score += 8;
  if (san.includes("x")) score += 100 + (san.charCodeAt(0) >= 97 ? 10 : 0);
  return score;
}

function order(moves: string[]) {
  moves.sort((a, b) => rank(b) - rank(a));
}

function negamax(
  board: Chess,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  ctx: Ctx,
  nodeId: number,
): number {
  ctx.nodes++;
  if (ctx.deadline && (ctx.nodes & 0x3ff) === 0 && Date.now() > ctx.deadline) ctx.aborted = true;

  const moves = board.moves();
  // Terminal before horizon: a checkmate found at depth 0 still has to score
  // as a mate, and a shallower mate has to beat a deeper one.
  if (moves.length === 0) return board.isCheck() ? -(MATE - ply) : 0;
  if (depth === 0) {
    const own = board.turn() === "w" ? evaluate(board) : -evaluate(board);
    return own + (ctx.noise > 0 ? (ctx.rand() * 2 - 1) * ctx.noise * (NOISE_SPAN / 2) : 0);
  }

  order(moves);
  let best = -Infinity;
  for (const san of moves) {
    const childId = ++ctx.lastId;
    // Recorded before the recursion, not after, so the tree is in pre-order:
    // hitting MAX_TREE_EDGES then truncates leaves rather than the parents
    // that anchor them, and every edge's `from` is already a known node.
    const edge = ctx.tree.length < MAX_TREE_EDGES ? { from: nodeId, to: childId, move: san, score: 0, depth: ply } : null;
    if (edge) ctx.tree.push(edge);
    board.move(san);
    const score = -negamax(board, depth - 1, ply + 1, -beta, -alpha, ctx, childId);
    board.undo();
    if (edge) edge.score = score;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (ctx.aborted) break;
  }
  return best;
}

export function search(fen: string, opts: SearchOptions): SearchResult {
  const board = new Chess(fen);
  const rootMoves = board.moves();
  // Checkmate, stalemate, or an otherwise dead position: nothing to choose.
  if (rootMoves.length === 0) return { move: "", score: 0, nodes: 0, tree: [] };
  order(rootMoves);

  const rand = mulberry32(opts.seed);
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : 0;
  const maxDepth = Math.max(1, Math.floor(opts.depth));

  let move = rootMoves[0];
  let score = 0;
  let tree: TreeEdge[] = [];
  let nodes = 0;

  for (let d = 1; d <= maxDepth; d++) {
    const ctx: Ctx = { rand, noise: opts.noise, nodes: 0, lastId: 0, tree: [], deadline, aborted: false };
    let bestScore = -Infinity;
    let bestMove = rootMoves[0];
    let alpha = -Infinity;

    for (const san of rootMoves) {
      const childId = ++ctx.lastId;
      const edge: TreeEdge = { from: 0, to: childId, move: san, score: 0, depth: 0 };
      ctx.tree.push(edge);
      board.move(san);
      const value = -negamax(board, d - 1, 1, -Infinity, -alpha, ctx, childId);
      board.undo();
      edge.score = value;
      if (value > bestScore) {
        bestScore = value;
        bestMove = san;
      }
      if (bestScore > alpha) alpha = bestScore;
      if (ctx.aborted) break;
    }

    nodes += ctx.nodes;
    // A half-finished iteration has looked at only some root moves, so its
    // "best" is not comparable. Keep the last complete one — unless there
    // isn't one yet, in which case a partial answer beats no answer.
    if (ctx.aborted && d > 1) break;
    move = bestMove;
    score = bestScore;
    tree = ctx.tree;
    if (ctx.aborted) break;
  }

  return { move, score, nodes, tree };
}
