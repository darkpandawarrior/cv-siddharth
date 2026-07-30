import type { SearchResult, TreeEdge } from "./search.ts";
import type { PresetId } from "./calibration.ts";
import type { EngineRequest, EngineResponse } from "./engine.worker.ts";

export type ThinkResult = SearchResult & { ms: number };

export type Engine = {
  think(fen: string, presetId: PresetId, moveNumber?: number): Promise<ThinkResult>;
  /** Subscribe to the real search tree, batch by batch, as the worker sends
   * it. Returns an unsubscribe. */
  onTree(cb: (edges: TreeEdge[]) => void): () => void;
  dispose(): void;
};

/** Creates the worker lazily on call, never at module scope — this module is
 * reachable from an SSR render, where `Worker` does not exist. */
export function createEngine(): Engine {
  // The Vite-native worker form: a `new URL(..., import.meta.url)` literal is
  // what Vite statically detects to emit a separate worker chunk. Inlining or
  // hoisting the URL breaks that detection. No plugin required.
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });

  type Pending = { resolve: (r: ThinkResult) => void; reject: (e: Error) => void; tree: TreeEdge[] };
  const pending = new Map<number, Pending>();
  const listeners = new Set<(edges: TreeEdge[]) => void>();
  let nextId = 1;
  let disposed = false;

  worker.onmessage = (event: MessageEvent<EngineResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    if (message.type === "tree") {
      entry.tree.push(...message.edges);
      for (const cb of listeners) cb(message.edges);
      return;
    }
    pending.delete(message.id);
    if (message.type === "error") entry.reject(new Error(message.message));
    else {
      entry.resolve({
        move: message.move,
        score: message.score,
        nodes: message.nodes,
        ms: message.ms,
        tree: entry.tree,
      });
    }
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "engine worker failed");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  return {
    think(fen, presetId, moveNumber = 1) {
      if (disposed) return Promise.reject(new Error("engine disposed"));
      const id = nextId++;
      return new Promise<ThinkResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, tree: [] });
        const request: EngineRequest = { id, fen, presetId, moveNumber };
        worker.postMessage(request);
      });
    },
    onTree(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      // A worker left running per visit to /chess is exactly how a mysterious
      // memory climb starts. Callers terminate on unmount.
      disposed = true;
      worker.terminate();
      listeners.clear();
      for (const entry of pending.values()) entry.reject(new Error("engine disposed"));
      pending.clear();
    },
  };
}
