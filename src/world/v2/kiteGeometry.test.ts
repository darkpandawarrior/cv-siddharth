import { expect, it } from "vitest";
import { buildKites, buildTetherGeometry } from "./layers/Kites.tsx";

it("every kite tether endpoint is finite before BufferGeometry is built", () => {
  const kites = buildKites();
  for (const kite of kites) {
    expect([kite.x, kite.y, kite.z].every(Number.isFinite), JSON.stringify(kite)).toBe(true);
  }
  const geometry = buildTetherGeometry(kites);
  geometry.computeBoundingSphere();
  expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
  geometry.dispose();
});

import { GRAMMAR } from "./grammar.ts";
import { kiteAltitudeBinding } from "./live/liveBinding.ts";
import { ledger } from "./ledger.ts";

it("build-time kite altitude matches M21's live engagement formula", () => {
  const rule = GRAMMAR.find((r) => r.id === "lesson-kite")!;
  for (const lesson of ledger.writing.lessons) {
    const snapshot = lesson.engagement?.devto;
    const signals = snapshot ? [{ ...snapshot, url: "https://example.com/lesson", publishedAt: "2026-09-24" }] : null;
    const expected = kiteAltitudeBinding(signals, "https://example.com/lesson");
    expect(rule.featureOf(lesson, ledger.writing.lessons).scalar).toBe(expected.altitudeM);
  }
});
