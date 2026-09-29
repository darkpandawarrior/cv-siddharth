import { governed, type GovernedResult, type GovernorOptions } from "./upstream.js";
// The governor calls BOTH pacing hits and failed refreshes stale. Preserve
// only successful responses for their cadence; an expired entry never masks
// a refresh error. The governor still owns coalescing and cooldown.
const fresh = new Map<string, GovernedResult<unknown>>();
export async function proxyFeed<T>(key: string, fetcher: () => Promise<Response>, parse: (text: string) => T, options: GovernorOptions): Promise<GovernedResult<T>> {
  const cached = fresh.get(key) as GovernedResult<T> | undefined;
  if (cached?.at !== null && cached?.at !== undefined && Date.now() - cached.at < options.minIntervalMs) return cached;
  const result = await governed(key, fetcher, parse, options);
  if (result.value && !result.stale) fresh.set(key, result);
  return result;
}
