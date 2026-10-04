import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The service worker must never sit between a visitor and a Compose/Wasm build.
 * Its own comment says so ("multi-MB binaries break under caching"), but it
 * enforced that with a hand-written list of three app names — and portfolio-app,
 * added months later, was never added to it. The one build the list forgot had
 * its iframe navigation and its 12 MB of Wasm routed through the worker.
 *
 * This is the third time the same shape of bug has landed in this repo: the
 * `isLive` Set in App.tsx and the per-app wasm cache rules in vercel.json both
 * missed portfolio-app for the same reason. The pattern is a suffix now, so it
 * cannot forget the next app — and this test proves that, by checking it
 * against the directories that actually exist rather than against a copy of
 * the same list.
 */
describe("service worker wasm bypass", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const sw = readFileSync(join(root, "public", "sw.js"), "utf8");

  // The Wasm demo builds moved off Vercel onto GitHub Pages (heavy/, see
  // src/lib/assetBase.ts) — the bypass still matters for local dev, where
  // VITE_HEAVY_ASSET_BASE=/ serves them same-origin out of heavy/ again.
  const appDirs = readdirSync(join(root, "heavy"))
    .filter((d) => d.endsWith("-app"))
    .filter((d) => statSync(join(root, "heavy", d)).isDirectory());

  /** The BYPASS array as the worker will actually evaluate it. */
  // Matched to end-of-line, not with a bracket-counting pattern: the regexes
  // inside the array contain their own character classes.
  const bypass: RegExp[] = eval(sw.match(/^const BYPASS = (.+);$/m)![1]);
  const bypassed = (path: string) => bypass.some((re) => re.test(path));

  it("finds the demo apps it is meant to be guarding", () => {
    expect(appDirs.length).toBeGreaterThanOrEqual(4);
  });

  it("bypasses every -app directory, not a hand-kept subset of them", () => {
    const caught = appDirs.filter((d) => !bypassed(`/${d}/index.html`));
    expect(caught, `the service worker intercepts these live builds: ${caught.join(", ")}`).toEqual([]);
  });

  it("bypasses the wasm payloads too, not just the entry HTML", () => {
    const caught = appDirs.filter((d) => !bypassed(`/${d}/abc123.wasm`));
    expect(caught).toEqual([]);
  });

  it("still lets ordinary pages and assets through to the caching logic", () => {
    for (const path of ["/", "/project/gaddi", "/assets/index-abc.js", "/projects/gaddi/screenshots/home.png"]) {
      expect(bypassed(path), `${path} should NOT bypass the service worker`).toBe(false);
    }
  });

  it("still bypasses the streaming chat API", () => {
    expect(bypassed("/api/chat")).toBe(true);
  });
});

/**
 * Audit fix (2026-09-28): GIBS whole-globe imagery is immutable per URL (its
 * TIME param pins the date; the two static layers never change), so a
 * same-day returning visitor should redownload nothing — cache-first, in a
 * dedicated versioned cache, checked BEFORE the same-origin bypass since
 * gibs.earthdata.nasa.gov is cross-origin by design.
 *
 * Same eval-from-source approach as the BYPASS suite above: this is a real
 * Service Worker (`self`, `caches`, `fetch`) that vitest's node environment
 * doesn't provide, so the exact predicate function is extracted out of the
 * committed file and exercised directly rather than re-implemented here,
 * which would only prove the copy agrees with itself.
 */
describe("service worker GIBS cache-first rule", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const sw = readFileSync(join(root, "public", "sw.js"), "utf8");

  const GIBS_HOST = sw.match(/^const GIBS_HOST = "(.+)";$/m)![1];
  const GIBS_MAX = Number(sw.match(/^const GIBS_MAX = (\d+);$/m)![1]);
  const isGibsRequestSrc = sw.match(/^function isGibsRequest\(url\) \{\n {2}return .+;\n\}$/m)![0];
  const isGibsRequest: (url: URL) => boolean = eval(`(${isGibsRequestSrc.replace("function isGibsRequest", "function")})`);

  it("matches a real GIBS WMS GetMap URL", () => {
    expect(isGibsRequest(new URL(`https://${GIBS_HOST}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap`))).toBe(true);
  });

  it("does not match this site's own /api/* routes or an unrelated cross-origin host", () => {
    expect(isGibsRequest(new URL("https://siddharth-pandalai.vercel.app/api/whereami"))).toBe(false);
    expect(isGibsRequest(new URL("https://example.com/wms/epsg4326/best/wms.cgi"))).toBe(false);
  });

  it("does not match a GIBS host on a different, non-WMS path", () => {
    expect(isGibsRequest(new URL(`https://${GIBS_HOST}/some-other-endpoint`))).toBe(false);
  });

  it("caps the GIBS cache at a small, bounded number of entries", () => {
    expect(GIBS_MAX).toBeGreaterThan(0);
    expect(GIBS_MAX).toBeLessThanOrEqual(20);
  });

  it("checks GIBS requests before the same-origin bypass, since they're cross-origin by design", () => {
    const fetchBody = sw.slice(sw.indexOf('self.addEventListener("fetch"'));
    expect(fetchBody.indexOf("isGibsRequest(url)")).toBeLessThan(fetchBody.indexOf("url.origin !== self.location.origin"));
  });

  it("the service worker's VERSION was bumped alongside the new cache (it versions every cache name)", () => {
    expect(sw).toMatch(/^const VERSION = "v2";$/m);
    expect(sw).toContain("`gibs-${VERSION}`");
  });
});
