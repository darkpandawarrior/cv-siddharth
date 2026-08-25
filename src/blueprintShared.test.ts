import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTldrawLicense } from "./blueprintShared.tsx";

/* The gate that decides whether Sketch mode is offered at all. Worth a test
 * because its failure mode is invisible in every environment a test normally
 * runs in: tldraw treats loopback hosts *and any non-https origin* as
 * development and skips its licence check there, so a broken gate looks
 * perfectly healthy on a dev machine, in `vite preview` and in CI — and only
 * blanks the canvas on the real domain, five seconds in.
 *
 * The pairs below mirror LicenseManager.getIsDevelopment(). If tldraw changes
 * that rule, these are what should fail. */

const at = (protocol: string, hostname: string) => vi.stubGlobal("location", { protocol, hostname });

// Every case states its own licence status. Left implicit, the "unlicensed"
// cases silently start passing a real key the moment one lands in .env.local —
// which is exactly what happened here, and would have meant the test asserting
// the opposite of its own name on any machine that had the key.
beforeEach(() => {
  vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hasTldrawLicense", () => {
  it("allows the whiteboard on any host once a VALID licence key is configured", () => {
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "tldraw-2026-08-12/payload.signature");
    at("https:", "cv-siddharth.vercel.app");
    // `now` is injected rather than mocked so the case states the date it is
    // asserting about. This test used to pass a key dated 2026-08-12 with no
    // date at all, which meant it silently became a test about an EXPIRED key
    // on 2026-08-13 while still claiming to prove the licensed path.
    expect(hasTldrawLicense(new Date("2026-08-01T00:00:00Z"))).toBe(true);
  });

  it("refuses an EXPIRED key, because offering the mode is worse than hiding it", () => {
    // With no key, Sketch is never offered on https and a visitor loses
    // nothing. With an expired one, the site advertised a mode tldraw then
    // killed: verified live on 2026-08-24, the editor mounted at 2.5s and was
    // gone by 6.5s. Degrading to "not offered" is the honest failure.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "tldraw-2026-08-12/payload.signature");
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-24T00:00:00Z"))).toBe(false);
  });

  it("accepts a real-shaped key that has not expired yet", () => {
    // The shape tldraw actually issues, confirmed against their own licence
    // email: `tldraw-YYYY-MM-DD/<base64 payload>.<signature>`. This asserts
    // the replacement Hobby key will be accepted the moment it is pasted into
    // VITE_TLDRAW_LICENSE_KEY on Vercel, with no code change — the failure
    // mode worth guarding is a parser that only ever saw the expired one.
    vi.stubEnv(
      "VITE_TLDRAW_LICENSE_KEY",
      "tldraw-2027-08-12/WyJqM2tNS3Y3cSIsWyIqIl0sMTYsIjIwMjctMDgtMTIiXQ.scQXXsignature",
    );
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-24T00:00:00Z"))).toBe(true);
  });

  it("trusts a key whose shape it cannot parse", () => {
    // tldraw may change its format. Rejecting something unreadable would
    // disable a mode that would have worked.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "some-future-format-key");
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  /* The Hobby key's shape: an annual licence carrying tldraw's watermark
   * (flags 1|8), scoped to a domain rather than "*". Every case below reads
   * the signed payload — the date in the `tldraw-.../` prefix is decoration,
   * and these are the cases where believing it gets the answer wrong. */
  it("accepts a domain-scoped, watermarked Hobby key on the domain it names", () => {
    vi.stubEnv(
      "VITE_TLDRAW_LICENSE_KEY",
      "tldraw-2026-08-25/WyJob2JieTAxIixbImN2LXNpZGRoYXJ0aC52ZXJjZWwuYXBwIl0sOSwiMjAyNy0wOC0yNSJd.sig",
    );
    at("https:", "cv-siddharth.vercel.app");
    // The prefix date is 2026-08-25 and `now` is after it: reading the prefix
    // would hide Sketch on the very day the Hobby key was installed. The
    // payload expires 2027-08-25 and is what tldraw actually enforces.
    expect(hasTldrawLicense(new Date("2026-12-01T00:00:00Z"))).toBe(true);
  });

  it("refuses a domain-scoped key on a host it does not cover", () => {
    // Vercel gives every preview build its own hostname. A key scoped to the
    // apex domain is invalid there, so offering Sketch would advertise a
    // canvas tldraw kills five seconds in.
    vi.stubEnv(
      "VITE_TLDRAW_LICENSE_KEY",
      "tldraw-2026-08-25/WyJob2JieTAxIixbImN2LXNpZGRoYXJ0aC52ZXJjZWwuYXBwIl0sOSwiMjAyNy0wOC0yNSJd.sig",
    );
    at("https:", "cv-siddharth-ogxuse0tf-sid-pandalais-projects.vercel.app");
    expect(hasTldrawLicense(new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("keeps an annual key through tldraw's 30-day grace period, and drops it after", () => {
    // getLicenseState() still returns `licensed` for up to 30 days past an
    // annual expiry. The evaluation key had no grace at all, so treating every
    // key like that one would blank a mode that still works.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "tldraw-2026-08-12/WyJob2JieTAxIixbIioiXSw5LCIyMDI2LTA4LTEyIl0.sig");
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-09-05T00:00:00Z"))).toBe(true);
    expect(hasTldrawLicense(new Date("2026-09-30T00:00:00Z"))).toBe(false);
  });

  it("never expires a perpetual key, whose date gates tldraw versions and not the editor", () => {
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "tldraw-2020-01-01/WyJwZXJwMDEiLFsiKiJdLDEwLCIyMDIwLTAxLTAxIl0.sig");
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  /* The REAL Hobby key's shape, signature replaced by a placeholder. Two
   * things about it break assumptions the earlier cases baked in, which is
   * why it gets its own tests rather than a fabricated stand-in. */
  const HOBBY =
    "tldraw-siddharth-pandalai-2027-08-25/WyJGamM2TS1SayIsWyIqLmN2LXNpZGRoYXJ0aC52ZXJjZWwuYXBwIl0sOSwiMjAyNy0wOC0yNSJd.placeholder";

  it("reads the real Hobby key, whose prefix is not a date at all", () => {
    // `tldraw-siddharth-pandalai-2027-08-25/` — the name is in the prefix, so
    // the `tldraw-YYYY-MM-DD/` parser matches nothing and the old gate would
    // have fallen through to "unreadable, trust it". Right answer, no reasoning
    // behind it: it would have trusted an expired key of this shape just as
    // readily. The payload says annual + watermark, expiring 2027-08-25.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", HOBBY);
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-25T00:00:00Z"))).toBe(true);
  });

  it("covers the APEX host from a `*.` glob, the way tldraw's own www retry does", () => {
    // The key is scoped to `*.cv-siddharth.vercel.app`; the site is served from
    // the apex. tldraw builds `.*?.cv-siddharth.vercel.app` — unanchored, dots
    // unescaped — which does NOT match the apex. It matches only because
    // isDomainValid retries every glob against `www.` + hostname. Confirmed by
    // running tldraw's isDomainValid verbatim out of node_modules. Drop that
    // retry and Sketch vanishes from the one domain the licence covers.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", HOBBY);
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-25T00:00:00Z"))).toBe(true);
    at("https:", "www.cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-25T00:00:00Z"))).toBe(true);
  });

  it("does not offer Sketch on a Vercel preview host, which the glob excludes", () => {
    // Per-deploy hostnames fall outside `*.cv-siddharth.vercel.app`, so tldraw
    // would kill the canvas there. Not offering it is the honest outcome.
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", HOBBY);
    at("https:", "cv-siddharth-ogxuse0tf-sid-pandalais-projects.vercel.app");
    expect(hasTldrawLicense(new Date("2026-08-25T00:00:00Z"))).toBe(false);
  });

  it("still expires the real key once its 30-day annual grace is gone", () => {
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", HOBBY);
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense(new Date("2027-09-20T00:00:00Z"))).toBe(true);
    expect(hasTldrawLicense(new Date("2027-10-15T00:00:00Z"))).toBe(false);
  });

  it("allows it unlicensed on the loopback hosts tldraw exempts, https or not", () => {
    for (const [protocol, host] of [
      ["http:", "localhost"],
      ["https:", "localhost"],
      ["http:", "127.0.0.1"],
      ["https:", "[::1]"],
    ]) {
      at(protocol, host);
      expect(hasTldrawLicense(), `${protocol}//${host}`).toBe(true);
    }
  });

  it("allows it unlicensed on any plain-http origin, which tldraw also calls development", () => {
    at("http:", "192.168.1.4");
    expect(hasTldrawLicense()).toBe(true);
  });

  it("refuses it unlicensed on a real https domain — the case that blanks the canvas", () => {
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense()).toBe(false);
  });

  it("is not fooled by a hostname that merely contains a loopback address", () => {
    at("https:", "127.0.0.1.evil.example");
    expect(hasTldrawLicense()).toBe(false);
  });
});
