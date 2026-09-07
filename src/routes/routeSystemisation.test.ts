// The mechanical check behind docs/route-systemisation.md (lane AD).
//
// The route-by-route pass in that doc is a claim about the codebase, and a
// claim about the codebase that nothing re-checks is exactly how nine
// finished routes went unlinked before surfaces.test.ts existed (see that
// file's own docstring). This is the equivalent gate for the doc's own
// invariant: every route is reachable from the facet registry (facets.ts) or
// the sitemap generator's list, or the doc names it as a deliberate
// exception with a reason — never silently uncovered.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { facets } from "../data/facets.ts";
import { surfaces } from "../data/surfaces.ts";
import { projects } from "../data/profile.ts";

const root = join(import.meta.dirname, "..", "..");

/** Every route file. `__root.tsx` is layout, not a route, same exclusion
 * surfaces.test.ts's own `routePaths()` makes. */
function routeFiles(): string[] {
  return readdirSync(join(root, "src", "routes"))
    .filter((f) => f.endsWith(".tsx") && f !== "__root.tsx")
    .sort();
}

/**
 * The route path a TanStack file-based route resolves to: `index` -> "/",
 * `project.$slug` -> "/project/$slug" (the dynamic segment kept literal —
 * this only needs to recognise the shape, never a real slug).
 */
function routePath(file: string): string {
  const key = file.replace(/\.tsx$/, "");
  if (key === "index") return "/";
  return "/" + key.split(".").join("/");
}

/**
 * The exact URL set scripts/gen-sitemap.mjs emits, reconstructed from the
 * same two sources it reads (`surfaces`, `projects`) rather than by running
 * the generator or parsing the committed public/sitemap.xml — this is what
 * "in the sitemap generator's list" means, mechanically, and it can't go
 * stale independently of the generator because it reads the generator's own
 * inputs.
 */
const sitemapPaths = new Set<string>(["/", ...surfaces.map((s) => s.to), ...projects.map((p) => `/project/${p.slug}`)]);

/**
 * docs/route-systemisation.md's "## Exceptions" list: lines shaped
 * `- \`route-file.tsx\` — reason`. A route only counts as excused if it has
 * a real, non-empty reason after the dash — an entry with no reason is not
 * an exception, it's a route nobody actually looked at.
 */
function exceptions(): Map<string, string> {
  const doc = readFileSync(join(root, "docs", "route-systemisation.md"), "utf8");
  const section = doc.split(/^## Exceptions$/m)[1] ?? "";
  const map = new Map<string, string>();
  for (const m of section.matchAll(/^- `([^`]+)` — (.+)$/gm)) map.set(m[1], m[2].trim());
  return map;
}

describe("every route is in a registry, or is a named exception (docs/route-systemisation.md)", () => {
  const excused = exceptions();

  it.each(routeFiles())("%s", (file) => {
    const path = routePath(file);
    // Only `foo.$slug.tsx`-shaped files are dynamic. The bare `$.tsx` 404
    // catch-all has no dot segment and is checked as the exact, static
    // path "/$" like everything else — it isn't a family of routes to
    // prefix-match, it's one route.
    const isDynamic = file.includes(".$");
    const prefix = isDynamic ? path.split("$")[0] : path;

    const inFacets = facets.some((f) => f.to === path);
    const inSitemap = isDynamic ? [...sitemapPaths].some((p) => p.startsWith(prefix)) : sitemapPaths.has(path);
    const reason = excused.get(file);

    if (!inFacets && !inSitemap) {
      expect(
        Boolean(reason && reason.length > 0),
        `${file} (${path}) is in neither the facet registry nor the sitemap generator's list, and docs/route-systemisation.md names no exception with a reason for it.`,
      ).toBe(true);
    }
  });

  // The inverse: an exception the routes don't need is a stale claim, not a
  // conservative one — if a later change gives that route a facet or
  // sitemap entry, this fails until someone deletes the now-false exception.
  it("names an exception only for a route file that actually exists", () => {
    const files = new Set(routeFiles());
    for (const file of excused.keys()) {
      expect(files.has(file), `docs/route-systemisation.md excuses "${file}", which is not a route file`).toBe(true);
    }
  });
});
