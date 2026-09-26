import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * SP-10 (spine F12, F13): the chat is mounted once from src/routes/__root.tsx
 * via src/ChatLauncher.tsx instead of by hand in 24 files, and the launcher
 * itself is eager while the 1,100-line FloatingChat panel — plus the heavy
 * project/store data it used to drag in through the data/profile.ts barrel —
 * loads only once chat is actually wanted.
 *
 * Real requests, not the manifest: this is the one guarantee the manifest
 * can't give — that the browser never ASKS for the heavy chunks on a cold
 * load of a non-home route, and does ask for the chat panel the moment (and
 * only the moment) its launcher is clicked.
 */

const HEAVY_PATTERNS = [/profile-projects-heavy-/, /store-fleet-heavy-/];
const NOW = "2026-09-24T12:27:00+05:30"; // spine.spec.ts / faq-dock.spec.ts's shared fixed instant

const NO_HEAVY_ROUTES = ["/chess", "/terminal", "/weeb", "/hire"];

for (const path of NO_HEAVY_ROUTES) {
  test(`${path} requests neither profile-projects-heavy nor store-fleet-heavy`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    const urls: string[] = [];
    page.on("request", (req) => urls.push(req.url()));
    await page.goto(path, { waitUntil: "networkidle" });
    await waitForHydration(page);
    const heavyHits = urls.filter((u) => HEAVY_PATTERNS.some((p) => p.test(u)));
    expect(heavyHits, `${path} loaded a heavy chunk it should not reach:\n${heavyHits.join("\n")}`).toEqual([]);
  });
}

test("FloatingChat is not requested until the launcher is clicked, then the panel opens", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  const chatChunkUrls: string[] = [];
  page.on("request", (req) => {
    if (/FloatingChat-/.test(req.url())) chatChunkUrls.push(req.url());
  });
  await page.goto("/chess", { waitUntil: "networkidle" });
  await waitForHydration(page);

  expect(chatChunkUrls, `FloatingChat requested before any click:\n${chatChunkUrls.join("\n")}`).toEqual([]);

  const launcher = page.getByRole("button", { name: "Open chat" });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Panda, Siddharth’s AI assistant" });
  await expect(dialog).toBeVisible();
  expect(chatChunkUrls.length, "clicking the launcher never requested the FloatingChat chunk").toBeGreaterThan(0);
});

// Break-it (G15): a route that still hand-mounted FloatingChat would fail the
// grep half of this lane's acceptance (`grep -rln '<FloatingChat' src`), not
// this spec — this file's own break-it is the inverse of the assertion
// above: if the chunk request happened at load instead of on click, the
// "before any click" check would catch it (verified by temporarily
// re-adding an eager `<FloatingChat/>` mount and confirming this test fails).
