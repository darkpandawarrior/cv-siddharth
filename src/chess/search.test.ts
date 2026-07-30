import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { search } from "./search.ts";

describe("search", () => {
  it("returns a legal move for the side to play", () => {
    const fen = new Chess().fen();
    const { move } = search(fen, { depth: 2, noise: 0, seed: 1 });
    const board = new Chess(fen);
    expect(board.moves()).toContain(move);
  });

  it("takes a free queen at depth 2", () => {
    // Black queen on d5 is undefended; white pawn on e4 can capture.
    const { move } = search("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", { depth: 2, noise: 0, seed: 1 });
    expect(move).toBe("exd5");
  });

  it("finds mate in one rather than any other move", () => {
    const { move } = search("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", { depth: 3, noise: 0, seed: 1 });
    expect(move).toBe("Ra8#");
  });

  it("is deterministic for a given seed and stochastic across seeds", () => {
    const fen = new Chess().fen();
    const a = search(fen, { depth: 2, noise: 0.5, seed: 7 });
    const b = search(fen, { depth: 2, noise: 0.5, seed: 7 });
    expect(a.move).toBe(b.move);
    const seeds = new Set(
      Array.from({ length: 12 }, (_, i) => search(fen, { depth: 2, noise: 0.5, seed: i }).move),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("emits a tree with parent links for the visualiser", () => {
    const { tree, nodes } = search(new Chess().fen(), { depth: 2, noise: 0, seed: 1 });
    expect(nodes).toBeGreaterThan(0);
    expect(tree.length).toBeGreaterThan(0);
    for (const e of tree) expect(e.from).toBeLessThan(e.to);
  });

  // Beyond the plan: the renderer in Task 12 places a node from its parent, so
  // an edge whose `from` was never introduced would be unplaceable. The edge
  // cap makes that a live risk, which is why the tree is recorded pre-order.
  it("emits no orphan edges even when the tree is truncated", () => {
    const { tree } = search("r1bq1r1k/pp2nppp/2n1p3/3pP3/1b1P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 11", {
      depth: 3,
      noise: 0,
      seed: 1,
    });
    // At the cap (root edges are always kept, so it can sit just over), which
    // is what makes this position exercise truncation rather than assert on a
    // tree that happened to fit.
    expect(tree.length).toBeGreaterThanOrEqual(3_000);
    const seen = new Set([0]);
    for (const e of tree) {
      expect(seen.has(e.from)).toBe(true);
      seen.add(e.to);
    }
  });

  it("handles a position with no legal moves without throwing", () => {
    // Black is checkmated; nothing to search.
    const r = search("7k/5QQ1/8/8/8/8/8/K7 b - - 0 1", { depth: 2, noise: 0, seed: 1 });
    expect(r.move).toBe("");
  });
});
