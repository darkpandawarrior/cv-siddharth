import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { governed, type GovernorOptions } from "./upstream";

const OPT: GovernorOptions = {
  minIntervalMs: 20_000,
  maxStaleMs: 5 * 60_000,
  maxBytes: 256 * 1024,
  cooldownMs: 5_000,
  maxCooldownMs: 60_000,
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const parse = (text: string) => JSON.parse(text) as { n: number };

describe("governed", () => {
  it("coalesces two concurrent callers into one upstream fetch", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 0));
      return jsonResponse({ n: 1 });
    });
    const [a, b] = await Promise.all([
      governed("coalesce-key", fetcher, parse, OPT),
      governed("coalesce-key", fetcher, parse, OPT),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.value).toEqual({ n: 1 });
    expect(b.value).toEqual({ n: 1 });
  });

  it("a 300 KB body is refused by the capped reader", async () => {
    const bigBody = "x".repeat(300 * 1024);
    const fetcher = vi.fn(async () => new Response(bigBody, { status: 200 }));
    const capParse = vi.fn((text: string) => text);
    const result = await governed("cap-key", fetcher, capParse, { ...OPT, maxBytes: 256 * 1024 });
    expect(capParse).not.toHaveBeenCalled();
    expect(result.value).toBeNull();
  });
});

describe("governed cooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("honours Retry-After on 429: no upstream call for 30 s, last-good served stale:true", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ n: 1 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "30" } }))
      .mockResolvedValue(jsonResponse({ n: 2 }));

    const seed = await governed("cooldown-key", fetcher, parse, { ...OPT, minIntervalMs: 0 });
    expect(seed.stale).toBe(false);
    expect(seed.value).toEqual({ n: 1 });

    const afterThrottle = await governed("cooldown-key", fetcher, parse, { ...OPT, minIntervalMs: 0 });
    expect(afterThrottle.stale).toBe(true);
    expect(afterThrottle.value).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000); // 10 s into the 30 s Retry-After window
    const stillCoolingDown = await governed("cooldown-key", fetcher, parse, { ...OPT, minIntervalMs: 0 });
    expect(stillCoolingDown.stale).toBe(true);
    expect(stillCoolingDown.value).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2); // no third upstream call yet

    vi.advanceTimersByTime(21_000); // past the 30 s window
    const afterWindow = await governed("cooldown-key", fetcher, parse, { ...OPT, minIntervalMs: 0 });
    expect(afterWindow.stale).toBe(false);
    expect(afterWindow.value).toEqual({ n: 2 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("backs off with doubling when no Retry-After header is present, capped at maxCooldownMs", async () => {
    const fail = () => new Response(null, { status: 500 });
    const fetcher = vi.fn(async () => fail());
    const opt: GovernorOptions = { ...OPT, minIntervalMs: 0, cooldownMs: 1_000, maxCooldownMs: 4_000 };

    await governed("backoff-key", fetcher, parse, opt); // 1st failure -> cooldown 1000ms
    vi.advanceTimersByTime(1_000);
    await governed("backoff-key", fetcher, parse, opt); // 2nd failure -> cooldown 2000ms
    vi.advanceTimersByTime(1_000); // only 1s in, still cooling down
    const stillCooling = await governed("backoff-key", fetcher, parse, opt);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(stillCooling.value).toBeNull();
  });
});
