import { afterEach, describe, expect, it } from "vitest";
import { resetPlaceResolver, resolvePlace, setPlaceResolver } from "./places.ts";

afterEach(() => resetPlaceResolver());

describe("resolvePlace — default gazetteer", () => {
  it("resolves a known city", () => {
    expect(resolvePlace("Tokyo")).toEqual({ lat: 35.6762, lon: 139.6503, name: "Tokyo" });
  });
  it("is case-insensitive and trims whitespace", () => {
    expect(resolvePlace("  tokyo  ")).toEqual({ lat: 35.6762, lon: 139.6503, name: "Tokyo" });
  });
  it("resolves an alias", () => {
    expect(resolvePlace("nyc")).toEqual({ lat: 40.7128, lon: -74.006, name: "New York" });
  });
  it("resolves a country by name and by ISO2", () => {
    expect(resolvePlace("Japan")?.name).toBe("Japan");
    expect(resolvePlace("jp")?.name).toBe("Japan");
  });
  it("returns null for a place it doesn't know", () => {
    expect(resolvePlace("Nowhereville Prime")).toBeNull();
  });
});

describe("setPlaceResolver — the explore lane's seam", () => {
  it("swaps the active resolver", () => {
    setPlaceResolver({ resolve: () => ({ lat: 1, lon: 2, name: "Stub Place" }) });
    expect(resolvePlace("anything")).toEqual({ lat: 1, lon: 2, name: "Stub Place" });
  });
  it("resetPlaceResolver restores the built-in gazetteer", () => {
    setPlaceResolver({ resolve: () => null });
    resetPlaceResolver();
    expect(resolvePlace("Tokyo")?.name).toBe("Tokyo");
  });
});
