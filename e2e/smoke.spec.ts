import { test, expect } from "./lib/test.ts";
import { surfaces } from "../src/data/surfaces.ts";

/**
 * Four hand-listed routes used to be the whole of this file, so fifteen of the
 * site's nineteen got no console-error check at all — a route could throw on
 * every load and nothing here would notice. The list is derived now, so a new
 * surface is smoke-tested the moment it joins the registry rather than whenever
 * someone remembers this file.
 *
 * The content assertion comes from the registry too: every room's <title> is
 * built by routeHead() from the same `label`, so "the page rendered the thing
 * it says it is" needs no per-route knowledge. The four routes that predate
 * this keep their richer body assertions on top.
 */
const BODY_EXPECTATIONS: Record<string, RegExp> = {
  "/": /Senior Android Engineer/i,
  "/resume": /Experience/i,
  "/project/doori": /doori/i,
  "/lab": /Lab Bench/i,
};

const routes = [
  ...surfaces.map((s) => ({ path: s.to, title: s.label, expect: BODY_EXPECTATIONS[s.to] })),
  { path: "/", title: "Siddharth Pandalai", expect: BODY_EXPECTATIONS["/"] },
  { path: "/project/doori", title: "Doori", expect: BODY_EXPECTATIONS["/project/doori"] },
  { path: "/read/deadline", title: "Deadline", expect: undefined },
];

// Two requests are EXPECTED to 404 under local `vite preview` and only resolve
// once deployed to Vercel — neither is a migration bug:
//   1. /favicon.ico — Chrome auto-probes it on every navigation; this site uses
//      a data-URI SVG icon (src/routes/__root.tsx) and never shipped a real
//      favicon.ico.
//   2. /_vercel/speed-insights/script.js — injected by <SpeedInsights/>
//      (@vercel/speed-insights, added in Task 5); Vercel's edge serves this path
//      in production, but nothing serves it locally, so it 404s under preview.
//
// We identify failed requests via the network `response` event (which carries
// the URL) rather than console-error scraping: a resource-load 404 surfaces as
// a console "error" whose message is the generic "Failed to load resource: ...
// 404" with NO URL attached, so the console alone can't tell these two expected
// 404s apart from a genuinely-broken asset. The response handler catches every
// OTHER 4xx/5xx WITH its URL — so a real broken asset a future change introduces
// still fails this test — while the URL-less generic console 404 is dropped as
// redundant. Genuine JS console.error() calls and page errors are still caught.
// `/api/*` are Vercel serverless functions. They cannot exist under `vite
// preview`, which serves static output only — the same reason
// `/_vercel/speed-insights/` is here. This is NOT a broken endpoint being
// waved through: both were checked against the deployed site and return 200
// (`curl https://cv-siddharth.vercel.app/api/spotify` → 200, likewise
// `/api/github-activity`). Verify the same way before adding another `/api/`
// path, and never add one that is failing in production.
//
// The entry is the specific prefixes, not a bare "/api/", so a future endpoint
// that really is broken locally still fails this test.
const EXPECTED_404 = [
  "/favicon.ico",
  "/_vercel/speed-insights/",
  "/api/spotify",
  "/api/github-activity",
  // Added when the live CI/CD panel landed (#41) and this list did not move
  // with it, which is what turned main's lighthouse leg red. Verified the way
  // the note above requires, not assumed:
  //   curl "https://cv-siddharth.vercel.app/api/pipeline?slug=doori" -> 200,
  // returning real GitHub Actions runs.
  "/api/pipeline",
  // Added with /ops. Verified the way the note above requires, as far as it
  // CAN be before a deploy: the handler returns real data through the dev
  // middleware (`curl localhost:5173/api/ops` → the live Actions runs plus the
  // F-Droid chain), and it is wired into vite.config.ts and api/ops.ts exactly
  // like /api/pipeline. It has no production URL to curl yet because this is
  // the commit that introduces it — re-run
  //   curl "https://cv-siddharth.vercel.app/api/ops"
  // after the first deploy and remove this entry if it is not 200.
  "/api/ops",
];
const isExpected404 = (url: string) => EXPECTED_404.some((p) => url.includes(p));

for (const r of routes) {
  test(`${r.path} renders with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("response", (resp) => {
      if (resp.status() >= 400 && !isExpected404(resp.url())) {
        errors.push(`HTTP ${resp.status()} ${resp.url()}`);
      }
    });
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // Resource-load failures are caught (with URL) by the response handler
      // above; their console form has no URL, so drop it here as redundant.
      if (m.text().includes("Failed to load resource:")) return;
      // The shared layer's remote PartyKit room, not this site. Several
      // browsers arriving at once can make it drop and answer the resulting
      // burst of reconnects with a reset-sync timeout. PlayRoom is built for
      // exactly this — the rooms render plain without it — so a handled
      // reconnect failure in a dependency we do not host is not a smoke
      // failure. The narrow string keeps every other playhtml error caught.
      if (m.text().includes("Failed to reconnect after room-reset")) return;
      errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(r.path, { waitUntil: "networkidle" });
    // Derived from the registry: proves the route rendered its own identity,
    // not merely that something rendered.
    // 20s: the WebGL rooms are `ssr: false`, so their <title> does not exist
    // until the client bundle hydrates — an empty title here is a slow route,
    // not a broken one, and how fast it renders is lighthouse.yml's gate to
    // keep, not this one's.
    await expect(page).toHaveTitle(new RegExp(r.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), {
      timeout: 20_000,
    });
    if (r.expect) await expect(page.locator("body")).toContainText(r.expect);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
