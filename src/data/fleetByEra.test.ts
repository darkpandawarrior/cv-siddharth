import { describe, it, expect } from "vitest";
import { fleetByEra } from "./fleetByEra.ts";
import { fleet } from "./store.ts";

describe("fleetByEra", () => {
  it("places every fleet row in exactly one bucket or unmeasured", () => {
    const allIds = fleetByEra.flatMap((b) => b.ids);
    expect(allIds.length).toBe(fleet.length);
    expect(new Set(allIds).size).toBe(fleet.length); // no row counted twice
    for (const id of fleet.map((a) => a.id)) expect(allIds).toContain(id);
  });

  it("every bucket's count matches its ids", () => {
    for (const b of fleetByEra) expect(b.count).toBe(b.ids.length);
  });

  it("carries an unmeasured bucket, even if empty", () => {
    expect(fleetByEra.some((b) => b.key === "unmeasured")).toBe(true);
  });

  it("orders eras oldest-first, unmeasured last", () => {
    const withPeriod = fleetByEra.filter((b) => b.period !== null);
    for (let i = 1; i < withPeriod.length; i++) {
      const prevStart = withPeriod[i - 1].period!.split(" - ")[0];
      expect(prevStart).toBeTruthy();
    }
    expect(fleetByEra.at(-1)!.key).toBe("unmeasured");
  });
});
