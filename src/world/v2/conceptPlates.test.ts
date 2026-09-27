import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { daypartFor, sunPosition, sunTimes } from "../../lib/sky.ts";
import { pickConceptPlate } from "./conceptPlates.ts";

/**
 * P3-01d's own acceptance list. Fixture times reuse spawn.test.ts's
 * `sunAt` convention (reality-spec.md's own fixed clocks): 12:27 -> day,
 * 03:15 -> night, either side of solar noon.
 */
const DAY = "2026-09-24";

function daypartAt(hhmm: string): ReturnType<typeof daypartFor> {
  const d = new Date(`${DAY}T${hhmm}:00+05:30`);
  const sun = sunPosition(d);
  const times = sunTimes(d);
  const morning = d.getTime() < times.solarNoon.getTime();
  return daypartFor(sun.altitudeDeg, morning);
}

const CONCEPT_JSON: Array<{ file: string }> = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../heavy/world/concept/concept.json", import.meta.url)), "utf8"),
);
const CONCEPT_FILES = new Set(CONCEPT_JSON.map((row) => row.file));

describe("pickConceptPlate (M69: Diwali night > rain > night > golden-spawn default)", () => {
  it("2026-09-24 12:27, clear -> 01-golden-spawn", () => {
    const plate = pickConceptPlate({ daypart: daypartAt("12:27"), precipMmH: 0, rain6hMm: 0, festival: null });
    expect(plate.src).toContain("01-golden-spawn");
  });

  it("2026-09-24 03:15, clear -> 02-night-survey", () => {
    const plate = pickConceptPlate({ daypart: daypartAt("03:15"), precipMmH: 0, rain6hMm: 0, festival: null });
    expect(plate.src).toContain("02-night-survey");
  });

  it("2026-09-24 12:27, weather-wet -> 03-monsoon", () => {
    const plate = pickConceptPlate({ daypart: daypartAt("12:27"), precipMmH: 2.4, rain6hMm: 3.1, festival: null });
    expect(plate.src).toContain("03-monsoon");
  });

  it("rain6hMm alone (>= 0.5, precipMmH null) also reads as raining -> 03-monsoon", () => {
    const plate = pickConceptPlate({ daypart: daypartAt("12:27"), precipMmH: null, rain6hMm: 0.5, festival: null });
    expect(plate.src).toContain("03-monsoon");
  });

  it("a Diwali-window night fixture -> 04-diwali", () => {
    const plate = pickConceptPlate({ daypart: "night", precipMmH: 0, rain6hMm: 0, festival: "diwali" });
    expect(plate.src).toContain("04-diwali");
  });

  it("precedence: Diwali wins over rain and night together", () => {
    const plate = pickConceptPlate({ daypart: "night", precipMmH: 5, rain6hMm: 5, festival: "diwali" });
    expect(plate.src).toContain("04-diwali");
  });

  it("precedence: rain wins over night when there is no festival", () => {
    const plate = pickConceptPlate({ daypart: "night", precipMmH: 1.2, rain6hMm: 1.2, festival: null });
    expect(plate.src).toContain("03-monsoon");
  });

  it("precedence: night only, no rain, no festival -> 02-night-survey", () => {
    const plate = pickConceptPlate({ daypart: "night", precipMmH: 0, rain6hMm: 0, festival: null });
    expect(plate.src).toContain("02-night-survey");
  });

  it("every returned plate's caption says 'Concept painting' and carries no em dash", () => {
    const inputs = [
      { daypart: "day" as const, precipMmH: 0, rain6hMm: 0, festival: null },
      { daypart: "night" as const, precipMmH: 0, rain6hMm: 0, festival: null },
      { daypart: "day" as const, precipMmH: 2, rain6hMm: 2, festival: null },
      { daypart: "night" as const, precipMmH: 0, rain6hMm: 0, festival: "diwali" as const },
    ];
    for (const input of inputs) {
      const plate = pickConceptPlate(input);
      expect(plate.caption).toContain("Concept painting");
      expect(plate.caption).not.toContain("—");
      expect(plate.alt).not.toContain("—");
    }
  });

  it("every returned src (and its srcSet sibling) is a real row in heavy/world/concept/concept.json", () => {
    const inputs = [
      { daypart: "day" as const, precipMmH: 0, rain6hMm: 0, festival: null },
      { daypart: "night" as const, precipMmH: 0, rain6hMm: 0, festival: null },
      { daypart: "day" as const, precipMmH: 2, rain6hMm: 2, festival: null },
      { daypart: "night" as const, precipMmH: 0, rain6hMm: 0, festival: "diwali" as const },
    ];
    for (const input of inputs) {
      const plate = pickConceptPlate(input);
      const srcFile = plate.src.split("/").pop()!;
      expect(CONCEPT_FILES.has(srcFile), srcFile).toBe(true);
      const smallFile = plate.srcSet.split(" ")[0].split("/").pop()!;
      expect(CONCEPT_FILES.has(smallFile), smallFile).toBe(true);
    }
  });

  // Break-it (G15): the same precedence function, fed a fixture that must
  // fail a naive "festival-only" implementation — proves rain really is
  // checked, not just fallen through to by accident on these inputs.
  it("break-it: rain with no festival and no night must NOT fall through to golden-spawn", () => {
    const plate = pickConceptPlate({ daypart: "day", precipMmH: 4, rain6hMm: 4, festival: null });
    expect(plate.src).not.toContain("01-golden-spawn");
    expect(plate.src).toContain("03-monsoon");
  });
});
