/** Remaining freshness window, including feeds that have never polled. */
export function pollDelay(lastPollAt: number | null, cadenceMs: number): number {
  return lastPollAt === null ? 0 : Math.max(0, lastPollAt + cadenceMs - Date.now());
}

/** Pause network work in hidden tabs; resume only when the last poll is due. */
export function startVisibilityPolling(poll: () => Promise<void>, cadenceMs: number): () => void {
  let stopped = false;
  let inFlight = false;
  let lastPollAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const hidden = () => typeof document !== "undefined" && document.hidden;
  const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const schedule = () => {
    clear();
    if (stopped || hidden() || inFlight) return;
    const delay = pollDelay(lastPollAt, cadenceMs);
    if (delay === 0) void run();
    else timer = setTimeout(() => void run(), delay);
  };
  async function run() {
    if (stopped || hidden() || inFlight) return;
    inFlight = true;
    try { await poll(); }
    finally { lastPollAt = Date.now(); inFlight = false; schedule(); }
  }
  const onVisibility = () => { if (hidden()) clear(); else schedule(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  schedule();
  return () => {
    stopped = true;
    clear();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}
