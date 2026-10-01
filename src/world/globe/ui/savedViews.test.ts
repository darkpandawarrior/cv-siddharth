import { describe, expect, it } from "vitest";
import { decodeSavedViews, savedQuery, validSavedQuery, viewTimeLabel } from "./savedViews.ts";
import type { ShareState } from "../globeUrlState.ts";
const now = Date.UTC(2026, 8, 30, 12);
const state: ShareState = { lat: 20, lon: 30, alt: 26, view: "orbit", timeOffsetMin: 0, layers: ["hazards"], base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [], selectionId: "private-selection" };
const entry = { version: 1, id: "one", name: "Ocean", query: savedQuery(state, now) };

describe("local saved views", () => {
  it("keeps only viewing parameters and pins nonzero time", () => {
    expect(validSavedQuery(entry.query, now)).toBe(true);
    expect(entry.query).not.toContain("sel");
    expect(viewTimeLabel(entry.query, now)).toBe("Current time on restore");
    const query = savedQuery({ ...state, timeOffsetMin: -120 }, now);
    expect(new URLSearchParams(query).get("at")).toBe("2026-09-30T10:00Z");
    expect(viewTimeLabel(query, now + 86400000)).toBe("Past · 2026-09-30 10:00 UTC");
    expect(validSavedQuery(query, now + 31 * 86400000)).toBe(false);
    const future = savedQuery({ ...state, timeOffsetMin: 120 }, now);
    expect(validSavedQuery(future, now)).toBe(true);
    expect(viewTimeLabel(future, now)).toBe("Future · 2026-09-30 14:00 UTC");
  });
  it("rejects malformed, partial, unknown and outdated entries", () => {
    for (const raw of ["{", "{}", "null", '[null,3,"bad"]']) expect(decodeSavedViews(raw, now)).toEqual({ views: [], dropped: true });
    for (const change of [{ version: 2 }, { id: "<script>" }, { name: "x".repeat(81) }, { query: "lat=0" }]) {
      expect(decodeSavedViews(JSON.stringify([{ ...entry, ...change }]), now).views).toEqual([]);
    }
    for (const query of [entry.query + "&lat=20", entry.query + "&live=999", entry.query.replace("hazards", "unknown"), entry.query.replace("VIIRS_SNPP_CorrectedReflectance_TrueColor", "obsolete"), entry.query.replace("lat=20.0000", "lat=999"), entry.query.replace("t=0", "t=-120"), entry.query + "&ov=obsolete:0.50", entry.query.replace("t=0", "at=2026-02-30T12%3A00Z")]) expect(validSavedQuery(query, now)).toBe(false);
  });
  it("drops duplicates and caps the collection at 20 without storing extra fields", () => {
    const raw = JSON.stringify(Array.from({ length: 22 }, (_, i) => ({ ...entry, id: `view-${i}` })));
    const result = decodeSavedViews(raw, now);
    expect(result.views).toHaveLength(20);
    expect(result.dropped).toBe(true);
    expect(decodeSavedViews(JSON.stringify([{ ...entry, liveValue: 999 }]), now).views).toEqual([]);
    expect(decodeSavedViews(JSON.stringify([entry, entry]), now).views).toHaveLength(1);
    expect(decodeSavedViews(null, now)).toEqual({ views: [], dropped: false });
    expect(decodeSavedViews(JSON.stringify([entry]), now)).toEqual({ views: [entry], dropped: false });
  });
});
