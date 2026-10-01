import { governed, type GovernedResult, type GovernorOptions } from "./upstream.js";

export type ProxyFeedResult<T> = GovernedResult<T> & { ageMs: number | null; reason?: string };
// Cadence hits remain fresh; failed refreshes keep the governor's stale flag.
const fresh = new Map<string, GovernedResult<unknown>>();
const failures = new Map<string, string>();
export async function proxyFeed<T>(key: string, fetcher: () => Promise<Response>, parse: (text: string) => T, options: GovernorOptions): Promise<ProxyFeedResult<T>> {
  const age = (result: GovernedResult<T>): ProxyFeedResult<T> => ({ ...result, ageMs: result.at === null ? null : Math.max(0, Date.now() - result.at), ...(failures.has(key) ? { reason: failures.get(key) } : {}) });
  const cached = fresh.get(key) as GovernedResult<T> | undefined;
  if (cached?.at !== null && cached?.at !== undefined && Date.now() - cached.at < options.minIntervalMs && Date.now() - cached.at <= options.maxStaleMs) return age(cached);
  const result = await governed(key, async () => {
    try {
      const response = await fetcher();
      failures.set(key, response.ok ? "read" : `http-${response.status}`);
      return response;
    } catch (error) {
      failures.set(key, error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network");
      throw error;
    }
  }, (text) => {
    try {
      const value = parse(text);
      failures.delete(key);
      return value;
    } catch (error) {
      failures.set(key, "parse");
      throw error;
    }
  // Retry failures independently of the successful feed's polling cadence.
  }, { ...options, cooldownMs: Math.min(options.cooldownMs, 30000), maxCooldownMs: Math.min(options.maxCooldownMs, 300000) });
  if (result.value !== null && !result.stale) fresh.set(key, result);
  return age(result);
}
