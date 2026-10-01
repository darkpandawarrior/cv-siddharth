import { describe, it, expect } from "vitest";
import { retryDelayMs } from "./net.mjs";

const headers = (v) => ({ headers: { get: (k) => (k === "retry-after" ? v : null) } });

describe("retryDelayMs", () => {
  it("honours a numeric Retry-After (seconds), capped at 30s", () => {
    expect(retryDelayMs(headers("2"), 0)).toBe(2000);
    expect(retryDelayMs(headers("9999"), 0)).toBe(30_000);
  });

  it("falls back to exponential backoff with no Retry-After header", () => {
    expect(retryDelayMs(headers(null), 0)).toBe(500);
    expect(retryDelayMs(headers(null), 2)).toBe(2000);
  });

  it("falls back to exponential backoff on a garbage header", () => {
    expect(retryDelayMs(headers("not-a-date"), 1)).toBe(1000);
  });

  it("parses an HTTP-date Retry-After", () => {
    const soon = new Date(Date.now() + 5000).toUTCString();
    const delay = retryDelayMs(headers(soon), 0);
    expect(delay).toBeGreaterThan(3000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
