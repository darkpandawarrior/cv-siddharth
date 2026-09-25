import { describe, expect, it } from "vitest";
import { ledger } from "./ledger.ts";
import mutha from "../../data/osm/mutha.json" with { type: "json" };
import {
  BOUNDS,
  districtAnchors,
  placementCounts,
  RIVER_SCALE_PRIMARY,
  riverPolygonCollides,
  riverWidthAtZ,
  riverX,
  sangamBasin,
  tributaries,
} from "./valley.ts";

const basin = sangamBasin();

describe("tributaries()", () => {
  const rows = tributaries();
  const distinctSources = new Set(
    ledger.systemGraph.edges.filter((e) => e.kind === "includeBuild").map((e) => e.from),
  );

  it("length equals the number of distinct includeBuild sources", () => {
    expect(rows.length).toBe(distinctSources.size);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("every measured edge has water", () => {
    for (const r of rows) {
      if (r.evidence === "measured") expect(r.hasWater).toBe(true);
    }
    // The real committed graph carries only measured includeBuild edges
    // today; this pins that fact so a future declared edge is what first
    // exercises the dry-channel branch, not a change here.
    expect(rows.every((r) => r.evidence === "measured")).toBe(true);
  });

  it("width is modules × 0.1 with a 1.2 m floor, unmeasuredWidth for rows with no projectStats", () => {
    const stats = ledger.projectStats as Record<string, { modules?: number }>;
    for (const r of rows) {
      const modules = stats[r.id]?.modules;
      if (modules == null) {
        expect(r.unmeasuredWidth).toBe(true);
        expect(r.width).toBe(1.2);
      } else {
        expect(r.unmeasuredWidth).toBe(false);
        expect(r.width).toBeCloseTo(Math.max(1.2, modules * 0.1), 6);
      }
    }
  });
});

describe("diyas — G11's fleet niches", () => {
  it("lit === fleetStats.live and dark === fleetStats.delisted", () => {
    const counts = placementCounts();
    expect(counts.diyasLit).toBe(ledger.fleet.stats.live);
    expect(counts.diyasDark).toBe(ledger.fleet.stats.delisted);
  });
});

describe("bells", () => {
  // Deferred: the bell-toran landmark (one bell per PaymentsLab-KMP
  // gateway) is P2-12's own hero-prop script, not owned by this lane
  // (master-plan.json P2-03b acceptance: "bells vs providers skipped with
  // reason until P2-12 lands"). valley.ts exposes no bells field.
  it.skip("bells vs providers — owned by P2-12's landmark script, not this lane", () => {});
});

describe("stepping stones — G6's itemised + cairn reconciliation", () => {
  it("per org equals the real merged count, not just the itemised/curated list", () => {
    const counts = placementCounts();
    // Independent of G6: career-ops-hq's TRUE total is the live-search
    // figure (upstreamMergedPRs), which the curated openSource list
    // under-counts (17 itemised vs 24 real) — proving this reads the
    // reconciled total, not a naive filter().length.
    expect(counts.steppingStonesByOrg["career-ops-hq"]).toBe(ledger.upstreamMergedPRs);
    const curatedOpenMF = ledger.openSource.filter((c) => c.org === "openMF" && c.status === "merged").length;
    expect(counts.steppingStonesByOrg["openMF"]).toBe(curatedOpenMF);
  });
});

describe("kites — G7 lessons + G8 archive", () => {
  it("kites === writing.lessons.length + writing.archive.length", () => {
    expect(placementCounts().kites).toBe(ledger.writing.lessons.length + ledger.writing.archive.length);
  });
});

describe("river shape (open-data-spec §3 A3)", () => {
  it("x(z) === 0 at both ends (the bends are pinned there)", () => {
    expect(riverX(BOUNDS.zMin)).toBeCloseTo(0, 6);
    expect(riverX(basin.z)).toBeCloseTo(0, 6);
  });

  it("a point on the real right bank maps to x < 0", () => {
    // The real bend with the largest positive lateral offset IS the right
    // bank, by the OSM/gen-river-osm.mjs sign convention (perp = downstream
    // rotated -90°, i.e. the flow's own right hand).
    let peak = mutha.bends[0];
    for (const b of mutha.bends) if (b[1] > peak[1]) peak = b;
    expect(peak[1]).toBeGreaterThan(0);
    const z = BOUNDS.zMin + peak[0] * (basin.z - BOUNDS.zMin);
    expect(riverX(z)).toBeLessThan(0);
  });

  it("no real placement (the district anchors) collides with the river polygon", () => {
    const ids = [...new Set(ledger.systemGraph.edges.filter((e) => e.kind === "includeBuild").map((e) => e.from))];
    const anchors = districtAnchors(ids, basin);
    const collided = riverPolygonCollides(anchors, RIVER_SCALE_PRIMARY, basin.z, (z) => riverWidthAtZ(z));
    expect(collided).toBe(false);
  });
});

describe("riverPolygonCollides: the compression fallback actually fires (break-it, G15)", () => {
  it("flags a synthetic anchor planted exactly on the river's own centreline", () => {
    const z = BOUNDS.zMin + 0.27733 * (basin.z - BOUNDS.zMin); // the real amplitude peak (s=0.27733)
    const onRiver = { x: riverX(z), z };
    expect(riverPolygonCollides([onRiver], RIVER_SCALE_PRIMARY, basin.z, (zz) => riverWidthAtZ(zz))).toBe(true);
  });

  it("is not merely a pass-through (a point far from any water reports no collision)", () => {
    const farAway = { x: 10_000, z: 0 };
    expect(riverPolygonCollides([farAway], RIVER_SCALE_PRIMARY, basin.z, (zz) => riverWidthAtZ(zz))).toBe(false);
  });
});
