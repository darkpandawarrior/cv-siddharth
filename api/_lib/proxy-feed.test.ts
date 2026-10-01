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

it("coalesces callers and serves cadence data with its age", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  const fetcher = vi.fn().mockResolvedValue(new Response("good"));
  const options = { minIntervalMs: 1000, maxStaleMs: 10000, maxBytes: 100, cooldownMs: 21600000, maxCooldownMs: 86400000 };
  const [a, b] = await Promise.all([proxyFeed("coalesced-proxy", fetcher, s => s, options), proxyFeed("coalesced-proxy", fetcher, s => s, options)]);
  expect(a).toMatchObject({ value: "good", stale: false, ageMs: 0 }); expect(b).toEqual(a);
  vi.advanceTimersByTime(500);
  expect(await proxyFeed("coalesced-proxy", fetcher, s => s, options)).toMatchObject({ value: "good", stale: false, ageMs: 500 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("serves young last-good on refresh failure, preserves age in cooldown, and refuses expired data", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("good")).mockResolvedValue(new Response("bad", { status: 429, headers: { "retry-after": "60" } }));
  const options = { minIntervalMs: 1000, maxStaleMs: 10000, maxBytes: 100, cooldownMs: 21600000, maxCooldownMs: 86400000 };
  await proxyFeed("stale-proxy", fetcher, s => s, options);
  vi.advanceTimersByTime(1000);
  expect(await proxyFeed("stale-proxy", fetcher, s => s, options)).toMatchObject({ value: "good", stale: true, ageMs: 1000, reason: "http-429" });
  vi.advanceTimersByTime(1000);
  expect(await proxyFeed("stale-proxy", fetcher, s => s, options)).toMatchObject({ value: "good", stale: true, ageMs: 2000 });
  vi.advanceTimersByTime(9000);
  expect(await proxyFeed("stale-proxy", fetcher, s => s, options)).toMatchObject({ value: null, at: null, ageMs: null, reason: "http-429" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("backs off parse failures rather than hammering malformed feeds", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  const fetcher = vi.fn().mockImplementation(async () => new Response("bad"));
  const options = { minIntervalMs: 1000, maxStaleMs: 10000, maxBytes: 100, cooldownMs: 21600000, maxCooldownMs: 86400000 };
  const parse = () => { throw new Error("secret parse detail"); };
  expect(await proxyFeed("parse-proxy", fetcher, parse, options)).toMatchObject({ value: null, reason: "parse" });
  expect(await proxyFeed("parse-proxy", fetcher, parse, options)).toMatchObject({ value: null, reason: "parse" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30000);
  await proxyFeed("parse-proxy", fetcher, parse, options);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("reports capped or interrupted body reads without exposing response details", async () => {
  const options = { minIntervalMs: 1000, maxStaleMs: 10000, maxBytes: 2, cooldownMs: 1000, maxCooldownMs: 2000 };
  const parse = vi.fn(s => s);
  const result = await proxyFeed("capped-proxy", async () => new Response("private details"), parse, options);
  expect(result).toMatchObject({ value: null, reason: "read" });
  expect(parse).not.toHaveBeenCalled();
});

it("does not let a longer cadence mask expired data", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  const options = { minIntervalMs: 10000, maxStaleMs: 1000, maxBytes: 100, cooldownMs: 1000, maxCooldownMs: 2000 };
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("good")).mockResolvedValue(new Response(null, { status: 503 }));
  await proxyFeed("expired-cadence", fetcher, s => s, options);
  vi.advanceTimersByTime(1001);
  expect(await proxyFeed("expired-cadence", fetcher, s => s, options)).toMatchObject({ value: null, reason: "http-503" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
