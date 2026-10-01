import { readFileSync } from 'node:fs';
import { test, expect, waitForHydration } from './lib/test.ts';
import type { Page } from '@playwright/test';

const weather = JSON.parse(readFileSync(new URL('./fixtures/weather-2026-09-24.json', import.meta.url), 'utf8'));
const at = '2026-10-01T00:00:00Z';

async function prepare(page: Page) {
  await page.addInitScript(() => localStorage.setItem('cv-siddharth:globe-intro-seen', '1'));
  await page.clock.setFixedTime(new Date(at));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('https://**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/weather', route => route.fulfill({ json: weather }));
  await page.route('**/api/sun', route => route.fulfill({ json: { image: 'https://api.helioviewer.org/v2/downloadScreenshot/?id=1', observedAt: Date.parse(at) } }));
  await page.route('https://api.helioviewer.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="orange"/></svg>' }));
  for (const [path, json] of Object.entries({
    'json/goes/primary/xrays-6-hour.json': [{ energy: '0.1-0.8nm', flux: 2.5e-7, time_tag: at }],
    'json/goes/primary/integral-protons-6-hour.json': [{ energy: '>=10 MeV', flux: 1, time_tag: at }],
    'products/summary/solar-wind-speed.json': [{ proton_speed: 281, time_tag: at }],
    'products/summary/solar-wind-mag-field.json': [{ bt: 2, bz_gsm: 1, time_tag: at }],
  })) await page.route(`https://services.swpc.noaa.gov/${path}`, route => route.fulfill({ json }));
  await page.goto('/globe');
  await waitForHydration(page);
  await expect(page.locator('[data-globe-stage]')).toHaveAttribute('data-chrome-measured', 'true');
  await expect(page.locator('[data-globe-root] canvas').first()).toBeVisible();
  await expect.poll(() => page.locator('[data-subsolar-probe]').getAttribute('data-globe-r')).not.toBeNull();
  await expect(page.locator('[data-space-weather-status="live"]')).toBeAttached();
}

async function chromeViolations(page: Page) {
  return page.evaluate(() => {
    type Box = { left: number; right: number; top: number; bottom: number };
    const intersect = (a: Box, b: Box): Box => ({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) });
    const painted = (el: Element, box: Box): Box | null => {
      if (!el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) || el.closest('.sr-only,[inert]')) return null;
      let clipped = intersect(box, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) clipped = { ...clipped, left: Math.max(clipped.left, rect.left), right: Math.min(clipped.right, rect.right) };
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) clipped = { ...clipped, top: Math.max(clipped.top, rect.top), bottom: Math.min(clipped.bottom, rect.bottom) };
      }
      return clipped.right - clipped.left > 1 && clipped.bottom - clipped.top > 1 ? clipped : null;
    };
    const escaped: string[] = [];
    for (const card of document.querySelectorAll('[data-globe-inspector],[data-globe-inspector-sheet]')) {
      const bounds = card.getBoundingClientRect(), walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim() || !node.parentElement) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          const visible = painted(node.parentElement, rect);
          if (visible && (visible.left < bounds.left - 1 || visible.right > bounds.right + 1 || visible.top < bounds.top - 1 || visible.bottom > bounds.bottom + 1)) escaped.push(node.textContent.trim());
        }
      }
    }
    const controls = [...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"],[role="tab"],[role="combobox"],[role="slider"]')]
      .map(el => ({ el, box: painted(el, el.getBoundingClientRect()), name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName })).filter(item => item.box);
    const overlaps: string[] = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlap = intersect(a.box!, b.box!);
      if (overlap.right - overlap.left > 1 && overlap.bottom - overlap.top > 1) overlaps.push(`${a.name} / ${b.name}`);
    }
    const probe = document.querySelector<HTMLElement>('[data-subsolar-probe]')!, canvas = document.querySelector('[data-globe-root] canvas')!.getBoundingClientRect();
    const x = canvas.left + Number(probe.dataset.globeX), y = canvas.top + Number(probe.dataset.globeY), r = Number(probe.dataset.globeR);
    const discHits = [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]].map(([dx, dy]) => document.elementFromPoint(x + dx * r, y + dy * r)?.tagName);
    const strayFacts = [...document.querySelectorAll('[data-globe-panel] > ul > li')].filter(el => painted(el, el.getBoundingClientRect())).map(el => el.textContent);
    return { escaped, overlaps, strayFacts, discHits, disc: { x, y, r } };
  });
}

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [360, 740]]) {
  test.describe(`production chrome ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: width < 640, hasTouch: width < 1280, deviceScaleFactor: width < 640 ? 2 : 1, serviceWorkers: 'block' });
    test('first load keeps text contained and controls clear', async ({ page }, info) => {
      await prepare(page);
      // Let asynchronous chrome settle without zooming, dismissing, or selecting.
      await page.waitForTimeout(15_000);
      await page.screenshot({ path: info.outputPath('first-load.png') });
      const result = await chromeViolations(page);
      expect.soft(result.escaped, 'inspector text escapes its card').toEqual([]);
      expect.soft(result.strayFacts, 'standalone inspector facts spill over the starfield').toEqual([]);
      expect.soft(result.overlaps, 'interactive controls overlap').toEqual([]);
      if (width < 640) {
        expect.soft(result.discHits, JSON.stringify(result.disc)).toEqual(Array(5).fill('CANVAS'));
        await expect.soft(page.locator('[data-explore-bar] input')).toBeHidden();
        const header = (await page.locator('header[data-spine="route-header"]').boundingBox())!;
        const chrome = (await page.locator('[data-globe-topbar]').boundingBox())!;
        const viewing = (await page.locator('[data-scene-receipt] summary').boundingBox())!;
        expect.soft(chrome.y + chrome.height - header.y, 'at most two chrome rows').toBeLessThanOrEqual(120);
        expect.soft(result.disc.y - result.disc.r).toBeGreaterThanOrEqual(chrome.y + chrome.height);
        expect.soft(result.disc.y + result.disc.r).toBeLessThanOrEqual(viewing.y);
      }
    });
    test('opened controls and chat remain reachable', async ({ page }) => {
      await prepare(page);
      if (width < 640) {
        await page.locator('[data-globe-search-toggle]').click();
        await expect(page.getByRole('combobox', { name: 'Search places or ask the globe' })).toBeVisible();
        const search = (await page.locator('[data-explore-bar]').boundingBox())!;
        expect(search.x).toBeGreaterThanOrEqual(0);
        expect(search.x + search.width).toBeLessThanOrEqual(width);
        await page.locator('[data-hud-overflow] > summary').click();
        await expect(page.locator('[data-explore-bar] input')).toBeHidden();
        await expect(page.locator('[data-globe-overflow] [data-globe-weather]')).toBeVisible();
        // Lazy siblings may arrive after the HUD; measure their controls once mounted.
        await page.locator('[data-globe-overflow] [data-story-entry-compact]').waitFor({ state: 'visible' });
        await page.locator('[data-globe-overflow] [data-brief-trigger]').waitFor({ state: 'visible' });
        for (const control of await page.locator('[data-globe-overflow] button:visible').all()) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
          expect((await control.getAttribute('aria-label')) || (await control.innerText()).trim()).toBeTruthy();
        }
        for (const name of ['Zoom in', 'Zoom out', 'Tonight on Earth', 'My story', 'Life journey film']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        expect((await chromeViolations(page)).overlaps).toEqual([]);
        await page.getByRole('button', { name: 'Tonight on Earth', exact: true }).click();
        await expect(page.locator('[data-globe-briefing]')).toBeVisible();
        await expect(page.locator('[data-hud-overflow]')).not.toHaveAttribute('open');
        await page.getByRole('button', { name: 'Close briefing', exact: true }).click();
      }
      await expect(page.locator('button.chat-launcher:not([data-globe-chat])')).toBeHidden();
      const ask = page.locator('[data-globe-chat]');
      await expect(ask).toBeVisible();
      if (width < 640) await ask.tap(); else await ask.click();
      await expect(page.getByRole('dialog', { name: 'Panda, Siddharth’s AI assistant', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Ask Panda, or type a slash command', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close chat', exact: true }).click();
      if (width < 640) await ask.tap(); else await ask.click();
      await expect(page.getByRole('combobox', { name: 'Ask Panda, or type a slash command', exact: true })).toBeVisible();
    });
  });
}
