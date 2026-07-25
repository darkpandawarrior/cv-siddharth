import { siteRooms } from "../data/profile.ts";

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
 * Copy comes from `siteRooms` in profile.ts rather than being written again
 * here: that array already carries each room's label and blurb, it already
 * feeds both the Playground UI and the AI assistant's system prompt, and a
 * fourth hand-maintained copy of the same sentence would drift from the other
 * three within a release.
 */

const SITE = "https://cv-siddharth.vercel.app";

/**
 * The two routes that aren't rooms, and so aren't in `siteRooms`.
 *
 * /playground is the hub that LISTS the rooms — putting it in the array would
 * make it render a card for itself — and /loopdown is a writing series, not an
 * interactive surface.
 */
const NON_ROOM: Record<string, { label: string; blurb: string }> = {
  "/playground": {
    label: "The Playground",
    blurb:
      "Six interactive rooms built into this portfolio — a live Compose playground, an infinite blueprint canvas, a 3D storyboard, a particle forge, a typable terminal and nine running experiments.",
  },
  "/loopdown": {
    label: "The Loopdown",
    blurb:
      "Field notes from building production Android — what broke, what the fix actually was, and the numbers on either side of it.",
  },
};

/** Title, description, canonical and share tags for one client-rendered route. */
export function roomHead(path: string) {
  const room = siteRooms.find((r) => r.to === path);
  const meta = room ? { label: room.label, blurb: room.blurb } : NON_ROOM[path];
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
