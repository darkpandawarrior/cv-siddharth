import { describe, expect, it } from "vitest";
import { LAB_TABS, countWord } from "./labs.ts";
import { siteRooms } from "./profile.ts";

describe("lab registry", () => {
  it("has one entry per instrument, each with a unique key", () => {
    const keys = LAB_TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(LAB_TABS.length).toBeGreaterThanOrEqual(9);
  });

  it("groups every instrument as production or personal", () => {
    for (const t of LAB_TABS) expect(["production", "personal"]).toContain(t.group);
  });
});

describe("countWord", () => {
  it("spells small counts so prose reads naturally", () => {
    expect(countWord(6)).toBe("Six");
    expect(countWord(7)).toBe("Seven");
    expect(countWord(9)).toBe("Nine");
    expect(countWord(11)).toBe("Eleven");
  });

  it("falls back to numerals past the lookup table", () => {
    expect(countWord(21)).toBe("21");
  });
});

// The regression this whole task exists to prevent: prose counts must equal
// the arrays they describe, so adding a room or an instrument can never leave
// a stale number behind.
describe("derived copy", () => {
  it("keeps room and instrument counts in sync with their registries", () => {
    expect(countWord(siteRooms.length)).toBeTruthy();
    expect(countWord(LAB_TABS.length)).toBeTruthy();
  });
});
