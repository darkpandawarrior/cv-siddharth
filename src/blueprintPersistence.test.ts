import { describe, it, expect } from "vitest";
import { isBlueprintDb } from "./blueprintPersistence.ts";
import { PERSISTENCE_KEY } from "./blueprintData.ts";

describe("isBlueprintDb", () => {
  it("matches tldraw databases case-insensitively", () => {
    expect(isBlueprintDb("TLDRAW_DOCUMENT_v2")).toBe(true);
    expect(isBlueprintDb("tldraw")).toBe(true);
  });

  it("matches the app persistence key", () => {
    expect(isBlueprintDb(`app-${PERSISTENCE_KEY}`)).toBe(true);
  });

  it("ignores unrelated and empty names", () => {
    expect(isBlueprintDb("firebase-heartbeat")).toBe(false);
    expect(isBlueprintDb(undefined)).toBe(false);
    expect(isBlueprintDb("")).toBe(false);
  });
});
