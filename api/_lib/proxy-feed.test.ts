import { afterEach, expect, it, vi } from "vitest";
import { proxyFeed } from "./proxy-feed";
afterEach(() => vi.useRealTimers());
it("serves cadence hits but rejects a failed expired refresh", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T00:00:00Z"));
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("first")).mockResolvedValueOnce(new Response("failed", { status: 503 }));
  const options = { minIntervalMs: 600000, maxStaleMs: 600000, maxBytes: 100, cooldownMs: 600000, maxCooldownMs: 3600000 };
  expect((await proxyFeed("cadence-test", fetcher, (s) => s, options)).value).toBe("first");
  vi.advanceTimersByTime(599999);
  expect((await proxyFeed("cadence-test", fetcher, (s) => s, options)).stale).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2);
  expect((await proxyFeed("cadence-test", fetcher, (s) => s, options)).value).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
