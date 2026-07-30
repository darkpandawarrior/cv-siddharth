import { search, type TreeEdge } from "./search.ts";
import { PRESETS, clockBudget, type PresetId } from "./calibration.ts";

/* ── The only place the search ever runs ─────────────────────────────────
 * Non-negotiable per the spec: this repo runs axe scans across its routes
 * and Lighthouse CI with a budget, and a multi-hundred-millisecond search on
 * the main thread would fail both. It also keeps ChessSearchLab honest — the
 * lab draws the tree this file produced, not a simulation of one.
 */

export type EngineRequest = {
  id: number;
  fen: string;
  presetId: PresetId;
  /** Full moves played so far, so `clockBudget` can model where in the game
   * he burns his clock. Defaults to 1 (opening pace). */
  moveNumber?: number;
  /** Omit and the worker derives one from the position, which keeps a given
   * position reproducible while still varying across a game. */
  seed?: number;
};

export type EngineResponse =
  | { type: "tree"; id: number; edges: TreeEdge[] }
  | { type: "result"; id: number; move: string; score: number; nodes: number; ms: number }
  | { type: "error"; id: number; message: string };

/** Batched so a 3,000-edge tree arrives as a handful of small structured
 * clones rather than one large one. */
const BATCH = 400;

/** FNV-1a over the FEN. Same position, same move — which is what makes a bot
 * feel like it has a personality rather than a dice cup. */
function seedFromFen(fen: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < fen.length; i++) {
    h ^= fen.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function post(message: EngineResponse) {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const { id, fen, presetId, moveNumber = 1, seed } = event.data;
  try {
    const preset = PRESETS[presetId] ?? PRESETS.sid2026;
    const started = Date.now();
    const result = search(fen, {
      depth: preset.depth,
      noise: preset.noise,
      seed: seed ?? seedFromFen(fen),
      budgetMs: clockBudget(preset, moveNumber),
    });
    for (let i = 0; i < result.tree.length; i += BATCH) {
      post({ type: "tree", id, edges: result.tree.slice(i, i + BATCH) });
    }
    post({
      type: "result",
      id,
      move: result.move,
      score: result.score,
      nodes: result.nodes,
      ms: Date.now() - started,
    });
  } catch (error) {
    post({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
  }
};
