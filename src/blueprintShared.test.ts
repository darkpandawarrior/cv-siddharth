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
