import { describe, expect, it } from "vitest";
import { buildShareUrl, decodePath, encodePath, KNOWN_LANDMARK_IDS, PATH_SHARE_VERSION } from "./pathShare.ts";

describe("pathShare: round-trip", () => {
  it("encodes then decodes back to the same landmark ids, order preserved", () => {
    const ids = ["bridge", "doori", "gaddi"];
    for (const id of ids) expect(KNOWN_LANDMARK_IDS.has(id)).toBe(true);
    const encoded = encodePath(ids);
    expect(encoded.startsWith(`${PATH_SHARE_VERSION}.`)).toBe(true);
    expect(decodePath(encoded)).toEqual(ids);
  });

  it("round-trips a single id", () => {
    expect(decodePath(encodePath(["stutter"]))).toEqual(["stutter"]);
  });

  it("round-trips an empty list", () => {
    expect(decodePath(encodePath([]))).toEqual([]);
  });
});

describe("pathShare: drops unknown ids", () => {
  it("filters out ids not in the known set while keeping the known ones", () => {
    const encoded = encodePath(["bridge", "not-a-real-landmark", "gaddi"]);
    expect(decodePath(encoded)).toEqual(["bridge", "gaddi"]);
  });

  it("a caller-supplied known-id set overrides the default", () => {
    const encoded = encodePath(["custom-id"]);
    expect(decodePath(encoded, new Set(["custom-id"]))).toEqual(["custom-id"]);
    expect(decodePath(encoded)).toEqual([]); // not in the default set
  });
});

describe("pathShare: malformed input never throws", () => {
  it("no param at all", () => {
    expect(decodePath(null)).toEqual([]);
    expect(decodePath(undefined)).toEqual([]);
    expect(decodePath("")).toEqual([]);
  });

  it("no version separator", () => {
    expect(decodePath("nodothere")).toEqual([]);
  });

  it("decode('2.abc') returns [] (unknown version)", () => {
    expect(decodePath("2.abc")).toEqual([]);
  });

  it("decodes a 2 kB junk param to [] without throwing", () => {
    const junk = `${PATH_SHARE_VERSION}.${"x".repeat(2048)}`;
    expect(() => decodePath(junk)).not.toThrow();
    expect(decodePath(junk)).toEqual([]);
  });

  it("decodes a payload with invalid base64url characters to [] without throwing", () => {
    const junk = `${PATH_SHARE_VERSION}.not*valid!base64@@@`;
    expect(() => decodePath(junk)).not.toThrow();
    expect(decodePath(junk)).toEqual([]);
  });

  it("rejects an over-length payload without attempting to decode it", () => {
    const huge = `${PATH_SHARE_VERSION}.${"A".repeat(20_000)}`;
    expect(() => decodePath(huge)).not.toThrow();
    expect(decodePath(huge)).toEqual([]);
  });
});

describe("pathShare: buildShareUrl", () => {
  it("sets the path param on the given base URL", () => {
    const url = buildShareUrl("https://example.com/playground?world=v2", ["bridge"]);
    const parsed = new URL(url);
    expect(decodePath(parsed.searchParams.get("path"))).toEqual(["bridge"]);
  });
});
