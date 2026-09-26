// The shared governor for every edge route with a real upstream: in-flight
// coalescing, a module last-good served stale while it's young enough, a
// 429/5xx/timeout cooldown that honours Retry-After, and a capped streaming
// reader. Cut down from godseye's ops-handler pattern to what aircraft (and
// tle, and weather if it wants it) actually need — open-data-spec.md §4.
// Adaptive TTL from rate headers and a disk cache are skipped on purpose:
// neither upstream this repo calls sends rate headers, and the CDN's
// s-maxage + stale-while-revalidate already is the disk cache.

export type GovernorOptions = {
  /** Floor between real upstream calls while last-good is still servable —
   *  politeness pacing, independent of any error backoff. */
  minIntervalMs: number;
  /** How long last-good may be served with `stale: true` before the caller
   *  gets `value: null` instead. */
  maxStaleMs: number;
  /** The capped reader aborts the stream once the body exceeds this. */
  maxBytes: number;
  /** Backoff floor after a 429/5xx/timeout with no Retry-After header. */
  cooldownMs: number;
  /** Backoff ceiling — doubles from cooldownMs up to this. */
  maxCooldownMs: number;
};

export type GovernedResult<T> = { value: T | null; at: number | null; stale: boolean };

type CacheEntry<T> = { value: T; at: number };

type State<T> = {
  lastGood: CacheEntry<T> | null;
  inFlight: Promise<CacheEntry<T>> | null;
  lastAttemptAt: number;
  cooldownUntil: number;
  cooldownMs: number;
};

// One state per governed() key, module-scope — resets on cold start, shared
// by every concurrent caller in the same warm isolate. That sharing IS the
// coalescing: a second caller during an in-flight fetch finds `inFlight` set
// and awaits the same promise instead of issuing its own.
const states = new Map<string, State<unknown>>();

function stateFor<T>(key: string): State<T> {
  let state = states.get(key) as State<T> | undefined;
  if (!state) {
    state = { lastGood: null, inFlight: null, lastAttemptAt: 0, cooldownUntil: 0, cooldownMs: 0 };
    states.set(key, state);
  }
  return state;
}

function applyCooldown<T>(state: State<T>, opt: GovernorOptions, retryAfterHeader: string | null): void {
  const retryAfterS = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  const retryAfterMs = Number.isFinite(retryAfterS) ? retryAfterS * 1000 : null;
  state.cooldownMs = retryAfterMs ?? (state.cooldownMs > 0 ? Math.min(state.cooldownMs * 2, opt.maxCooldownMs) : opt.cooldownMs);
  state.cooldownUntil = Date.now() + state.cooldownMs;
}

/**
 * Reads `res.body` in chunks and refuses (throws) once the total exceeds
 * `maxBytes`, cancelling the stream rather than buffering the rest —
 * godseye's `readResponseJsonCapped`, generalised past JSON. Falls back to
 * `res.text()` only when a runtime hands back a body with no reader (never
 * true for a real edge fetch, only for a hand-built Response in a test).
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`upstream body exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/**
 * `key` namespaces the module state (one governor instance per upstream —
 * "aircraft", "tle", ...). `fetcher` makes the one real call; `parse` turns
 * its capped body text into `T`. See `GovernorOptions` for the knobs.
 */
export function governed<T>(
  key: string,
  fetcher: () => Promise<Response>,
  parse: (text: string) => T,
  opt: GovernorOptions,
): Promise<GovernedResult<T>> {
  const state = stateFor<T>(key);
  const now = Date.now();

  const lastGoodResult = (): GovernedResult<T> => {
    if (state.lastGood && now - state.lastGood.at <= opt.maxStaleMs) {
      return { value: state.lastGood.value, at: state.lastGood.at, stale: true };
    }
    return { value: null, at: null, stale: false };
  };

  if (now < state.cooldownUntil) return Promise.resolve(lastGoodResult());

  if (state.inFlight) {
    return state.inFlight.then(
      (fresh) => ({ value: fresh.value, at: fresh.at, stale: false }),
      () => lastGoodResult(),
    );
  }

  // Pacing floor only applies while there is something fresh enough to serve
  // instead — it must never block the one fetch that would replace an
  // already-expired last-good with real data.
  const haveServableLastGood = state.lastGood !== null && now - state.lastGood.at <= opt.maxStaleMs;
  if (haveServableLastGood && now - state.lastAttemptAt < opt.minIntervalMs) {
    return Promise.resolve(lastGoodResult());
  }

  state.lastAttemptAt = now;
  const attempt = (async (): Promise<CacheEntry<T>> => {
    let res: Response;
    try {
      res = await fetcher();
    } catch (err) {
      applyCooldown(state, opt, null);
      throw err;
    }
    if (!res.ok) {
      applyCooldown(state, opt, res.headers.get("retry-after"));
      throw new Error(`upstream ${key} responded ${res.status}`);
    }
    let text: string;
    try {
      text = await readCapped(res, opt.maxBytes);
    } catch (err) {
      applyCooldown(state, opt, null);
      throw err;
    }
    const value = parse(text);
    state.cooldownMs = 0; // a clean read resets the backoff
    const entry: CacheEntry<T> = { value, at: Date.now() };
    state.lastGood = entry;
    return entry;
  })();

  state.inFlight = attempt;
  return attempt.then(
    (fresh) => ({ value: fresh.value, at: fresh.at, stale: false }),
    () => lastGoodResult(),
  ).finally(() => {
    state.inFlight = null;
  });
}
