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

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { surfaces, WALL_GROUPS, wallSurfaces, siteRooms, demotedSurfaces } from "./surfaces.ts";
import { facets } from "./facets.ts";
import { SURFACE_ICON } from "../rooms.tsx";
import { anthologyEntries } from "./anthology.ts";

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
  it("gives every surface an icon", () => {
    const iconless = surfaces.filter((f) => !SURFACE_ICON[f.to]).map((f) => f.to);
    expect(iconless, `surface(s) with no icon in rooms.tsx SURFACE_ICON: ${iconless.join(", ")}`).toEqual([]);
  });

  it("puts every surface in a rendered group", () => {
    const rendered = new Set(WALL_GROUPS.map((g) => g.group));
    const stranded = surfaces.filter((f) => !rendered.has(f.group)).map((f) => f.to);
    expect(stranded, `surface(s) in a group the wall never renders: ${stranded.join(", ")}`).toEqual([]);
  });

  // The invariant the registry exists for: every surface reaches the homepage
  // wall unless it is one of the two that deliberately does not. It used to
  // read "every WALLED surface", which was vacuously true of the one surface
  // that had opted out — /playground went unlinked with this test green.
  it("renders every surface on the wall exactly once, minus the demoted ones", () => {
    const expected = surfaces.filter((f) => f.wall !== false).map((f) => f.to).sort();
    const tiled = wallSurfaces.flatMap((g) => g.items.map((f) => f.to)).sort();
    expect(tiled).toEqual(expected);
  });

  // `wall: false` is the flag that already cost this site a route once, so the
  // demoted set is pinned rather than trusted. Demoting a third surface is a
  // failing test somebody has to come here and edit on purpose, which is the
  // whole difference between a decision and an omission.
  it("demotes exactly the three surfaces that are meant to be off the wall", () => {
    expect(demotedSurfaces.map((f) => f.to).sort()).toEqual(["/forge", "/terminal", "/weeb"]);
  });

  // Off the wall is not off the site, and this is the line between the two.
  // ⌘K reaches a demoted surface by name, but you cannot search for a room you
  // do not know exists — the Launcher's own docstring says exactly that about
  // the nine routes nobody found. So a demotion is only allowed for a `room`,
  // which the next-room pager walks a visitor into whether they went looking or
  // not. Demoting an ordinary page would leave it with the palette and nothing
  // else, which is how /playground was lost.
  it("only demotes surfaces the room pager still reaches", () => {
    const paged = new Set(siteRooms.map((r) => r.to));
    const stranded = demotedSurfaces.filter((f) => !paged.has(f.to)).map((f) => f.to);
    expect(
      stranded,
      `demoted from the wall but not in the room pager either — nothing but ⌘K leads here: ${stranded.join(", ")}`,
    ).toEqual([]);
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

describe("the registry's spelled-out counts still match the data", () => {
  // surfaces.ts cannot import the corpora it describes: every consumer imports
  // the registry, so deriving one word would drag the whole of the fiction
  // into every chunk. The number stays written out and this test is what stops
  // it drifting. It had said "twenty" since season 2, while the corpus grew to
  // thirty-four.
  const WORDS: Record<number, string> = {
    20: "twenty", 30: "thirty", 34: "thirty-four", 35: "thirty-five",
    36: "thirty-six", 40: "forty", 44: "forty-four", 48: "forty-eight", 50: "fifty",
  };

  it("the anthology tile names as many stories as the anthology has", () => {
    const tile = surfaces.find((s) => s.to === "/anthology");
    expect(tile, "the anthology tile went missing from the registry").toBeDefined();
    const word = WORDS[anthologyEntries.length];
    expect(
      word,
      `no spelled-out form for ${anthologyEntries.length}; add it to WORDS above`,
    ).toBeDefined();
    expect(
      tile!.blurb,
      `the tile should say "${word} short stories" — the corpus holds ${anthologyEntries.length}`,
    ).toContain(`${word} short stories`);
  });
});

describe("no surface is a dead end", () => {
  // /loopdown shipped with ZERO links in it — no nav, no footer, no onward
  // path, browser-back or nothing — and its route file still carries the
  // comment saying so. A comment catches that once, for the one route somebody
  // happened to open. This catches it for all of them.
  //
  // The site has two shared ways out and one hand-rolled one, and all three are
  // honest signals in the source:
  //   RoomFrame  — the full-screen room chrome, which carries the next-room
  //                pager (rooms.tsx: "NO DEAD ENDS").
  //   SiteFooter — the footer whose own docstring says it exists "so no page is
  //                a dead end".
  //   to="/…"    — an internal Link. /hire, /excelsior and /resume mount
  //                neither shared piece on purpose (the résumé is deliberately
  //                chrome-free so it prints clean) and hand-roll their exits
  //                instead, which is a way out and has to count as one.
  // A route with none of the three is the loopdown bug, exactly.
  const EXIT = /RoomFrame|SiteFooter|to="\//;

  /**
   * A route's source, plus the source of the src/ modules it imports directly.
   *
   * One hop, because the thin-route pattern is one hop: /blueprint, /compose,
   * /pulse, /shipped, /terminal and /playground are all a `createFileRoute`
   * shell around a component that mounts the chrome. Going deeper would start
   * matching a footer that lives four imports away from anything a visitor
   * sees on this page, which is not the same claim.
   */
  function routeSource(path: string): string {
    const file = join(root, "src", "routes", `${path.slice(1)}.tsx`);
    const own = readFileSync(file, "utf8");
    const hops = [...own.matchAll(/"(\.\.?\/[^"]+)"/g)]
      .map((m) => resolve(dirname(file), m[1]))
      .map((f) => (f.endsWith(".tsx") ? f : `${f}.tsx`))
      .filter((f) => existsSync(f));
    return own + hops.map((f) => readFileSync(f, "utf8")).join("\n");
  }

  it("gives every registered route a way out", () => {
    const trapped = surfaces
      .filter((s) => !EXIT.test(routeSource(s.to)))
      .map((s) => `${s.to} (src/routes/${s.to.slice(1)}.tsx)`);
    expect(
      trapped,
      `route(s) with no pager, no footer and no internal link — a visitor who lands here can only go back: ${trapped.join(", ")}`,
    ).toEqual([]);
  });
});
