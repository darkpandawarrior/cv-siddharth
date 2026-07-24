import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
