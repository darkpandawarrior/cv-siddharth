import { expect, it } from "vitest";
import { needsStoreProbe, STORE_CACHE_MAX_AGE_MS } from "./store-cache.mjs";

it("renews live evidence while preserving cached historical absences", () => {
  const now = Date.parse("2026-09-23T00:00:00Z");
  const current = { live: true, v: 5, checkedAt: new Date(now).toISOString() };
  expect(needsStoreProbe(undefined, 5, now)).toBe(true);
  expect(needsStoreProbe({ live: false, v: 5 }, 5, now)).toBe(false);
  expect(needsStoreProbe({ live: true, v: 5 }, 5, now)).toBe(true);
  expect(needsStoreProbe(current, 5, now)).toBe(false);
  expect(needsStoreProbe(current, 6, now)).toBe(true);
  expect(needsStoreProbe(current, 5, now + STORE_CACHE_MAX_AGE_MS)).toBe(true);
  expect(needsStoreProbe(current, 5, now - 1)).toBe(true);
});
