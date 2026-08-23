import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every KMP demo app ships multi-megabyte content-hashed .wasm. Three of the
 * four had a year-long immutable cache rule; portfolio-app did not, so its
 * 8.2 MB + 4.1 MB bundles were re-fetched on every visit while its identical
 * siblings were cached.
 *
 * The rules are per-app string literals in vercel.json, which is the same
 * hand-kept-list shape that has bitten this repo repeatedly. A regex covering
 * all of them at once would be neater but Vercel's `(.*)` matches across path
 * separators, so a leading wildcard is a footgun. Explicit rules plus this
 * test is the version that is both correct and cannot silently drift.
 */
describe("vercel.json wasm caching", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  const appDirs = readdirSync(join(root, "public"))
    .filter((d) => d.endsWith("-app"))
    .filter((d) => statSync(join(root, "public", d)).isDirectory());

  it("finds the demo apps it is meant to be guarding", () => {
    expect(appDirs.length).toBeGreaterThanOrEqual(4);
  });

  it("gives every -app directory an immutable wasm cache rule", () => {
    const missing = appDirs.filter(
      (dir) =>
        !config.headers.some(
          (h) =>
            h.source.startsWith(`/${dir}/`) &&
            h.source.endsWith("\\.wasm") &&
            h.headers.some((x) => x.key === "Cache-Control" && x.value.includes("immutable")),
        ),
    );
    expect(missing, `these demo apps re-download their wasm on every visit: ${missing.join(", ")}`).toEqual([]);
  });
});
