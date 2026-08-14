import { surfaceBy } from "../data/surfaces.ts";

/**
 * Per-route <head> for the client-rendered routes.
 *
 * All eight of these shipped with no `head:` at all, so every one of them
 * inherited the root document's title, description and — because only the SSR
 * routes declare one — no canonical link whatsoever. Three consequences, all
 * of them facing the people this site exists to impress:
 *
 *   - Sharing /lab on LinkedIn previewed as "Siddharth Pandalai | Senior
 *     Android Engineer" with the homepage's generic blurb. The Lab Bench is
 *     arguably the most impressive thing here and it introduced itself as the
 *     front page.
 *   - Search engines saw eight URLs claiming identical title and description,
 *     which is textbook duplicate content, with no canonical to consolidate on.
 *   - The rooms were invisible as distinct destinations in any result list.
 *
 * Copy comes from the surface registry rather than being written again here:
 * `src/data/surfaces.ts` already carries each surface's label and blurb, it
 * already feeds the wall, the Playground UI and the AI assistant's system
 * prompt, and a fourth hand-maintained copy of the same sentence would drift
 * from the other three within a release.
 *
 * This file used to hold `NON_ROOM` — a second hardcoded map of seven routes
 * with the same shape as `siteRooms`, kept separate purely because those
 * routes weren't "rooms". That split is what let /pulse, /shipped and friends
 * be described in one place and linked from none. Both halves are now one
 * array, and `surfaces.test.ts` fails the build if a route is missing from it.
 */

const SITE = "https://cv-siddharth.vercel.app";

/** Title, description, canonical and share tags for one client-rendered route. */
export function roomHead(path: string) {
  const meta = surfaceBy(path);
  if (!meta) return {};

  // Descriptions over ~160 chars get truncated in results; cut on a word.
  const desc = meta.blurb.length > 158 ? `${meta.blurb.slice(0, 157).replace(/\s+\S*$/, "")}…` : meta.blurb;
  const title = `${meta.label} — Siddharth Pandalai`;
  const url = `${SITE}${path}`;

  return {
    meta: [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ],
    // Every other route declares its own canonical; without one here the root's
    // absence left these eight with no self-reference at all.
    links: [{ rel: "canonical", href: url }],
  };
}
