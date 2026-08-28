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

/**
 * The whole point of shipping those .wasm bundles is that the site frames them:
 * DeviceMorph on the homepage and every project page's Live target mount an
 * <iframe src="/<app>/index.html"> from this same origin.
 *
 * X-Frame-Options: DENY refuses framing from EVERY origin, this one included.
 * It sat on `/(.*)` for months, so all four live builds were a blank black
 * frame in production while working perfectly in dev, where no such header is
 * served — the failure was invisible to every local check.
 *
 * SAMEORIGIN keeps the clickjacking protection that header is there for: a
 * third-party page still cannot frame this site.
 */
describe("vercel.json framing", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  const xfo = config.headers
    .flatMap((h) => h.headers.map((x) => ({ source: h.source, ...x })))
    .filter((h) => h.key.toLowerCase() === "x-frame-options");

  it("never sends DENY, which would break every live Wasm embed", () => {
    const denies = xfo.filter((h) => h.value.toUpperCase() === "DENY");
    expect(
      denies.map((d) => d.source),
      "X-Frame-Options: DENY blocks same-origin framing too — the live builds go blank",
    ).toEqual([]);
  });

  it("still refuses cross-origin framing", () => {
    expect(xfo.length, "X-Frame-Options disappeared entirely").toBeGreaterThan(0);
    for (const h of xfo) expect(h.value.toUpperCase()).toBe("SAMEORIGIN");
  });
});
