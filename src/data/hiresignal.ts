/**
 * Two facts about the public career-ops upstream, on their own so that both
 * ends of the site can read them.
 *
 * They belong in profile.ts by subject and cannot live there by structure:
 * profile.ts re-exports siteRooms from surfaces.ts, surfaces.ts imports
 * labs.ts, and labs.ts needs the provider count for its Fan-out tab. Importing
 * profile.ts from labs.ts closes that ring, and the module that loses the race
 * reads LAB_TABS as undefined at import time — a blank page, not a type error.
 * This file imports nothing, so it cannot be part of any cycle.
 *
 * Both are refreshed by scripts/gen-hiresignal-stats.mjs, which anchors on the
 * whole declaration line. Three facts now, not two: merged PRs, providers,
 * stars. The PR count stays in profile.ts because the résumé already imports
 * it from there.
 */

/** ATS and job-board provider modules in the upstream `providers/` directory. */
export const providerCount = 85;

/** Rounded down, because the exact figure is wrong within the hour and "68k+"
 *  is not. Stars only climb on a live repo, so the generator reads a SMALLER
 *  value as a rate-limited response rather than as news. */
export const upstreamStars = "68k+";
