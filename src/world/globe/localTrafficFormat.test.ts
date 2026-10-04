import { describe, it, expect } from "vitest";
import { formatAltitude } from "./localTrafficFormat.ts";

describe("formatAltitude (data.md #1: en-IN grouping, not en-US)", () => {
  it("formats a real-world altitude in en-IN grouping", () => {
    expect(formatAltitude(35_000)).toBe("35,000 ft (height x20 on GLOBE, not to scale)");
  });

  it("diverges from en-US grouping above 1 lakh, where the two conventions actually differ", () => {
    expect(formatAltitude(1_234_567)).toBe("12,34,567 ft (height x20 on GLOBE, not to scale)");
    expect(formatAltitude(1_234_567)).not.toContain("1,234,567");
  });

  it("a null altitude reads 'unknown', not a formatted zero", () => {
    expect(formatAltitude(null)).toBe("unknown");
  });
});
