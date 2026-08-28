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

  const appDirs = readdirSync(join(root, "public"))
    .filter((d) => d.endsWith("-app"))
    .filter((d) => statSync(join(root, "public", d)).isDirectory());

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
    for (const path of ["/", "/project/kursi", "/assets/index-abc.js", "/projects/kursi/screenshots/home.png"]) {
      expect(bypassed(path), `${path} should NOT bypass the service worker`).toBe(false);
    }
  });

  it("still bypasses the streaming chat API", () => {
    expect(bypassed("/api/chat")).toBe(true);
  });
});
