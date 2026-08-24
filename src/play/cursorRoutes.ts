import { surfaces } from "../data/surfaces.ts";

/**
 * Which routes may show live cursors — derived from `src/data/surfaces.ts`
 * (the single registry of every navigable route) rather than hand-kept, for
 * the same reason that registry itself exists: a second, separately
 * maintained list of route names is exactly how a route goes stale or
 * missing without anything failing loudly.
 *
 * Presence is noise on a recruiter surface — a stranger's cursor tells a
 * hiring manager nothing and reads as a bug. `isRecruiterRoute` is
 * pattern-based rather than a copy of the surface list: `/project/*` is
 * matched by prefix, so a brand-new project route is excluded the moment it
 * exists in `surfaces.ts`, without this file ever learning its name.
 *
 * This module only produces the list and the predicate below — it does not
 * mount `PlayProvider` anywhere. Actually turning cursors on for a route is a
 * separate, reviewable step (see PlayRoom.tsx's docstring on why nothing here
 * is load-bearing until it's wired in).
 */

const RECRUITER_EXACT: ReadonlySet<string> = new Set(["/resume", "/hire"]);
const RECRUITER_PREFIX = "/project/";

/** A route where a visitor's presence is noise rather than signal. */
export function isRecruiterRoute(path: string): boolean {
  return RECRUITER_EXACT.has(path) || path.startsWith(RECRUITER_PREFIX);
}

/** Every surface's route, minus the recruiter-facing ones — in `surfaces.ts`
 *  order. New surfaces are included automatically; only a route matching
 *  `isRecruiterRoute` opts back out. */
export const CURSOR_ROUTES: readonly string[] = surfaces.map((s) => s.to).filter((to) => !isRecruiterRoute(to));

const CURSOR_ROUTE_SET = new Set(CURSOR_ROUTES);

/** `canShowCursors(pathname)` — the gate a future per-route cursor mount
 *  checks before rendering presence UI. */
export function canShowCursors(path: string): boolean {
  return CURSOR_ROUTE_SET.has(path);
}
