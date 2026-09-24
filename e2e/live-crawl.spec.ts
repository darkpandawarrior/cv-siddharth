import { test, expect } from "./lib/test.ts";
import { surfaces } from "../src/data/surfaces.ts";
import { projects } from "../src/data/profile/projects.ts";

/**
 * The production proof, not the local one.
 *
 * Every other spec in this suite runs against a local `vite preview` server
 * (playwright.config.ts's webServer) — a fair test of the code, but not of
 * what is actually live. This spec is the one that visits the deployed site
 * itself: `BASE_URL=https://siddharth-pandalai.vercel.app npx playwright
 * test e2e/live-crawl.spec.ts`. Without BASE_URL set it falls back to the
 * local preview, which is what makes it runnable (and useful as a smoke
 * check) inside a lane worktree that has no production to hit yet.
 *
 * ROUTE LIST. Derived from the same two registries the site itself renders
 * its wall and its project pages from (src/data/surfaces.ts, projects.ts),
 * the way smoke.spec.ts derives its own list — not a hand-copied count that
 * goes stale the next time a surface or a project joins the registry. `/` and
 * one representative `/read/$slug` are added because neither registry lists
 * them.
 *
 * WHAT "NO CONSOLE ERRORS" MEANS HERE mirrors smoke.spec.ts's handling
 * exactly (a shared PartyKit dependency's own reconnect noise and the
 * response-handler's redundant "Failed to load resource" text are not
 * treated as failures; every other console error and page error is).
 */
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "4173"}`;

const routes = [
  "/",
  ...surfaces.map((s) => s.to),
  ...projects.map((p) => `/project/${p.slug}`),
  "/read/deadline",
];

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

const isNoisyDependencyError = (text: string) =>
  text.includes("Failed to load resource:") || text.includes("Failed to reconnect after room-reset");

for (const path of routes) {
  for (const viewport of VIEWPORTS) {
    test(`${path} at ${viewport.name} — no console errors`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        if (isNoisyDependencyError(m.text())) return;
        errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const url = new URL(path, BASE_URL).toString();
      const response = await page.goto(url, { waitUntil: "networkidle" });
      expect(response?.ok(), `${url} responded ${response?.status()}`).toBe(true);

      await page.screenshot({
        path: testInfo.outputPath(`${path.replace(/\//g, "_") || "_home"}-${viewport.name}.png`),
        fullPage: true,
      });

      expect(errors, `console/page errors on ${url}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
}
