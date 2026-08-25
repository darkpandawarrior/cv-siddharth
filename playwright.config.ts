import { defineConfig } from "@playwright/test";

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
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    // Run against the production SSR server (`npm run serve` = vite preview
    // --port 4173 --strictPort), not `npm run dev` — dev doesn't full-SSR in
    // this Start version (see Global Constraints), and the prod build is the
    // representative target anyway. Playwright asserts on the post-hydration
    // DOM, which works either way, but prod is honest. reuseExistingServer is
    // false in CI; locally, --strictPort makes a stale 4173 error loudly
    // rather than silently serving a different app.
    command: "npm run build && npm run serve",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
