import { describe, it, expect } from "vitest";
import { facetsForPath, byChronology, isRecovered, dualStamp } from "./facets";
import type { Facet } from "../data/facets";

const f = (over: Partial<Facet>): Facet => ({
  id: "x", label: "X", href: "/x", authored: "2024-01-01",
  discovered: "2024-01-01", paths: ["deep"], kind: "work", ...over,
});

describe("facetsForPath", () => {
  it("keeps only facets that declare the path", () => {
    const all = [f({ id: "a", paths: ["fast"] }), f({ id: "b", paths: ["deep"] })];
    expect(facetsForPath(all, "fast").map((x) => x.id)).toEqual(["a"]);
  });

  it("keeps a facet that declares several paths", () => {
    const all = [f({ id: "a", paths: ["fast", "deep"] })];
    expect(facetsForPath(all, "deep").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("byChronology", () => {
  it("sorts by authored date ascending, not by discovered", () => {
    const all = [
      f({ id: "new", authored: "2026-01-01", discovered: "2026-01-01" }),
      f({ id: "old", authored: "2020-08-14", discovered: "2026-08-05" }),
    ];
    expect(byChronology(all).map((x) => x.id)).toEqual(["old", "new"]);
  });

  it("does not mutate its input", () => {
    const all = [f({ id: "b", authored: "2026-01-01" }), f({ id: "a", authored: "2020-01-01" })];
    byChronology(all);
    expect(all.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("isRecovered", () => {
  it("is true when discovery trails authoring by the gap or more", () => {
    expect(isRecovered(f({ authored: "2020-08-14", discovered: "2026-08-05" }), 2)).toBe(true);
  });

  it("is false for something discovered as it was made", () => {
    expect(isRecovered(f({ authored: "2026-01-01", discovered: "2026-01-05" }), 2)).toBe(false);
  });
});

describe("dualStamp", () => {
  it("renders his own A :: B form for a recovered facet", () => {
    expect(dualStamp(f({ authored: "2020-08-14", discovered: "2026-08-05" }))).toBe(
      "2020-08-14 :: 2026-08-05",
    );
  });

  it("renders a single stamp when nothing was recovered", () => {
    expect(dualStamp(f({ authored: "2026-01-01", discovered: "2026-01-01" }))).toBe("2026-01-01");
  });
});
