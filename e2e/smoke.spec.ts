import { test, expect } from "@playwright/test";

const routes = [
  { path: "/", expect: /Senior Android Engineer/i },
  { path: "/resume", expect: /Experience/i },
  { path: "/project/mileway", expect: /mileway/i },
  { path: "/lab", expect: /Lab Bench/i },
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
const EXPECTED_404 = ["/favicon.ico", "/_vercel/speed-insights/"];
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
      errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(r.path, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(r.expect);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
