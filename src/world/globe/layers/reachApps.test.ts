import { describe, it, expect } from "vitest";
import { installFloor, columnHeight, buildAppRing, freshestStoreDate, MIN_HEIGHT, HEIGHT_PER_DECADE, type FleetAppInput } from "./reachApps.ts";
import { fleet, fleetStats } from "../../../data/store.ts";

describe("installFloor", () => {
  it("parses every Play install-band suffix", () => {
    expect(installFloor("100K+")).toBe(100_000);
    expect(installFloor("1M+")).toBe(1_000_000);
    expect(installFloor("500+")).toBe(500);
    expect(installFloor("5+")).toBe(5);
  });

  it("floors unparseable input to 0 rather than throwing", () => {
    expect(installFloor("")).toBe(0);
    expect(installFloor("N/A")).toBe(0);
  });
});

describe("columnHeight", () => {
  it("follows log10 * HEIGHT_PER_DECADE above the floor", () => {
    expect(columnHeight(1_000_000)).toBeCloseTo(6 * HEIGHT_PER_DECADE, 5);
  });

  it("clamps small floors at MIN_HEIGHT, never a near-zero spike", () => {
    expect(columnHeight(5)).toBe(MIN_HEIGHT);
  });
});

describe("buildAppRing", () => {
  const apps: FleetAppInput[] = [
    { id: "a", name: "A", installs: "10K+", side: "rider", rating: null, updated: "x", url: "u" },
    { id: "b", name: "B", installs: "1M+", side: "driver", rating: 4, updated: "x", url: "u" },
    { id: "c", name: "C", installs: "100+", side: "rider", rating: null, updated: "x", url: "u" },
  ];

  it("orders entries by installs, biggest first", () => {
    const ring = buildAppRing(apps);
    expect(ring.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("spreads entries evenly around a full turn, starting at zero", () => {
    const ring = buildAppRing(apps);
    expect(ring[0].angle).toBe(0);
    expect(ring[1].angle).toBeCloseTo((Math.PI * 2) / 3, 5);
    expect(ring[2].angle).toBeCloseTo((Math.PI * 4) / 3, 5);
  });

  // The ring's whole point: it is fleetStats.installFloor broken into one
  // column per app, not a second, independently-sourced number. If a future
  // gen-store.mjs run ever changes how fleetStats.installFloor is computed
  // (say, to include storeApps too) this is the guard that catches the
  // drift -- see this lane's report for the relationship this asserts and
  // why storeApps (his own 3 named apps, not the white-label fleet) is
  // deliberately excluded from the ring.
  it("the real fleet's per-app floors sum to exactly fleetStats.installFloor", () => {
    const sum = fleet.reduce((total, app) => total + installFloor(app.installs), 0);
    expect(sum).toBe(fleetStats.installFloor);
  });
});

describe("freshestStoreDate", () => {
  it("picks the later of the two stamps, either order", () => {
    expect(freshestStoreDate("2026-08-07", "2026-09-24")).toBe("2026-09-24");
    expect(freshestStoreDate("2026-09-24", "2026-08-07")).toBe("2026-09-24");
  });
});
