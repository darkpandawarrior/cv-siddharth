import { describe, it, expect } from "vitest";
import { didYouMean } from "./didYouMean";

describe("didYouMean", () => {
  it("finds a one-typo match within the default distance", () => {
    expect(didYouMean("hlep", ["help", "hire", "projects"])).toBe("help");
  });

  it("finds the closest of several candidates", () => {
    expect(didYouMean("chess", ["chss", "resume", "chest"])).toBe("chss");
  });

  it("returns null when nothing is close enough", () => {
    expect(didYouMean("xyz", ["help", "hire", "projects"])).toBeNull();
  });

  it("respects a caller-supplied max distance", () => {
    expect(didYouMean("hep", ["help"], 1)).toBe("help");
    expect(didYouMean("hlp", ["projects"], 1)).toBeNull();
  });
});
