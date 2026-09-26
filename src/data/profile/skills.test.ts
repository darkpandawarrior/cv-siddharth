import { describe, expect, it } from "vitest";
import { resumeSkills, skills } from "./skills.ts";

// F10: /resume rendered `skills`/`resumeSkills` groups keyed by item text,
// so a repeated item inside one group threw a duplicate-key console error
// instead of just looking redundant. Fail the build on any repeat.
describe.each([
  ["skills", skills],
  ["resumeSkills", resumeSkills],
])("%s has no duplicate items within a group", (_name, groups) => {
  for (const { group, items } of groups) {
    it(`${group} has no repeated item`, () => {
      expect(new Set(items).size).toBe(items.length);
    });
  }
});
