/**
 * fetch, but it always comes back.
 *
 * Every generator that talks to the network used a bare `fetch` with no
 * timeout. They all handle FAILURE carefully — gen-anthology's docstring
 * promises "a flaky network can never blank the writing", and it is right,
 * because a rejected fetch hits its bail() and keeps the previous file.
 *
 * A STALLED connection is not a failure. It never rejects, so bail() never
 * runs, and the generator waits forever. On 2026-08-24 a rate-limited
 * githubusercontent did exactly that and `npm run build` hung past ten
 * minutes with no output — worse than the blanked file the contract was
 * written to prevent, and it would have hung CI too, since lighthouse.yml
 * builds on every pull request.
 *
 * So: a deadline on every request, and a bounded number of tries. A timeout
 * arrives as a rejection, which is the shape every caller already knows how
 * to handle.
 */

/** Long enough for a slow CDN, short enough that a build never looks hung. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * One request with a hard deadline, retried on the failures that are worth
 * retrying. A 404 is an answer and is returned as-is; the caller decides.
 */
export async function fetchWithTimeout(url, init = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      // 429 and 5xx are the ones a second try can fix. Anything else, including
      // a 404, is a real answer and goes back to the caller immediately.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      // AbortSignal.timeout rejects with TimeoutError; name it in the message
      // so a build log says "the network stalled", not "fetch failed".
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    }
  }
  const why = lastError?.name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : lastError?.message ?? "unknown error";
  throw new Error(`fetch ${url} failed: ${why}`);
}
