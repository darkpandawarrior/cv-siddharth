import { describe, it, expect } from "vitest";
import { checkRateLimit, guarded, isAllowedOrigin } from "./guard";

// isAllowedOrigin, clientIp and rateLimitKey keep their full test coverage in
// chat-handler.test.ts (the file they were extracted from) — re-asserting
// every case here would be the exact duplication this extraction exists to
// remove. What's new here is the generic multi-rule engine and the
// endpoint-wrapping HOF built on it.

describe("checkRateLimit (generic engine)", () => {
  it("allows up to max in the window, then rejects with a sane Retry-After", () => {
    const s = new Map<string, number[]>();
    const rules = [{ ms: 60_000, max: 3 }];
    for (let i = 0; i < 3; i++) expect(checkRateLimit("k", 1000 + i, s, rules).allowed).toBe(true);
    const blocked = checkRateLimit("k", 1003, s, rules);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("checks multiple rules and trips whichever is tightest", () => {
    const s = new Map<string, number[]>();
    const rules = [
      { ms: 60_000, max: 5 },
      { ms: 3_600_000, max: 6 },
    ];
    const t0 = 0;
    for (let i = 0; i < 5; i++) expect(checkRateLimit("k", t0 + i, s, rules).allowed).toBe(true);
    // per-minute ceiling hit
    expect(checkRateLimit("k", t0 + 5, s, rules).allowed).toBe(false);
    // window slides past the minute, one more slips in under the per-minute
    // rule but the hourly ceiling (6) is now the one that bites
    expect(checkRateLimit("k", t0 + 61_000, s, rules).allowed).toBe(true);
    expect(checkRateLimit("k", t0 + 62_000, s, rules).allowed).toBe(false);
  });

  it("keys are independent — one bucket never spends another's budget", () => {
    const s = new Map<string, number[]>();
    const rules = [{ ms: 60_000, max: 1 }];
    expect(checkRateLimit("a", 0, s, rules).allowed).toBe(true);
    expect(checkRateLimit("a", 0, s, rules).allowed).toBe(false);
    expect(checkRateLimit("b", 0, s, rules).allowed).toBe(true);
  });
});

describe("guarded()", () => {
  const ok = async () => new Response(JSON.stringify({ hello: true }), { status: 200 });

  it("passes through a same-origin / no-Origin request", async () => {
    const handler = guarded("test-noop", ok);
    const res = await handler(new Request("http://localhost/api/test"));
    expect(res.status).toBe(200);
  });

  it("passes through the site's own origin", async () => {
    const handler = guarded("test-site-origin", ok);
    const res = await handler(
      new Request("http://localhost/api/test", { headers: { origin: "https://cv-siddharth.vercel.app" } }),
    );
    expect(res.status).toBe(200);
  });

  it("403s a foreign Origin", async () => {
    const handler = guarded("test-foreign", ok);
    const res = await handler(
      new Request("http://localhost/api/test", { headers: { origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(403);
  });

  it("429s the request over the rate limit (default: 30/min) and lets 30 through", async () => {
    const handler = guarded("test-rate", ok, [{ ms: 60_000, max: 30 }]);
    const req = () => new Request("http://localhost/api/test", { headers: { "x-real-ip": "9.9.9.9" } });
    let last: Response | undefined;
    for (let i = 0; i < 30; i++) last = await handler(req());
    expect(last!.status).toBe(200);
    const blocked = await handler(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("keeps one endpoint's flood from spending a different endpoint's budget", async () => {
    const a = guarded("endpoint-a", ok, [{ ms: 60_000, max: 1 }]);
    const b = guarded("endpoint-b", ok, [{ ms: 60_000, max: 1 }]);
    const req = () => new Request("http://localhost/api/x", { headers: { "x-real-ip": "1.1.1.1" } });
    expect((await a(req())).status).toBe(200);
    expect((await a(req())).status).toBe(429); // a's bucket is spent
    expect((await b(req())).status).toBe(200); // b's is untouched
  });
});

describe("isAllowedOrigin — sanity that guard.ts owns the same allowlist chat-handler.ts used to", () => {
  it("still allows the site's own origin and localhost", () => {
    expect(isAllowedOrigin("https://cv-siddharth.vercel.app", {})).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", {})).toBe(true);
    expect(isAllowedOrigin("https://evil.example", {})).toBe(false);
  });
});
