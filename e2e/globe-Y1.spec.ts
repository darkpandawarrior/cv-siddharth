import { readFileSync, writeFileSync } from "node:fs";
import type { Page, Locator } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

const matrix = [
  { width: 1440, height: 900 }, { width: 1024, height: 768 },
  { width: 820, height: 1180 }, { width: 390, height: 844 },
  { width: 360, height: 740 }, { width: 844, height: 390 },
];
const histories = Object.fromEntries(["4.5_month", "2.5_week"].map(name => [name, JSON.parse(readFileSync(new URL(`./fixtures/history/usgs-${name.replace("_", "-")}.geojson`, import.meta.url), "utf8"))]));
const fixtures = Object.fromEntries(Object.entries({ weather: "weather-2026-09-24.json", tle: "tle.json", whereami: "whereami-IN.json" }).map(([key, file]) => [key, JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"))]));
async function openGlobe(page: Page, selection = false, holdExplore?: Promise<void>) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00Z"));
  await page.addInitScript((selected) => {
    localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    if (selected) window.__GLOBE_TEST_SELECT__ = { id: "test:public", kind: "guide-place", title: "Public landmark", rows: [], source: "Test fixture", live: false };
  }, selection);
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (holdExplore && /\/assets\/ExploreBar-[^/]+\.js$/.test(url.pathname)) return holdExplore.then(() => route.continue());
    const history = histories[url.pathname.split("/").pop()!.replace(".geojson", "")];
    if (url.hostname === "earthquake.usgs.gov" && history) return route.fulfill({ json: history });
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    const fixture = fixtures[url.pathname.slice(5)];
    if (fixture) return route.fulfill({ json: fixture });
    return url.pathname.startsWith("/api/") ? route.fulfill({ status: 503, json: { connected: false } }) : route.continue();
  });
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  if (holdExplore) return canvas;
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
  await expect(page.locator("[data-space-weather-status]")).toHaveAttribute("data-space-weather-status", "failed");
  await expect(page.locator("[data-explore-bar]")).toBeAttached();
  await expect(page.locator("[data-globe-stage]")).toHaveAttribute("data-chrome-measured", "true");
  await expect.poll(() => page.locator("[data-subsolar-probe]").getAttribute("data-globe-r")).not.toBeNull();
  if (!selection && !(await page.locator("[data-explore-bar] input").isVisible())) await page.locator("[data-globe-search-toggle]").click();
  return canvas;
}
async function inside(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const b = await locator.boundingBox(), v = page.viewportSize()!;
    return !!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1;
  }).toBe(true);
}
async function composition(page: Page) {
  return page.evaluate(() => {
    const selectors = "[data-globe-topbar] > div > *, [data-explore-bar], [data-globe-inspector], [data-globe-time-scrubber], [data-event-strip], [data-space-weather-status], [data-story-entry], [data-film-entry], [data-story-entry-compact], [data-film-entry-compact], [data-globe-panel]";
    const elements = [...new Set(document.querySelectorAll<HTMLElement>(selectors))].filter(el => el.checkVisibility() && el.getBoundingClientRect().width > 0);
    const painted = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p), box = p.getBoundingClientRect();
        if (/(auto|scroll)/.test(style.overflowY + style.overflowX)) {
          left = Math.max(left, box.left); top = Math.max(top, box.top);
          right = Math.min(right, box.right); bottom = Math.min(bottom, box.bottom);
        }
      }
      return { left, top, right, bottom };
    };
    const boxes = elements.map(el => ({ name: el.getAttribute("aria-label") || Object.keys(el.dataset).join(",") || el.textContent?.slice(0, 50), ...el.getBoundingClientRect().toJSON() }));
    const overlaps: string[] = [], outside: string[] = [];
    const clipped = (el: HTMLElement, rect: DOMRect) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1) return true;
      }
      return rect.top >= -1 && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    };
    elements.forEach((el, i) => {
      const a = painted(el);
      if (!clipped(el, el.getBoundingClientRect())) outside.push(String(boxes[i].name));
      elements.slice(i + 1).forEach((other, offset) => {
        if (el.contains(other) || other.contains(el)) return;
        const b = painted(other);
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) overlaps.push(`${boxes[i].name} / ${boxes[i + offset + 1].name}`);
      });
    });
    return { boxes, overlaps, outside, exploreHeight: document.querySelector("[data-explore-bar]")!.getBoundingClientRect().height };
  });
}
for (const viewport of matrix) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    const touch = viewport.width < 900;
    test.use({ viewport, hasTouch: touch, isMobile: touch });
    test("chrome has no intersections and stays reachable", async ({ page }, info) => {
      await openGlobe(page);
      for (const expanded of [false, ...([1440, 1024].includes(viewport.width) ? [true] : [])]) {
        if (expanded) await page.locator("[data-event-strip]:visible summary").click();
        const report = await composition(page);
        writeFileSync(info.outputPath(expanded ? "expanded.json" : "idle.json"), JSON.stringify(report, null, 2));
        await info.attach(expanded ? "expanded" : "idle", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
        await page.screenshot({ path: info.outputPath(expanded ? "expanded.png" : "idle.png") });
        await expect.poll(async () => (await composition(page)).overlaps).toEqual([]);
        expect(report.outside).toEqual([]);
        const inspector = page.locator("[data-globe-inspector]:visible");
        if (await inspector.count()) {
          expect(await inspector.evaluate(el => {
            const body = el.firstElementChild!, title = body.querySelector("h2")!.getBoundingClientRect(), bounds = body.getBoundingClientRect();
            return title.top >= bounds.top && title.bottom <= bounds.bottom;
          })).toBe(true);
          for (const button of await inspector.locator(":scope > div:last-child button:visible").all()) await inside(button, page);
        }
      }
    });
    if (touch) test("standalone citation links have touch targets", async ({ page }) => {
      await openGlobe(page);
      await page.locator("[data-globe-facts] > summary").click();
      const links = page.locator("[data-globe-root] a:visible");
      expect(await links.count()).toBeGreaterThan(0);
      for (const link of await links.all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
    if (viewport.width < 640 || viewport.height <= 500) {
      test("idle search is compact and clears the globe centre", async ({ page }, info) => {
        const canvas = await openGlobe(page);
        const box = (await page.locator("[data-explore-bar]").boundingBox())!;
        await info.attach("idle-height", { body: JSON.stringify(box), contentType: "application/json" });
        expect(box.height).toBeLessThanOrEqual(104);
        const b = (await canvas.boundingBox())!;
        const probe = page.locator("[data-subsolar-probe]");
        const x = b.x + Number(await probe.getAttribute("data-globe-x")), y = b.y + Number(await probe.getAttribute("data-globe-y"));
        expect(x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height).toBe(false);
        for (const name of ["What's here", "Measure", "Pin points", "Surprise me"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
      });
    }
    if (viewport.width < 640) {
      test("Layers, Time and Inspector sheets have opaque glass", async ({ page }) => {
        await openGlobe(page, true);
        const alpha = (el: HTMLElement) => { const c = getComputedStyle(el).backgroundColor; return c.startsWith("rgba") ? Number(c.split(",")[3].replace(")", "")) : 1; };
        await expect(page.locator("[data-globe-inspector-sheet]")).toBeVisible();
        expect(await page.locator("[data-globe-inspector-sheet]").evaluate(alpha)).toBeGreaterThanOrEqual(.92);
        for (const [name, selector] of [["Open the layers sheet", "[data-globe-layer-sheet]"], ["Open the time sheet", "[data-globe-time-sheet]"]]) {
          await page.getByRole("button", { name, exact: true }).click();
          await expect(page.locator(selector)).toBeVisible();
          expect(await page.locator(selector).evaluate(alpha)).toBeGreaterThanOrEqual(.92);
        }
      });
    }
    if ([1440, 390, 360, 844].includes(viewport.width)) {
      test("briefing is fully visible with room to read", async ({ page }) => {
        await openGlobe(page);
        if (await page.locator("[data-hud-overflow] > summary").isVisible()) await page.locator("[data-hud-overflow] > summary").click();
        await page.getByRole("button", { name: "Tonight on Earth", exact: true }).click();
        const panel = page.locator("[data-globe-briefing]");
        await inside(panel, page);
        expect((await panel.boundingBox())!.height).toBeGreaterThanOrEqual(120);
      });
      test("two pins fit with scrollable readings", async ({ page }) => {
        const canvas = await openGlobe(page);
        const selection = page.locator("[data-globe-inspector]:visible");
        if (await selection.count()) await selection.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "Pin points", exact: true }).click();
        await canvas.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("[data-pinned-point]")).toHaveCount(1);
        await inside(page.locator("[data-pinned-readouts]"), page);
        let point = { x: 0, y: 0 };
        await expect.poll(async () => {
          const hit = await page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>("[data-globe-root] canvas")!, box = canvas.getBoundingClientRect();
            const probe = document.querySelector<HTMLElement>("[data-subsolar-probe]")!.dataset;
            for (const dx of [.7, .85, -.7, -.85]) for (const dy of [0, -.4, .4]) {
              const p = { x: box.x + Number(probe.globeX) + Number(probe.globeR) * dx, y: box.y + Number(probe.globeY) + Number(probe.globeR) * dy };
              if (document.elementFromPoint(p.x, p.y) === canvas) return p;
            }
            return null;
          });
          if (hit) point = hit;
          return hit;
        }).not.toBeNull();
        await page.mouse.click(point.x, point.y);
        await expect(page.locator("[data-pinned-point]")).toHaveCount(2);
        await inside(page.locator("[data-pinned-readouts]"), page);
        const scroll = page.locator("[data-pin-scroll]");
        expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto")).toBe(true);
        await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
        expect(await scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      });
      test("film and story use the shared slot or exclusive sheet", async ({ page }) => {
        await openGlobe(page);
        const compact = viewport.width < 640 || viewport.height <= 500;
        for (const [entry, prefix, exit] of [["Life journey film", "film", "Exit the life journey film"], ["My story", "story", "Exit my story"]]) {
          if (compact) await page.locator("[data-hud-overflow] > summary").click();
          await page.getByRole("button", { name: entry, exact: true }).filter({ visible: true }).click();
          const card = page.locator(`[data-${prefix}-chapter-${compact ? "sheet" : "card"}]`);
          await inside(card, page);
          const explore = page.locator("[data-explore-bar]");
          if (compact) await expect(explore).toBeHidden();
          else {
            const a = (await card.boundingBox())!, b = (await explore.boundingBox())!;
            expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
            expect(await card.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(17, 22, 25, 0.66)");
          }
          await card.getByRole("button", { name: exit, exact: true }).click();
          if (!(await explore.isVisible())) await page.locator("[data-globe-search-toggle]").click();
          await expect(explore).toBeVisible();
          if (compact) {
            await page.locator("[data-hud-overflow] > summary").click();
            await page.getByRole("button", { name: entry, exact: true }).filter({ visible: true }).click();
            await page.getByRole("button", { name: "Open the time sheet", exact: true }).click();
            await expect(card).toBeHidden();
            await page.getByRole("button", { name: "Close the time sheet", exact: true }).click();
            if (!(await explore.isVisible())) await page.locator("[data-globe-search-toggle]").click();
            await expect(explore).toBeVisible();
          }
        }
      });
    }
  });
}

for (const width of [1440, 1024]) {
  test(`desktop room stays sized with the ExploreBar chunk blocked at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const requested = page.waitForRequest(/\/assets\/ExploreBar-[^/]+\.js$/);
    try {
      const canvas = await openGlobe(page, false, held);
      await requested;
      await expect(canvas).toBeAttached();
      await expect(page.locator("[data-explore-bar]")).toHaveCount(0);
      await expect.poll(() => page.locator("[data-globe-root]").evaluate(el => {
        const box = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect();
        return box.height > 0 && Math.abs(box.height - parent.height) <= 1;
      })).toBe(true);
    } finally { release(); }
    await expect(page.locator("[data-explore-bar]")).toBeVisible();
  });
}


test("desktop canvas centre stays exposed at the zoom floor", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
  for (const [key, fixture] of Object.entries({ ...fixtures, aircraft: JSON.parse(readFileSync(new URL("./fixtures/aircraft.json", import.meta.url), "utf8")) })) await page.route(`**/api/${key}`, route => route.fulfill({ json: fixture }));
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toHaveAttribute("data-camera-flying", "false");
  await expect.poll(() => canvas.getAttribute("data-camera-min-distance")).toBeTruthy();
  for (let i = 0; i < 12; i++) {
    const distance = Number(await canvas.getAttribute("data-camera-distance")), minimum = Number(await canvas.getAttribute("data-camera-min-distance"));
    if (distance <= minimum + .05) break;
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(async () => Number(await canvas.getAttribute("data-camera-distance"))).toBeLessThanOrEqual(Math.max(minimum, distance / 1.35) + .05);
  }
  expect(Number(await canvas.getAttribute("data-camera-distance"))).toBeLessThanOrEqual(Number(await canvas.getAttribute("data-camera-min-distance")) + .05);
  const box = (await canvas.boundingBox())!, point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  const hit = await page.evaluate(p => document.elementsFromPoint(p.x, p.y).slice(0, 8).map(el => ({ tag: el.tagName, html: el.outerHTML.slice(0, 400), box: el.getBoundingClientRect().toJSON() })), point);
  writeFileSync(info.outputPath("centre-hit.json"), JSON.stringify({ point, hit }, null, 2));
  await page.screenshot({ path: info.outputPath("centre.png") });
  expect(hit[0].tag).toBe("CANVAS");
});
