import { test, expect } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { surfaces } from "../src/data/surfaces.ts";
import { projects } from "../src/data/profile/projects.ts";

/**
 * Report-only CSP, exercised end to end (arch-L15). The header itself is
 * injected live by vite.config.ts's cspPreviewPlugin from the same
 * src/lib/csp.ts allowlist scripts/gen-csp.mjs bakes into vercel.json for
 * production — see that plugin's docstring for why "live" is load-bearing
 * here, not just "in preview": the inline hydration script this policy
 * hashes embeds a per-render timestamp, so a document's own hash differs
 * every request until routes are prerendered to static HTML.
 *
 * "Zero violations that would have blocked under enforcement" is read from
 * the browser's own `securitypolicyviolation` event — Chromium fires this
 * for a report-only policy exactly as it would for an enforcing one, it just
 * never blocks the load. Catching it via that event (not console scraping)
 * is what makes this test see a violation Chromium logs differently across
 * versions.
 */
const ROUTES = ["/", "/read/deadline", "/project/doori", ...surfaces.map((s) => s.to)];

/** Wires the collector before the first navigation — an init script runs in
 * every document the page subsequently loads, including client-side route
 * changes, so this only needs setting up once per test. */
async function collectViolations(page: Page): Promise<() => string[]> {
  const violations: string[] = [];
  await page.exposeFunction("__cspViolation", (detail: string) => violations.push(detail));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      // @ts-expect-error -- exposed by collectViolations, not a DOM global
      window.__cspViolation(`${e.violatedDirective}: ${e.blockedURI} (${document.location.pathname})`);
    });
  });
  return () => violations;
}

test.describe("report-only CSP", () => {
  for (const path of ROUTES) {
    test(`${path} carries the policy, no unsafe-inline, zero violations`, async ({ page }) => {
      const getViolations = await collectViolations(page);
      const res = await page.goto(path, { waitUntil: "networkidle" });
      const header = res?.headers()["content-security-policy-report-only"];
      expect(header, `${path} shipped no report-only CSP header at all`).toBeTruthy();
      const scriptSrc = header!.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
      expect(scriptSrc, `${path}: no script-src directive in "${header}"`).toBeTruthy();
      expect(scriptSrc, `${path}: script-src still allows 'unsafe-inline'`).not.toContain("'unsafe-inline'");
      expect(getViolations(), `${path} tripped the report-only policy`).toEqual([]);
    });
  }
});

/**
 * The five live device-wall embeds — cross-origin iframes onto GitHub Pages
 * (src/lib/assetBase.ts) — are the one place this site deliberately loads
 * someone else's Wasm runtime inside its own document. frame-src is the
 * directive that gates whether the EMBED is allowed to start loading at all;
 * whatever runs once the iframe's own document takes over is that document's
 * own policy, not this page's, so scrolling to it and waiting is enough to
 * prove the boundary — this test does not depend on the demo build itself
 * being reachable (heavy/ assets publish on their own schedule, separate
 * from this site's deploy) to prove frame-src didn't block the attempt.
 */
const WASM_ROOMS = projects.filter((p) => p.targets?.some((t) => t.liveUrl)).map((p) => p.slug);

test.describe("the Wasm rooms' live embed never trips the policy", () => {
  for (const slug of WASM_ROOMS) {
    test(`/project/${slug}: scrolling to the live embed reports zero violations`, async ({ page }) => {
      test.slow();
      const getViolations = await collectViolations(page);
      await page.goto(`/project/${slug}`);
      await page.getByRole("heading", { name: "One codebase, every surface" }).scrollIntoViewIfNeeded();
      const frame = page.locator('iframe[title="Live web build"]');
      await expect(frame).toBeVisible({ timeout: 30_000 });
      // The runtime instantiating is the point, not just the iframe mounting
      // — give it real time to boot before reading violations, the same
      // budget project-detail.spec.ts's reveal test gives the same load.
      await page.waitForTimeout(5_000);
      expect(getViolations(), `/project/${slug}'s live embed tripped the report-only policy`).toEqual([]);
    });
  }
});
