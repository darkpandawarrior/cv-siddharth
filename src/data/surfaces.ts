// src/data/surfaces.ts — the single registry of every navigable *route* on this
// site, and what its tile on the homepage wall looks like.
//
// NOT TO BE CONFUSED WITH src/data/facets.ts, which is a different and older
// registry with a different job:
//
//   facets.ts  — moments in a chronology. Keyed by `id`, carries ISO
//                `authored`/`discovered` dates, and includes intra-page
//                anchors (`/#work`, `/ink#board`). Feeds the anomaly rail,
//                railGeometry and InstrumentView.
//   surfaces.ts — destinations. Keyed by route path, carries the presentation
//                a tile needs (group, device, poster). Feeds the wall, the
//                per-route <head>, the room pager and the assistant.
//
// They overlap on five entries and are not the same set: the rail has no
// /compose, /forge, /terminal, /blueprint, /map, /hire, /resume, /shipped or
// /pulse, and this file has no page anchors. Where both describe the same
// thing, a surface points at the rail entry by `railId` rather than restating
// its dates — one date, one owner.
//
// WHY THIS FILE EXISTS
// --------------------
// The route registry used to be three registries and two hardcoded JSX lists:
//
//   - `siteRooms` (profile.ts)         — 8 rooms: to / label / blurb / tag
//   - `NON_ROOM`  (lib/routeHead.ts)   — 7 more, same shape, separate map,
//                                        purely because they weren't "rooms"
//   - `ROOM_STYLE`(rooms.tsx)          — icon + tint, keyed by the same paths
//   - `Doorway()` / `InkDoorway()` (App.tsx) — two hand-written teasers
//
// Two sources of truth for one concept, and the homepage read from neither: it
// hardcoded two doorways and left NINE finished routes (blueprint, forge,
// hire, lab, map, pulse, shipped, terminal, weeb) reachable only via ⌘K, a
// footer link, or memory. Adding a surface meant editing five places and
// forgetting the sixth, which is precisely how those nine went unlinked.
// facets.ts's own docstring names this gap and scopes it out: "the home page's
// own section order is still hardcoded in App.tsx — a registry-driven home
// sequence was scoped out of this pass as a larger refactor". This is that
// refactor.
//
// NODE-IMPORTABILITY IS A HARD CONSTRAINT. `scripts/gen-system-prompt.mjs` and
// `scripts/gen-surfaces.mjs` import this module directly, so it stays plain
// data with no React and no `lucide-react` import. Icons are React values and
// live in `rooms.tsx`'s FACET_ICON map, keyed by path; `surfaces.test.ts`
// fails the build if that map misses one.

import { LAB_TABS, countWord } from "./labs.ts";

/**
 * How a surface groups on the homepage wall.
 *
 * Chosen so a visitor can tell from the group label alone whether a tile is
 * evidence, a thing that runs, a corpus, or writing — the legibility the
 * reference portfolios get from plain category chips.
 */
export type SurfaceGroup = "proof" | "runs" | "corpus" | "writing" | "index";

/**
 * Device chrome a surface's tile wears on the wall.
 *
 * `phone` / `watch` / `desktop` / `browser` / `widget` already existed in
 * DeviceWall.tsx for project targets. `foldable` / `tablet` / `tv` are added
 * here: one Compose codebase adapting across form factors is the professional
 * claim this site exists to make, and it is made structurally — by rendering
 * the matrix — rather than by writing a sentence about it.
 */
export type DeviceFrame =
  | "phone"
  | "foldable"
  | "tablet"
  | "watch"
  | "tv"
  | "desktop"
  | "browser"
  | "widget";

export interface Surface {
  /** Route path. Must resolve to a file in src/routes/ — the gate checks. */
  to: string;
  label: string;
  /**
   * Feeds three surfaces at once: the <head> description (roomHead clamps at
   * 158 and a longer one renders truncated in results), the assistant's system
   * prompt, and the wall tile. One string, so the three cannot drift.
   */
  blurb: string;
  tag: string;
  group: SurfaceGroup;
  /**
   * `room` = full-screen chrome via RoomFrame, joins the next-room pager.
   * `page` = an ordinary scroll route with the site footer.
   *
   * NOT hand-set: derived from which array below an entry is declared in. This
   * distinction used to be implicit in *which registry* an entry lived in,
   * which is why it kept getting decided by accident.
   */
  kind: "room" | "page";
  tint: string;
  device: DeviceFrame;
  /**
   * Tile richness, and the reason a surface can never ship half-added:
   *   none   — legible tile: icon, label, blurb, tag. Always works, zero assets.
   *   poster — the above, inside a device frame, showing its route capture.
   *   live   — the above, and the real build boots in the frame on demand.
   * A surface ships legible on day one and upgrades later. Degradation is the
   * default, not the fallback.
   */
  preview: "none" | "poster" | "live";
  /** Capture basename under public/surfaces/. Required when preview !== "none". */
  poster?: string;
  /** Does this surface get a tile on the homepage wall? */
  wall: boolean;
  /**
   * The `id` of this surface's entry in facets.ts, when it has one.
   *
   * Deliberately a reference and not a copy: the rail already owns the ISO
   * `authored`/`discovered` dates, and a second hand-kept copy of "Excelsior
   * was written in 2021 and found in 2026" would drift from the rail's within
   * a release. The gate fails if a railId resolves to nothing.
   */
  railId?: string;
}

/** A surface as authored — `kind` comes from which array it lands in. */
type SurfaceInput = Omit<Surface, "kind">;

/**
 * Full-screen rooms, in pager order.
 *
 * Order is preserved exactly as the old `siteRooms` array declared it: it
 * drives RoomFrame's next-room pager, the Playground grid and the assistant
 * prompt's room list. Every other consumer looks rooms up by path.
 */
const roomSurfaces: SurfaceInput[] = [
  {
    to: "/compose",
    label: "Compose Playground",
    blurb:
      "Write Jetpack Compose, watch it recompose live in a phone frame — reactive state, animation, and an AI that writes it for you.",
    tag: "live editor · AI",
    group: "runs",
    tint: "#3ddc84",
    device: "phone",
    preview: "poster",
    poster: "compose",
    wall: true,
  },
  {
    to: "/lab",
    label: "The Lab Bench",
    // Kept under 158 chars: routeHead clamps descriptions at that length and
    // this one used to render truncated. The project roll-call moved out — it
    // was the part that pushed it over, and the projects section already names
    // them.
    blurb: `${countWord(LAB_TABS.length)} experiments that prove the numbers — Dice.tech production metrics, five personal builds and seven years of chess — running in your browser.`,
    tag: "canvas · physics",
    group: "proof",
    tint: "#5ee6ff",
    device: "desktop",
    preview: "poster",
    poster: "lab",
    wall: true,
    railId: "lab",
  },
  {
    to: "/blueprint",
    label: "The Blueprint Room",
    blurb:
      "The whole portfolio as an infinite canvas — a real-time 3D fly-through, an ASCII render of the same scene, and a sketchable whiteboard.",
    tag: "3D · WebGL",
    group: "runs",
    tint: "#db61ff",
    device: "desktop",
    preview: "poster",
    poster: "blueprint",
    wall: true,
  },
  {
    to: "/map",
    label: "The 3D Storyboard",
    blurb:
      "The projects and the ideas that connect them, as a constellation you can orbit — every edge is a real dependency.",
    tag: "3D · graph",
    group: "proof",
    tint: "#f0883e",
    device: "desktop",
    preview: "poster",
    poster: "map",
    wall: true,
  },
  {
    to: "/forge",
    label: "The Particle Forge",
    blurb:
      "A few thousand particles, each spring-tied to a letter, parting around your cursor and snapping back. Physics on a canvas.",
    tag: "canvas · interactive",
    group: "runs",
    tint: "#3ddc84",
    device: "browser",
    preview: "poster",
    poster: "forge",
    wall: true,
  },
  {
    to: "/terminal",
    label: "The Terminal",
    blurb:
      "A faux shell you can actually type in — ls the site, cat a project, or hit the backtick key from anywhere.",
    tag: "text · easter egg",
    group: "runs",
    tint: "#5ee6ff",
    device: "desktop",
    preview: "poster",
    poster: "terminal",
    wall: true,
  },
  // No game count in this blurb, deliberately: the corpus grows every time he
  // plays, and this string feeds the SEO head tags and the assistant's system
  // prompt as well as the wall tile. Live counts belong in ChessFindings,
  // which imports the generated chess.ts.
  {
    to: "/chess",
    label: "The Board",
    blurb:
      "Seven years of games across lichess and chess.com, mined: the rating arc in 3D, where games end, a shifting repertoire, and a bot that plays like me.",
    tag: "3d · engine",
    group: "corpus",
    // Gold is already this codebase's board/game colour — SearchTreeLab uses
    // the same value for Kursi's search tree, and the chess engine lab renders
    // through that renderer, so the two read as one family.
    tint: "#e8c874",
    device: "tablet",
    preview: "poster",
    poster: "chess",
    wall: true,
    railId: "chess",
  },
  // No counts in this blurb for the same reason as /chess above: the corpus is
  // re-exported whenever he updates Notion, and this string feeds the SEO head
  // tags and the assistant's system prompt as well as the wall tile. Live
  // figures belong in WeebRoom, which renders from the generated weeb.ts.
  {
    to: "/weeb",
    label: "Weeb Central",
    blurb:
      "Years of anime and manga kept by hand, read as evidence: a status column with no word for quitting, a score scale whose bottom half is unused, and the seasons that aired while the list wasn't looking.",
    tag: "corpus · data",
    group: "corpus",
    tint: "#f2a13d",
    device: "tv",
    preview: "poster",
    poster: "weeb",
    wall: true,
    railId: "weeb",
  },
];

/** Ordinary scroll routes. */
const pageSurfaces: SurfaceInput[] = [
  {
    to: "/hire",
    label: "Hire",
    blurb:
      "Senior Android engineer, platform owner of a ~964k-LOC app serving 50,000+ monthly users. GPS accuracy 50%→95%, crashes down 80%. Résumé, numbers, contact.",
    tag: "90 seconds",
    group: "proof",
    tint: "#3ddc84",
    device: "phone",
    preview: "poster",
    poster: "hire",
    wall: true,
  },
  {
    to: "/resume",
    label: "Résumé",
    // Claims only what ships. An earlier draft said "one page, A4" — there is
    // no `@page` rule anywhere in the CSS (that is programme increment 7, not
    // yet built) and the page count isn't fixed, so both were unverified.
    blurb:
      "The résumé as a page, not a download — no chrome, no nav, printed to PDF straight from the browser. The artifact that actually leaves this site.",
    tag: "print · pdf",
    group: "proof",
    tint: "#f2a13d",
    device: "desktop",
    preview: "poster",
    poster: "resume",
    wall: true,
  },
  {
    to: "/shipped",
    label: "The Shelf",
    blurb:
      "Every Android app that reached the Play Store from work he touched — three at Dice and Jugnoo, the rest white-label clients of the platform he worked on, each one verified against its live listing.",
    tag: "store · verified",
    group: "proof",
    tint: "#3ddc84",
    device: "phone",
    preview: "poster",
    poster: "shipped",
    wall: true,
  },
  {
    to: "/pulse",
    label: "The Pulse",
    blurb:
      "A live count of what visitors actually touch across this portfolio — which rooms get opened, what gets played with, and what nobody has found yet.",
    tag: "telemetry · live",
    group: "proof",
    tint: "#5ee6ff",
    device: "widget",
    preview: "poster",
    poster: "pulse",
    wall: true,
  },
  {
    to: "/ink",
    label: "The Ink",
    blurb:
      "The writing years — three editions of MANIT's institute magazine, a literary society, four published stories, and everything written before the code.",
    tag: "archive · world",
    group: "writing",
    tint: "#cf8f63",
    device: "tablet",
    preview: "poster",
    poster: "ink",
    wall: true,
    // The rail's "board" entry is /ink#board — same destination, and it owns
    // the 2019-authored / 2026-discovered pair.
    railId: "board",
  },
  {
    to: "/excelsior",
    label: "Excelsior",
    blurb:
      "Three editions of MANIT Bhopal's institute magazine, readable here in full — English Editor on 2019 and 2020, Joint Chief Editor on 2021.",
    tag: "396 pages",
    group: "writing",
    tint: "#cf8f63",
    device: "tablet",
    preview: "poster",
    poster: "excelsior",
    wall: true,
    railId: "excelsior",
  },
  {
    to: "/loopdown",
    label: "The Loopdown",
    blurb:
      "Field notes from building production Android — what broke, what the fix actually was, and the numbers on either side of it.",
    tag: "field notes",
    group: "writing",
    tint: "#f2a13d",
    device: "phone",
    preview: "poster",
    poster: "loopdown",
    wall: true,
    railId: "loopdown",
  },
  // Not on the wall: the wall IS this page's job now. Kept as a surface so it
  // still gets a <head>, and so the gate counts it as a covered route.
  // Candidate for retirement once the wall has shipped and proven itself.
  {
    to: "/playground",
    // Deliberately does NOT enumerate the rooms. It used to, and the list grew
    // past the 158-char cut — the rendered description ended at "a typable…",
    // losing both the terminal and the experiment count entirely. An
    // enumeration of a growing set can't survive a fixed clamp, so this
    // describes the shape instead and lets the counts carry the specifics.
    label: "The Playground",
    blurb:
      `${countWord(roomSurfaces.length)} interactive rooms — a live Compose playground, an infinite canvas, ` +
      `3D scenes, a typable terminal and ${countWord(LAB_TABS.length).toLowerCase()} running experiments.`,
    tag: "index",
    group: "index",
    tint: "#3ddc84",
    device: "browser",
    preview: "poster",
    poster: "playground",
    wall: false,
  },
];

export const surfaces: Surface[] = [
  ...roomSurfaces.map((s): Surface => ({ ...s, kind: "room" })),
  ...pageSurfaces.map((s): Surface => ({ ...s, kind: "page" })),
];

/** Display order of the wall's groups. "index" is intentionally absent. */
export const WALL_GROUPS: { group: SurfaceGroup; label: string; note: string }[] = [
  { group: "proof", label: "Proof", note: "the numbers, and what verifies them" },
  { group: "runs", label: "Things that run", note: "real programs, in the page" },
  { group: "corpus", label: "Corpus", note: "long records, read as evidence" },
  { group: "writing", label: "Writing", note: "before the code, and alongside it" },
];

export const surfaceBy = (to: string) => surfaces.find((s) => s.to === to);

/** Surfaces that get a tile, grouped, in wall order. */
export const wallSurfaces = WALL_GROUPS.map((g) => ({
  ...g,
  items: surfaces.filter((s) => s.wall && s.group === g.group),
}));

/**
 * Back-compat view for the modules that still import `siteRooms`.
 * Same shape, same order as the old array, derived rather than duplicated.
 */
export const siteRooms = surfaces.filter((s) => s.kind === "room");
