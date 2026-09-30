// Split out of BlueprintInstrument.tsx (audit fix, 2026-09-28) so the
// react-refresh/only-export-components lint rule doesn't fire on a
// non-component export living next to a component's default export — its
// own message says exactly this: "Use a new file to share constants or
// functions between components." A single-consumer file like this one
// (BlueprintInstrument.tsx only) has no reason to be pulled into its own
// Rollup chunk the way src/lib/useLiveSignal.ts is (that module is shared by
// a dozen+ components elsewhere in the app, which is WHY Rollup's chunker
// extracts it — see BlueprintInstrument.tsx's own file-header comment on the
// budget this deliberately avoids by not reaching that module at all).
import type { Ops } from "../api/_lib/ops-handler.ts";

/** No `document` in SSR or the plain-node vitest environment — treated as
 *  "visible" there, same fallback useLiveSignal.ts's isHidden() makes. */
function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/**
 * Non-React polling primitive behind BlueprintInstrument.tsx's useOpsPoll
 * (audit fix, 2026-09-28: was a bare setInterval with no visibility
 * awareness, burning a fetch every 2 min in a background tab). Pauses
 * entirely while the tab is hidden and polls immediately on regain — the
 * same visibility contract as P4's shared bus (useLiveSignal.ts's
 * subscribeLiveSignal) — but kept as its own private, single-caller poll
 * rather than actually importing that module (see this file's header).
 * Exported so this exact start/stop/resume behaviour is directly testable
 * without @testing-library/react, same reasoning as useLiveSignal.test.ts.
 */
export function subscribeOpsPoll(
  url: string,
  intervalMs: number,
  onData: (ops: Ops) => void,
  fetchImpl: typeof fetch = fetch,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const poll = () => {
    fetchImpl(url)
      .then((res) => (res.ok ? (res.json() as Promise<Ops>) : Promise.reject(new Error(String(res.status)))))
      .then(onData)
      .catch(() => {});
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (timer || isHidden()) return;
    poll();
    timer = setInterval(poll, intervalMs);
  };
  const onVisibility = () => (isHidden() ? stop() : start());

  start();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stop();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}
