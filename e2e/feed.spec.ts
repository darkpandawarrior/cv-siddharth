import { test, expect } from "@playwright/test";
import { writing } from "../src/data/writing.ts";

test("feed.xml is served as valid Atom, one entry per lesson", async ({ request }) => {
  const res = await request.get("/feed.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect(body).toContain("The Loopdown — Siddharth Pandalai");
  expect(body).toContain('<link href="https://cv-siddharth.vercel.app/feed.xml" rel="self"');
  expect((body.match(/<entry>/g) || []).length).toBe(writing.lessons.length);
});

test("home head links the feed and the PWA manifest, and the SW is served", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="alternate"][type="application/atom+xml"]')).toHaveAttribute("href", "/feed.xml");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
  // The service worker file itself must be reachable at the origin root for
  // registration (public/sw.js -> /sw.js).
  expect((await request.get("/sw.js")).status()).toBe(200);
});
