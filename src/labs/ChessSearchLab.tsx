import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";
import { createEngine, type Engine } from "../chess/engineClient.ts";
import { PRESETS, clockBudget, type PresetId } from "../chess/calibration.ts";
import { chess } from "../data/chess.ts";
import type { TreeEdge } from "../chess/search.ts";

/* ── Chess alpha-beta Search Tree Lab ────────────────────────────────────
 * Sibling instrument to SearchTreeLab (Kursi's ISMCTS): same canvas loop,
 * same bottom-up tree, so the two search families read as one idea. The
 * difference is that this one draws the REAL tree — every edge below comes
 * back from src/chess/search.ts running inside the engine worker, never a
 * simulation and never the main thread.
 *
 * The two presets are the depth control: they are named after ratings the
 * owner actually held (2019 and 2026), and they set search depth and
 * move-selection noise. They are labels, not a measured strength — this
 * engine has never played a rated pool.
 */

const ACCENT = "#3ddc84";
const CHOSEN = "rgba(61, 220, 132, 0.34)";
const DIM = "rgba(148, 163, 184, 0.18)";
const CHOSEN_LINE_WIDTH = 2.2;

/** The position every run starts from: the lichess daily puzzle carried in
 * the generated corpus. A real tactical position, so depth 2 and depth 4
 * visibly disagree. */
const FEN = chess.puzzle.fen;
const MEDIAN_GAME = chess.length.median;

type Node = { x: number; y: number; angle: number; depth: number };

type Readout = {
  move: string;
  score: number;
  nodes: number;
  ms: number;
  edges: number;
  maxDepth: number;
};

/** Bottom-up radial layout over a pre-order edge list. Pre-order is what the
 * search guarantees and what this depends on: a parent is always numbered —
 * and therefore positioned — before any of its children, so one forward pass
 * places the whole tree with no sorting and no second traversal. */
function layout(edges: TreeEdge[], width: number, height: number) {
  const nodes = new Map<number, Node>();
  nodes.set(0, { x: width / 2, y: height - 22, angle: -Math.PI / 2, depth: 0 });

  const siblings = new Map<number, number>();
  for (const e of edges) siblings.set(e.from, (siblings.get(e.from) ?? 0) + 1);
  const seen = new Map<number, number>();

  const margin = 14;
  const usable = height - margin * 2;
  for (const e of edges) {
    const parent = nodes.get(e.from);
    if (!parent) continue;
    const count = siblings.get(e.from) ?? 1;
    const index = seen.get(e.from) ?? 0;
    seen.set(e.from, index + 1);

    // Fan narrows with depth so deep sub-trees stay legible instead of
    // wrapping over their own parents.
    const spread = (Math.PI * 0.95) / (1 + parent.depth * 0.9);
    const angle = parent.angle + spread * ((index + 0.5) / count - 0.5);
    const len = usable * 0.34 * Math.pow(0.62, parent.depth);
    const x = Math.min(width - margin, Math.max(margin, parent.x + Math.cos(angle) * len));
    const y = Math.min(height - margin, Math.max(margin, parent.y + Math.sin(angle) * len));
    nodes.set(e.to, { x, y, angle, depth: parent.depth + 1 });
  }
  return nodes;
}

/** Which nodes hang off the root move the search actually played. Again one
 * forward pass, again because the edges are pre-order. */
function chosenSubtree(edges: TreeEdge[], move: string) {
  const inLine = new Set<number>();
  for (const e of edges) {
    if (e.from === 0 && e.move === move) inLine.add(e.to);
    else if (inLine.has(e.from)) inLine.add(e.to);
  }
  return inLine;
}

export function ChessSearchLab() {
  const [presetId, setPresetId] = useState<PresetId>("sid2026");
  const [moveNumber, setMoveNumber] = useState(Math.round(MEDIAN_GAME / 2));
  const [busy, setBusy] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const loadTreeRef = useRef<((edges: TreeEdge[], move: string) => void) | null>(null);

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let edges: TreeEdge[] = [];
    let nodes = new Map<number, Node>();
    let inLine = new Set<number>();
    let revealed = 0;
    let elapsed = 0;

    // Growth is a REPLAY of a search that has already finished. `search()` is
    // synchronous, so every edge arrives at once; the worker's batching is
    // only there to keep the structured clone small. Nothing here is live
    // progress, and no progress bar is drawn from it.
    const REPLAY_MS = 1300;

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);

      const limit = Math.min(revealed, edges.length);
      for (let i = 0; i < limit; i++) {
        const e = edges[i];
        const a = nodes.get(e.from);
        const b = nodes.get(e.to);
        if (!a || !b) continue;
        const chosen = inLine.has(e.to);
        // A few thousand edges overlap heavily at depth, so the fill is kept
        // translucent: density then reads as where the search actually spent
        // its budget rather than as a solid blob. The root edge of the played
        // move is the one line drawn opaque.
        if (chosen && e.depth === 0) {
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = CHOSEN_LINE_WIDTH;
        } else {
          ctx.strokeStyle = chosen ? CHOSEN : DIM;
          ctx.lineWidth = chosen ? 1 : 0.6;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const root = nodes.get(0);
      if (root) {
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(root.x, root.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(61, 220, 132, 0.55)";
      ctx.fillText("alpha-beta search tree", 14, 20);
      if (edges.length > 0 && limit < edges.length) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.fillText("replaying the finished search", 14, 38);
      }
    };

    const step = (dtMs: number) => {
      if (edges.length === 0 || revealed >= edges.length) return;
      elapsed += dtMs;
      revealed = Math.ceil((elapsed / REPLAY_MS) * edges.length);
    };

    loadTreeRef.current = (nextEdges, move) => {
      const { width, height } = getSize();
      edges = nextEdges;
      nodes = layout(edges, width, height);
      inLine = chosenSubtree(edges, move);
      elapsed = 0;
      revealed = reduced ? edges.length : 0;
      // Under reduced motion useCanvasLoop has already stopped its rAF loop,
      // so the completed tree has to be painted here, in one pass.
      if (reduced) draw();
    };

    return { step, draw };
  });

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    // A worker left running per lab visit is exactly how a slow memory climb
    // starts. The bench unmounts this pane whenever another tab is selected.
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  const run = () => {
    const engine = engineRef.current;
    if (!engine || busy) return;
    setBusy(true);
    setError(null);
    engine
      .think(FEN, presetId, moveNumber)
      .then((result) => {
        // Identity, not null: React 19's dev double-mount disposes the first
        // engine and immediately installs a second, so a bare null check
        // would let the disposed one's rejection through.
        if (engineRef.current !== engine) return;
        loadTreeRef.current?.(result.tree, result.move);
        setReadout({
          move: result.move,
          score: result.score,
          nodes: result.nodes,
          ms: result.ms,
          edges: result.tree.length,
          maxDepth: result.tree.reduce((m, e) => Math.max(m, e.depth + 1), 0),
        });
        setBusy(false);
      })
      .catch((e: Error) => {
        if (engineRef.current !== engine) return;
        setError(e.message);
        setBusy(false);
      });
  };

  // One run on mount so the pane is never an empty canvas. `run` closes over
  // the current preset and move number, so it is refreshed every render and
  // only *called* once.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    runRef.current();
  }, []);

  const preset = PRESETS[presetId];
  const budget = clockBudget(preset, moveNumber);
  const canvasLabel = readout
    ? `Alpha-beta search tree: ${readout.edges} edges over ${readout.nodes} nodes, ${readout.maxDepth} ply deep. The branch under the played move ${readout.move} is drawn thicker and in green.`
    : "Alpha-beta search tree; no search has run yet.";

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Same picture as Kursi's tree one tab over, different algorithm — and this one is not a
        simulation. Every line below is a real edge from an alpha-beta search running in a Web
        Worker, over the lichess daily puzzle position carried in the generated corpus. The two
        presets are named after ratings he actually held; they set search depth and how often the
        engine settles for the second-best move. They are labels, not a measured strength — this
        engine has never played a rated pool.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" role="img" aria-label={canvasLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted">depth:</span>
            {Object.values(PRESETS).map((p) => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                aria-pressed={presetId === p.id}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                  presetId === p.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                }`}
              >
                {p.depth} ply · calibrated after {p.rating}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 font-mono text-xs text-muted">
            move
            <input
              type="range"
              min={1}
              max={MEDIAN_GAME}
              value={moveNumber}
              onChange={(e) => setMoveNumber(Number(e.target.value))}
              className="h-1 w-32 accent-[#3ddc84]"
              aria-label="Move number — sets the clock budget the search is allowed"
              aria-valuetext={`move ${moveNumber} of a ${MEDIAN_GAME}-move game, ${budget} millisecond budget`}
            />
            <span className="text-zinc-400">
              {moveNumber}/{MEDIAN_GAME} · budget {budget}ms
            </span>
          </label>
          <button
            onClick={run}
            disabled={busy}
            className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-40"
          >
            {busy ? "searching…" : "run search"}
          </button>
          {error && <span className="font-mono text-xs text-red-400">engine error: {error}</span>}
          {readout && !error && (
            <>
              <span className="font-mono text-xs text-zinc-400">
                nodes: {readout.nodes.toLocaleString("en-US")} · edges drawn:{" "}
                {readout.edges.toLocaleString("en-US")} · {readout.maxDepth} ply · {readout.ms}ms
              </span>
              <span className="font-mono text-xs text-accent">
                played {readout.move} ({(readout.score / 100).toFixed(2)})
              </span>
            </>
          )}
          <Link to="/chess" className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent">
            play the engine → the chess room
          </Link>
        </div>
      </div>
    </div>
  );
}
