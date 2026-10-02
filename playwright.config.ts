import { defineConfig } from "@playwright/test";

// Parallel lanes each run their own preview: PLAYWRIGHT_PORT picks the port, 4173 stays the default.
const PORT = process.env.PLAYWRIGHT_PORT ?? "4173";

export default defineConfig({
  testDir: "./e2e",
  /*
   * The suite used to fail two or three tests per full run, a different two or
   * three each time, while every one of them passed alone. Four distinct causes,
   * now each fixed at its source rather than retried over:
   *
   *  - Every spec was counting itself as a visitor. Playwright gives each test
   *    its own context, which the site correctly reads as a new browser, so any
   *    spec that opened /playground incremented the shared ledger that
   *    visitors.spec.ts asserts exact deltas against. e2e/lib/test.ts opts every
   *    spec but that one out. This was the biggest single source.
   *  - Clicks that landed before React hydrated were silently lost, and the
   *    test then waited out its budget for a pane nothing had opened. This was
   *    three separate "flaky" tests with one cause, and raising their timeouts
   *    could never have worked — the click, not the render, was what went
   *    missing. e2e/lib/test.ts's waitForHydration is the fix; offline.spec.ts
   *    additionally re-clicks until the tab reports itself selected.
   *  - [inert] was read one frame after a navigation, scoring the in-flight
   *    moment as a leak (rail.spec.ts polls for the settled state instead).
   *  - The command palette grew a second Loopdown entry and the selector that
   *    matched both was a strict-mode violation, not a flake at all.
   *
   * What is left is genuine load, and workers is the honest lever for it. The
   * WebGL rooms are `ssr: false`, so nothing — not even <title> — exists until
   * their bundle hydrates; five workers driving those against one preview
   * server pushed hydration past the default 5s budgets. They also open five
   * concurrent clients on one remote PartyKit room, which answers a burst of
   * reconnects with "Timed out waiting for playhtml room reset sync" — a real
   * console error, and one no amount of test-side care can prevent.
   *
   * Three workers stops the hydration-budget failures. It does NOT stop the
   * room resets — measured at three workers, one full run in three still hit
   * one — because that error is produced by a server this repo does not host.
   * smoke.spec.ts drops that one message by name and catches every other
   * playhtml error, which is the closest thing to honest available: the site
   * genuinely is fine without the shared layer, and PlayRoom is written to be.
   *
   * Retries stay at 0 locally so a developer sees a flake. CI keeps two as a
   * backstop against a genuinely unavailable PartyKit, which is outside this
   * repo either way.
   */
  workers: 3,
  retries: process.env.CI ? 2 : 0,
  /*
   * CI's runner has no GPU, so every WebGL room renders through SwiftShader on the CPU. With the
   * suite sharded to one worker per runner (lighthouse.yml), 24 tests still failed on run
   * 36847333049. Two were stale data. The other 22, nearly all 30 s timeouts waiting on globe UI,
   * all passed on a laptop at one worker. The budget scales with the renderer, not per spec: 3x on
   * CI, the same ratio as test.slow(). Locally a slow test still fails at the default.
   */
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The globe's cinematic first-visit intro (cameraIntro.ts) plays for any
    // browser that has never seen it, flies the camera, and eats the first
    // ~400ms of input -- covering click targets and keeping the Pune
    // preselection alive underneath. Every globe spec except the one that
    // actually tests the intro (e2e/globe-X5.spec.ts's own describe block)
    // wants a browser that has already seen it, same as a returning visitor.
    // Seeded via storageState (not an addInitScript in every file) so it is
    // the suite-wide default; the intro's own tests opt back in with an
    // empty storageState. Never branch product code on navigator.webdriver --
    // this is a test-harness concern, not a runtime one.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: "cv-siddharth:globe-intro-seen", value: "1" }],
        },
      ],
    },
  },
  webServer: {
    // Run against the production SSR server (`npm run serve` = vite preview
    // --port 4173 --strictPort), not `npm run dev` — dev doesn't full-SSR in
    // this Start version (see Global Constraints), and the prod build is the
    // representative target anyway. Playwright asserts on the post-hydration
    // DOM, which works either way, but prod is honest. reuseExistingServer is
    // false in CI; locally, --strictPort makes a stale 4173 error loudly
    // rather than silently serving a different app.
    command: `${process.env.PLAYWRIGHT_PREBUILT === "1" ? "" : "npm run build && "}npm run serve -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // This covers `npm run build && npm run serve`, not a page load. The build
    // runs eleven generators, several of which fetch over the network, then a
    // full Vite production build: 63s on a warm local machine and materially
    // slower on a cold CI runner. At 180_000 it was sitting on the boundary
    // and failing intermittently — the SAME commit passed on its PR and timed
    // out on main — which reads as a Lighthouse failure in the checks list
    // when Lighthouse never ran at all. Its own assertions are warnings.
    timeout: 420_000,
  },
});
