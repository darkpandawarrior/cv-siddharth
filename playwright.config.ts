import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  /*
   * Retries in CI only, and they are a mitigation, not a fix.
   *
   * The suite is flaky under a FULL run in a way it never is per-spec: run any
   * failing spec alone and it passes. Two causes, both real:
   *
   *  - e2e/visitors.spec.ts drives the shared playhtml room, which is a remote
   *    PartyKit server with no SLA. Its state is not test-local and no amount
   *    of context isolation makes it so. It is the most frequent failure.
   *  - Half the routes now mount WebGL scenes, and one worker running a
   *    hundred tests against a single preview server gets slow enough that
   *    30s budgets start to bite. Two tests that genuinely do heavy work now
   *    declare test.slow() instead of quietly relying on a retry.
   *
   * Local runs keep retries at 0 on purpose: a developer should see the flake.
   * CI gets two, because a gate that goes red at random is a gate everyone
   * learns to ignore, which is worse than not having it. The underlying cause
   * is NOT resolved and this comment is the record that it is outstanding.
   */
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
