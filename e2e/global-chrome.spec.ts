import { test, expect } from "./lib/test.ts";

/** Document-top mobile launchers and viewport-fixed desktop controls must
 * remain reachable without covering route content.
 */

const MOBILE = { width: 390, height: 844 };

test("the mobile utility row is on-screen and reachable without scrolling", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: /open the command palette/i });
  await expect(trigger).toBeVisible();
  const position = await trigger.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("absolute");
  const box = await trigger.boundingBox();
  expect(box).toBeTruthy();
  // Within the viewport with no scroll — the exact defect was that this
  // button was the literal last element in body, ~24.8k px down on home.
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE.height);
});

test("/hire mounts the chat launcher", async ({ page }) => {
  await page.goto("/hire", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();
});

/** Mobile launchers occupy the reserved document-top utility row. They scroll
 * away with that row, while the route navigation and keyboard shortcuts keep
 * their existing behavior. Content must never enter either launcher footprint.
 */
const ROUTES = ["/", "/anthology", "/shipped", "/chess", "/project/candidai", "/project/stutter", "/map", "/resume"];

for (const path of ROUTES) {
  test(`${path} — chat launcher vs. live content at ${MOBILE.width}px`, async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();
    const collisions = await page.evaluate(() => {
      const fab = document.querySelector('button[aria-label="Open chat"]');
      if (!fab) return ["NO FAB FOUND"];
      const search = document.querySelector('.palette-trigger');
      if (!search) return ["NO SEARCH FOUND"];
      const launcherRects = [fab, search].map(el => el.getBoundingClientRect());
      const ownText = (el: Element) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
      const out: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if ([fab, search].some(launcher => el === launcher || launcher.contains(el) || el.contains(launcher))) continue;
        if (!ownText(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overlap = launcherRects.some(rect => !(r.right <= rect.left || r.left >= rect.right || r.bottom <= rect.top || r.top >= rect.bottom));
        if (overlap) out.push(`<${el.tagName.toLowerCase()} class="${(el.className as string).toString().slice(0, 40)}"> "${(el.textContent ?? "").trim().slice(0, 60)}"`);
      }
      // Outermost offenders only.
      return out.filter((o, _i, all) => !all.some((p) => p !== o && o.startsWith(p.split('"')[0])));
    });
    expect(collisions, `${path}: ${collisions.length} collision(s)`).toEqual([]);
  });
}

test("desktop launchers remain fixed and the mobile chat opens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "networkidle" });
  const chat = page.getByRole("button", { name: "Open chat" });
  await expect(chat).toBeVisible();
  for (const launcher of [chat, page.locator(".palette-trigger")]) {
    expect(await launcher.evaluate(el => getComputedStyle(el).position)).toBe("fixed");
  }
  await page.setViewportSize(MOBILE);
  await chat.click();
  await expect(page.getByRole("dialog", { name: "Panda, Siddharth’s AI assistant" })).toBeVisible();
});
