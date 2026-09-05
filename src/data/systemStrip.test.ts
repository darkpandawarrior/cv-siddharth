import { describe, expect, it } from "vitest";
import { systemStripFor } from "./systemStrip.ts";
import { projects } from "./profile.ts";

describe("systemStripFor", () => {
  it("gives doori a written-up-in group naming real series", () => {
    const groups = systemStripFor("doori");
    const written = groups.find((g) => g.kind === "written-up-in");
    expect(written?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(["sensors-who-lie", "chain-of-custody", "crossing-the-schema"]),
    );
  });

  it("gives gaddi a ships-to group naming its real deployment channels", () => {
    const groups = systemStripFor("gaddi");
    const ships = groups.find((g) => g.kind === "ships-to");
    expect(ships?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["F-Droid", "GitHub Releases", "Headless CLI"]),
    );
  });

  it("never throws and never returns an empty-items group, for any real project slug", () => {
    for (const p of projects) {
      const groups = systemStripFor(p.slug);
      for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("returns [] rather than throwing for an unknown slug", () => {
    expect(systemStripFor("not-a-real-slug")).toEqual([]);
  });
});
