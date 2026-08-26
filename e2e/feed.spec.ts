import { test, expect } from "./lib/test.ts";
import { writing } from "../src/data/writing.ts";
import { anthologyEntries, unfiledPieces } from "../src/data/anthology.ts";
import { storyOf } from "../src/lib/describes.ts";

test("feed.xml is served as valid Atom, one entry per lesson", async ({ request }) => {
  const res = await request.get("/feed.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect(body).toContain("The Loopdown — Siddharth Pandalai");
  expect(body).toContain('<link href="https://cv-siddharth.vercel.app/feed.xml" rel="self"');
  expect((body.match(/<entry>/g) || []).length).toBe(writing.lessons.length);
});

test("anthology.xml is served, carries every readable piece, and finishes no sentence", async ({ request }) => {
  const res = await request.get("/anthology.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect(body).toContain("The Morkinstar Journals");
  expect(body).toContain('<link href="https://cv-siddharth.vercel.app/anthology.xml" rel="self"');
  // Every entry plus the unfiled work. anthologyFeed.test.ts checks the file on
  // disk; this checks the one the server actually hands out, which is a
  // different question and the one a subscriber experiences.
  expect((body.match(/<entry>/g) || []).length).toBe(anthologyEntries.length + unfiledPieces.length);

  // The wall the world council said needed CODE rather than doctrine: #2300
  // stops mid-sentence because the Directory never finished it, and a feed
  // builder is exactly the machinery that finishes such a sentence. Asserted
  // here against the SERVED bytes, because a correct generator behind a stale
  // or rewritten deploy is the gap this whole guard exists to close.
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const served = squash(body);
  for (const e of anthologyEntries) {
    const story = storyOf(e.body).trim();
    if (/[.!?"'”’)\]]$/.test(story)) continue; // it has an ending; nothing to finish
    expect(served.includes(squash(story).slice(-40)), `${e.slug}: the feed carries the story's last words`).toBe(false);
  }
});

test("home head links the feed and the PWA manifest, and the SW is served", async ({ page, request }) => {
  await page.goto("/");
  // Two Atom feeds, addressed by href rather than by type, because there is no
  // longer exactly one: /feed.xml is The Loopdown's field notes and
  // /anthology.xml is The Morkinstar Journals. They are separate on purpose, a
  // Kotlin coroutine post does not belong next to a page being withdrawn from a
  // burning case, so the bare type selector is a strict-mode violation now and
  // asserting only the first would silently stop checking the second.
  const atom = 'link[rel="alternate"][type="application/atom+xml"]';
  await expect(page.locator(atom)).toHaveCount(2);
  await expect(page.locator(`${atom}[href="/feed.xml"]`)).toHaveAttribute("title", /Loopdown/i);
  await expect(page.locator(`${atom}[href="/anthology.xml"]`)).toHaveAttribute("title", /Morkinstar/i);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
  // The service worker file itself must be reachable at the origin root for
  // registration (public/sw.js -> /sw.js).
  expect((await request.get("/sw.js")).status()).toBe(200);
});
