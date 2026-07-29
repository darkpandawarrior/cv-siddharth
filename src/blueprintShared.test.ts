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
  it("allows the whiteboard on any host once a licence key is configured", () => {
    vi.stubEnv("VITE_TLDRAW_LICENSE_KEY", "tldraw-2026-08-12/payload.signature");
    at("https:", "cv-siddharth.vercel.app");
    expect(hasTldrawLicense()).toBe(true);
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
