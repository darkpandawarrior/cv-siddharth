import { test, expect, waitForHydration } from './lib/test.ts';
import type { Page, Locator, TestInfo } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ serviceWorkers: 'block' });

async function open(page: Page, url = '/globe') {
  await page.addInitScript(() => localStorage.setItem('cv-siddharth:globe-intro-seen', '1'));
  await page.clock.setFixedTime(new Date('2026-09-30T12:00:00Z'));
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole('combobox', { name: 'Search places or ask the globe' })).toBeVisible({ timeout: 30_000 });
  // Shared URLs already carry the camera framing; setup must preserve it.
  if (url === '/globe') {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  }
  const pause = page.getByRole('button', { name: "Pause the globe's ambient rotation", exact: true });
  if (await pause.isVisible()) await pause.click();
  const panel = page.getByRole('button', { name: 'Open the layers panel' });
  if (await panel.isVisible()) await panel.click();
}
async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  if (process.env.GLOBE_SHOTS_DIR) {
    await mkdir(process.env.GLOBE_SHOTS_DIR, { recursive: true });
    await copyFile(path, join(process.env.GLOBE_SHOTS_DIR, `${name}.png`));
  }
}
async function target(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
const play = (page: Page) => page.getByRole('button', { name: /^(Play|Pause) simulated time$/ }).filter({ visible: true });

test.describe('W11A desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('native Space activation owns playback; compare owns tour arrows', async ({ page }, info) => {
    await open(page);
    const layer = page.getByRole('button', { name: 'Stars and Moon', exact: true });
    const before = await layer.getAttribute('aria-pressed');
    const label = await page.locator('[data-globe-time-scrubber]').innerText();
    await layer.focus(); await page.keyboard.press('Space');
    await expect(layer).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('[data-globe-time-scrubber]').innerText()).toBe(label);
    await page.getByRole('button', { name: 'Take the tour', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-globe-tour]')).toContainText('2 / 6');
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await page.keyboard.press('Space');
    await expect(play(page)).toHaveAttribute('aria-pressed', 'true');
    await play(page).focus(); await page.keyboard.press('Space');
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    const seam = page.locator('[data-globe-compare-divider]');
    await seam.focus(); const split = await seam.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    await expect(seam).not.toHaveAttribute('aria-valuenow', split!);
    await expect(page.locator('[data-globe-tour]')).toContainText('2 / 6');
    await shot(page, info, 'desktop-compare-tour');
    await page.getByRole('button', { name: 'Exit compare' }).click();
    await page.locator('[data-xray-toggle]').click();
    await expect(page.locator('[data-xray-toggle]')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, info, 'desktop-xray');
  });
  test('all-off layers restore faithfully', async ({ page, context }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clean', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('ly'), { timeout: 2000 }).toBe('');
    const restored = await context.newPage();
    try {
      await open(restored, page.url());
      const layers = restored.locator('[data-globe-layer-panel] ul button[aria-pressed]');
      await expect(layers).toHaveCount(16);
      await expect.poll(() => layers.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-pressed'))))
        .toEqual(Array(16).fill('false'));
    } finally { await restored.close(); }
  });
  test('an absolute eclipse restores faithfully', async ({ page, context }, info) => {
    await open(page);
    await page.getByRole('button', { name: 'Clean', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('ly'), { timeout: 2000 }).toBe('');
    await page.getByRole('button', { name: 'Next eclipse', exact: true }).click();
    const beyond = page.locator('[data-globe-time-scrubber] [data-time-beyond-range]');
    await expect(beyond).toContainText('beyond the slider range');
    const date = await beyond.innerText();
    await expect.poll(() => new URL(page.url()).searchParams.has('at'), { timeout: 2000 }).toBe(true);
    await shot(page, info, 'desktop-eclipse');
    const restored = await context.newPage();
    try {
      await open(restored, page.url());
      await expect(restored.locator('[data-globe-time-scrubber] [data-time-beyond-range]')).toHaveText(date);
    } finally { await restored.close(); }
  });
});

test.describe('W11A touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('phone targets, examples and captured seam drag', async ({ page }, info) => {
    await open(page);
    await target(page.locator('[data-xray-toggle]'));
    await target(page.getByRole('button', { name: /the globe's ambient rotation/ }));
    await target(page.getByRole('button', { name: /the Pune ring and reach columns/ }));
    for (const button of await page.locator('[data-explore-bar] > div').first().getByRole('button').all()) await target(button);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const input = page.getByRole('combobox'); await input.focus();
    await expect(page.getByRole('listbox', { name: 'Commands and places' }).getByRole('option')).toHaveCount(3);
    await shot(page, info, 'phone-examples');
    await page.getByRole('listbox').getByRole('button').first().tap();
    await expect(page.locator('[data-onebox-answer]')).toBeVisible();
    await page.getByRole('button', { name: 'Clear exploration' }).tap();
    await input.focus(); await input.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the time sheet' }).tap();
    await target(page.locator('[data-globe-time-sheet] input[type=range]'));
    await shot(page, info, 'phone-time');
    await page.getByRole('button', { name: 'Compare', exact: true }).filter({ visible: true }).tap();
    const seam = page.locator('[data-globe-compare-divider]');
    await target(seam); await target(page.getByRole('button', { name: 'Exit compare' }));
    const before = await seam.getAttribute('aria-valuenow');
    let lastCamera = '';
    await expect.poll(() => {
      const params = new URL(page.url()).searchParams;
      const camera = `${params.get('lat')}:${params.get('lon')}`;
      const settled = camera === lastCamera; lastCamera = camera; return settled;
    }, { intervals: [600], timeout: 5000 }).toBe(true);
    const camera = new URL(page.url()).searchParams;
    const box = (await seam.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 22, y: 450 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 80, y: 450 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
    await expect(seam).not.toHaveAttribute('aria-valuenow', before!);
    await expect.poll(() => new URL(page.url()).searchParams.get('lat')).toBe(camera.get('lat'));
    expect(new URL(page.url()).searchParams.get('lon')).toBe(camera.get('lon'));
    await shot(page, info, 'phone-compare');
    await page.getByRole('button', { name: 'Exit compare' }).tap();
    await page.getByRole('button', { name: 'Close the time sheet' }).tap();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('W11A tablet coarse targets and compact-row containment', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await open(page);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    info.annotations.push({ type: 'pointer: coarse', description: String(coarse) });
    if (coarse) {
      await target(page.locator('[data-xray-toggle]'));
      await target(page.getByRole('button', { name: /the globe's ambient rotation/ }));
      await target(page.getByRole('button', { name: /the Pune ring and reach columns/ }));
    }
    await shot(page, info, 'tablet-topbar');
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 768 });
      const row = (await page.locator('[data-globe-time-scrubber]').boundingBox())!;
      const band = (await page.locator('[data-explore-bar]').boundingBox())!;
      expect(row.x + row.width <= band.x || row.y + row.height <= band.y || row.y >= band.y + band.height).toBe(true);
      expect(await page.locator('[data-globe-time-scrubber]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  } finally { await context.close(); }
});


test('W11A StreetView pending search stays honest and Back is touch sized', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.panoramax.xyz/api/search?**', async route => {
    await pending;
    await route.fulfill({ json: { features: [] } });
  });
  try {
    await page.getByRole('button', { name: 'Open the layers sheet' }).click();
    await page.getByRole('button', { name: 'Street level at Pune', exact: true }).click();
    await target(page.getByRole('button', { name: 'Back to globe', exact: true }));
    const status = page.locator('[data-street-status]');
    await expect(status).toHaveText('Still looking for streets', { timeout: 10_000 });
    release();
    await expect(status).toHaveText('No streets here');
    await page.getByRole('button', { name: 'Back to globe', exact: true }).click();
    await expect(page.locator('[data-street-view]')).toHaveCount(0);
  } finally { release(); }
});
