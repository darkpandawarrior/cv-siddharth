import { describe, it, expect } from "vitest";
import { buildPuneSelection, PUNE_SELECTION_ID } from "./puneSelection.ts";
import { REACH_INSTALLS_CLAIM, REACH_UPSTREAM_CLAIM } from "./globeRows.ts";

describe("buildPuneSelection", () => {
  it("carries the id the HUD markers toggle looks for", () => {
    const s = buildPuneSelection();
    expect(s?.id).toBe(PUNE_SELECTION_ID);
  });

  it("never abbreviates a claim - the exact globeRows.ts sentences appear whole", () => {
    const s = buildPuneSelection()!;
    const values = s.rows.map((r) => r.value).join(" | ");
    expect(values).toContain(REACH_INSTALLS_CLAIM);
    expect(values).toContain(REACH_UPSTREAM_CLAIM);
  });

  it("the Reach row says how old the snapshot is, not just its bare date (data.md #6) - appended here, not baked into globeFacts's own static label (that used to be a hydration-mismatch trap, task Z1)", () => {
    const s = buildPuneSelection()!;
    const reach = s.rows.find((r) => r.label === "Reach")!;
    expect(reach.value).toMatch(/\(\d+ weeks? ago\)$/);
  });

  it("is a snapshot, never live (task 4: 'live false')", () => {
    expect(buildPuneSelection()?.live).toBe(false);
  });

  it("every row carries a swatch colour (keys it to the ring/column it describes)", () => {
    const s = buildPuneSelection()!;
    for (const row of s.rows) expect(row.swatch, `row "${row.label}" has no swatch`).toBeTruthy();
  });

  it("focuses the camera on Pune's own coordinates", () => {
    const s = buildPuneSelection()!;
    expect(s.focus).toMatchObject({ kind: "latlon" });
    if (s.focus?.kind === "latlon") {
      expect(s.focus.lat).toBeCloseTo(18.5204, 2);
      expect(s.focus.lon).toBeCloseTo(73.8567, 2);
    }
  });

  // break-it: confirms the guard above actually fires, not a vacuous pass.
  it("break-it: a row missing its claim sentence would fail the whole-sentence check", () => {
    const abridged = "install floor across 88 listings";
    expect(abridged).not.toContain(REACH_INSTALLS_CLAIM);
  });
});
