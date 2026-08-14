// The completeness gate.
//
// Nine finished routes — blueprint, forge, hire, lab, map, pulse, shipped,
// terminal, weeb — sat unlinked from the homepage for months. Not one of them
// was broken; each was simply added to `src/routes/` and never added to
// whichever list would have surfaced it. Nothing failed when that happened, so
// nothing stopped it happening nine times.
//
// This is that failing thing. It is deliberately mechanical: it does not judge
// whether a surface is good, only whether it is *reachable and complete*.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { surfaces, WALL_GROUPS, wallSurfaces, siteRooms } from "./surfaces.ts";
import { facets } from "./facets.ts";
import { SURFACE_ICON } from "../rooms.tsx";

const root = join(import.meta.dirname, "..", "..");

/**
 * Route paths that exist on disk.
 *
 * Derived from the filesystem, never from a list — a hand-kept list is exactly
 * how a route goes unnoticed, which is the bug this file exists to catch.
 * Mirrors the exclusions in scripts/capture-site.mjs.
 */
function routePaths(): string[] {
  return readdirSync(join(root, "src", "routes"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    // __root is layout, $ is the 404, and $-param routes need a param to render.
    .filter((n) => n !== "__root" && n !== "$" && !n.includes("$"))
    // The homepage is where the wall lives; it is not a tile on itself.
    .filter((n) => n !== "index")
    .map((n) => `/${n}`);
}

describe("surfaces ↔ routes", () => {
  it("every route on disk has a surface", () => {
    const covered = new Set(surfaces.map((f) => f.to));
    const orphaned = routePaths().filter((p) => !covered.has(p));
    expect(orphaned, `route(s) with no entry in surfaces.ts — add one or the surface is unreachable from the wall: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("every surface points at a route that exists", () => {
    const real = new Set(routePaths());
    const dangling = surfaces.filter((f) => !real.has(f.to)).map((f) => f.to);
    expect(dangling, `surface(s) pointing at no route file: ${dangling.join(", ")}`).toEqual([]);
  });
});

describe("surface completeness", () => {
  it("declares a poster whenever it promises one", () => {
    const missing = surfaces
      .filter((f) => f.preview !== "none" && !f.poster)
      .map((f) => f.to);
    expect(missing, `preview is "poster"/"live" but no poster basename: ${missing.join(", ")}`).toEqual([]);
  });

  it("has the poster file on disk for every poster it declares", () => {
    const absent = surfaces
      .filter((f) => f.poster)
      .filter((f) => !existsSync(join(root, "public", "surfaces", `${f.poster}.webp`)))
      .map((f) => `${f.to} → public/surfaces/${f.poster}.webp`);
    expect(absent, `declared poster not generated — run \`npm run gen:surfaces\`: ${absent.join(", ")}`).toEqual([]);
  });

  it("gives every surface an icon", () => {
    const iconless = surfaces.filter((f) => !SURFACE_ICON[f.to]).map((f) => f.to);
    expect(iconless, `surface(s) with no icon in rooms.tsx SURFACE_ICON: ${iconless.join(", ")}`).toEqual([]);
  });

  it("puts every walled surface in a rendered group", () => {
    const rendered = new Set(WALL_GROUPS.map((g) => g.group));
    const stranded = surfaces.filter((f) => f.wall && !rendered.has(f.group)).map((f) => f.to);
    expect(stranded, `surface(s) marked wall:true but in a group the wall never renders: ${stranded.join(", ")}`).toEqual([]);
  });

  it("renders every walled surface exactly once", () => {
    const walled = surfaces.filter((f) => f.wall).map((f) => f.to).sort();
    const tiled = wallSurfaces.flatMap((g) => g.items.map((f) => f.to)).sort();
    expect(tiled).toEqual(walled);
  });

  it("resolves every railId to a facet in the chronology registry", () => {
    // surfaces.ts references the rail's dates rather than restating them. A
    // railId that resolves to nothing means a surface silently lost its
    // authored/discovered pair — the growable-past model's whole point.
    const ids = new Set(facets.map((f) => f.id));
    const dangling = surfaces
      .filter((s) => s.railId && !ids.has(s.railId))
      .map((s) => `${s.to} → railId "${s.railId}"`);
    expect(dangling, `railId pointing at no facet in facets.ts: ${dangling.join(", ")}`).toEqual([]);
  });

  it("has no duplicate paths or labels", () => {
    const paths = surfaces.map((f) => f.to);
    const labels = surfaces.map((f) => f.label);
    expect(new Set(paths).size, "duplicate facet path").toBe(paths.length);
    expect(new Set(labels).size, "duplicate facet label").toBe(labels.length);
  });

  it("gives every surface non-empty copy", () => {
    for (const f of surfaces) {
      expect(f.label.trim(), `${f.to} label`).not.toBe("");
      expect(f.blurb.trim(), `${f.to} blurb`).not.toBe("");
      expect(f.tag.trim(), `${f.to} tag`).not.toBe("");
    }
  });
});

describe("back-compat", () => {
  // Eleven modules still import `siteRooms`. It is now derived, so this asserts
  // the derivation keeps the shape and the pager order those modules expect.
  it("siteRooms is exactly the room-kind facets, in declaration order", () => {
    expect(siteRooms.every((r) => r.kind === "room")).toBe(true);
    expect(siteRooms.map((r) => r.to)).toEqual([
      "/compose",
      "/lab",
      "/blueprint",
      "/map",
      "/forge",
      "/terminal",
      "/chess",
      "/weeb",
    ]);
  });
});
