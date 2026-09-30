import { describe, it, expect } from "vitest";
import { countryFromHeader, handleWhereami } from "./whereami-handler";

// living-ledger-spec.md §9.1's IP canary: the response body must never look
// like an IPv4 or IPv6 address.
const IP_CANARY = /\d{1,3}(\.\d{1,3}){3}|[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,}/i;

describe("countryFromHeader", () => {
  it("reads the edge country header", () => {
    const req = new Request("http://localhost/api/whereami", { headers: { "x-vercel-ip-country": "IN" } });
    expect(countryFromHeader(req)).toBe("IN");
  });

  it("returns null with no header", () => {
    expect(countryFromHeader(new Request("http://localhost/api/whereami"))).toBeNull();
  });
});

describe("handleWhereami", () => {
  it("header IN -> {country: 'IN'}", async () => {
    const req = new Request("http://localhost/api/whereami", { headers: { "x-vercel-ip-country": "IN" } });
    const res = await handleWhereami(req);
    const body = await res.json();
    expect(body).toEqual({ country: "IN" });
  });

  it("a client-supplied ?country=US is ignored; the header still wins", async () => {
    const req = new Request("http://localhost/api/whereami?country=US", {
      headers: { "x-vercel-ip-country": "IN" },
    });
    const res = await handleWhereami(req);
    const body = await res.json();
    expect(body).toEqual({ country: "IN" });
  });

  it("the response body never matches the IP-shaped canary", async () => {
    const req = new Request("http://localhost/api/whereami", {
      headers: { "x-vercel-ip-country": "IN", "x-forwarded-for": "203.0.113.7" },
    });
    const res = await handleWhereami(req);
    const text = await res.text();
    expect(text).not.toMatch(IP_CANARY);
  });

  it("cache-control is private (never public/shared) with a 1h max-age", async () => {
    // "private": derived from THIS request's own edge-observed country
    // header, so a shared/CDN cache must never serve visitor A's response to
    // visitor B. usePresenceGeo() (presenceGeo.ts) fetches this once per
    // mount and never re-polls, so a 1h browser-side cache costs nothing in
    // freshness and saves a function invocation on a within-the-hour revisit.
    const req = new Request("http://localhost/api/whereami", { headers: { "x-vercel-ip-country": "IN" } });
    const res = await handleWhereami(req);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });
});
