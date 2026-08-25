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

import { excelsiorEditions } from "./excelsior.ts";
import { LAB_TABS, countWord } from "./labs.ts";

/**
 * How a surface groups on the homepage wall.
 *
 * Chosen so a visitor can tell from the group label alone whether a tile is
 * evidence, a thing that runs, a corpus, or writing — the legibility the
 * reference portfolios get from plain category chips.
 */
export type SurfaceGroup = "proof" | "runs" | "corpus" | "writing";

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

/**
 * Device geometry, owned here because three consumers need it and only one of
 * them is React: SurfaceWall draws the frame, capture-site.mjs sizes the
 * browser viewport a poster is shot in, and gen-surfaces.mjs crops to it.
 *
 * It lives here rather than in SurfaceWall.tsx because that file cannot be
 * imported from a script (it imports React and lucide-react), and the two were
 * already out of step: every poster was captured at 1440x900 and cropped to
 * 16:9, then rendered `object-cover` inside a 9/16 phone. A desktop layout
 * cropped to a phone's shape is a sliver of a desktop layout — /hire's tile
 * showed "th Pandalai — ndroid Enginee", clipped on both sides. A device wall
 * whose devices all show the same desktop capture is arguing against itself.
 *
 * `aspect` is the screen only; the bezel is `.device`'s border, which is why a
 * watch and a TV can share one component. Purely presentational values (the
 * fraction of the wall's band a frame occupies, its corner radius) stay in
 * SurfaceWall.tsx — nothing outside the wall has any use for them.
 */
export const DEVICE: Record<DeviceFrame, { aspect: number; label: string; width: number }> = {
  phone: { aspect: 9 / 16, label: "Phone", width: 390 },
  foldable: { aspect: 5 / 4, label: "Foldable", width: 840 },
  tablet: { aspect: 4 / 3, label: "Tablet", width: 1024 },
  watch: { aspect: 1, label: "Watch", width: 400 },
  tv: { aspect: 16 / 9, label: "TV", width: 1280 },
  desktop: { aspect: 16 / 10, label: "Desktop", width: 1440 },
  browser: { aspect: 16 / 10, label: "Web", width: 1440 },
  widget: { aspect: 2, label: "Widget", width: 480 },
};

/**
 * The viewport a surface's poster is captured in.
 *
 * Height is the frame's own aspect, floored at 600: a widget is 2:1, and
 * shooting /pulse in a 480x240 window renders a page nothing on the site
 * targets. Shooting it at 480x600 and cropping the top to 2:1 gives the same
 * frame filled with a layout that actually exists.
 */
export const captureViewport = (device: DeviceFrame) => {
  const { aspect, width } = DEVICE[device];
  return { width, height: Math.max(600, Math.round(width / aspect)) };
};

/**
 * THE WALL'S THREE TINTS, AND WHY THERE ARE ONLY THREE.
 *
 * index.css states the art direction in one line: "if it is cyan it is the
 * thing being compared to". A tile tint that is cyan because cyan looked good
 * spends that meaning on decoration, and eight tints across seventeen tiles
 * made the homepage read as a wall assembled from separate projects rather
 * than one site. So the palette collapses to the smallest set that still says
 * something true:
 *
 *   ACCENT     — the build world. Everything that is engineering evidence or a
 *                running program wears the site's own accent.
 *   INK_OCHRE  — the writing world. /ink swaps --color-accent to this ochre for
 *                its whole theme, so a writing tile is that world's colour
 *                showing through the wall rather than a second accent.
 *   CHESS_GOLD — kept, because it ENCODES rather than decorates: --lab-gold is
 *                already the board/game colour SearchTreeLab renders Kursi's
 *                search tree in, and /chess's own lab draws through that same
 *                renderer. Change it and two surfaces stop matching.
 *
 * These are hex literals and not `var(--color-...)` on purpose: consumers
 * concatenate an alpha suffix onto them (`${surface.tint}55` in Launcher,
 * RoomGrid and rooms.tsx) and the 3D world feeds them to r3f/canvas colour
 * props, neither of which accepts a CSS variable. The values are copied from
 * the tokens named beside them, never invented; themeConcat.test.ts documents
 * the same trap for scene colours.
 */
const ACCENT = "#f2a13d"; // --color-accent, index.css
const INK_OCHRE = "#d9a441"; // --color-accent inside .theme-ink, index.css
const CHESS_GOLD = "#e8c874"; // --lab-gold, index.css

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
  /**
   * The `id` of this surface's entry in facets.ts, when it has one.
   *
   * Deliberately a reference and not a copy: the rail already owns the ISO
   * `authored`/`discovered` dates, and a second hand-kept copy of "Excelsior
   * was written in 2021 and found in 2026" would drift from the rail's within
   * a release. The gate fails if a railId resolves to nothing.
   */
  railId?: string;
  /**
   * Set `false` to keep a surface registered but off the homepage wall.
   *
   * REGISTRATION AND ADVERTISEMENT ARE NOT THE SAME THING, and this is the one
   * place the difference is expressible. Everything downstream of `surfaces`
   * still sees a demoted surface: ⌘K lists it (CommandPalette maps SURFACES,
   * the whole registry), the room pager still walks into it, /playground still
   * builds it a pavilion, roomHead still writes its <head>, the sitemap still
   * carries it. What it loses is a tile on the wall, which is advertising
   * space, not reachability.
   *
   * A `wall: boolean` existed here before and was deleted for a good reason:
   * /playground opted out, lost its last homepage link, and every gate stayed
   * green because nothing checked *which* surfaces had opted out. That is the
   * failure this reintroduction is shaped around. The flag is back, and
   * surfaces.test.ts pins the demoted set by path — adding one is a failing
   * test that has to be edited deliberately, never a quiet omission.
   */
  wall?: false;
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
    tint: ACCENT,
    device: "phone",
    preview: "poster",
    poster: "compose",
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
    tint: ACCENT,
    device: "desktop",
    preview: "poster",
    poster: "lab",
    railId: "lab",
  },
  {
    to: "/blueprint",
    label: "The Blueprint Room",
    blurb:
      "The whole portfolio as an infinite canvas — a real-time 3D fly-through, an ASCII render of the same scene, and a sketchable whiteboard.",
    tag: "3D · WebGL",
    group: "runs",
    tint: ACCENT,
    device: "desktop",
    preview: "poster",
    poster: "blueprint",
  },
  {
    to: "/map",
    label: "The 3D Storyboard",
    blurb:
      "The projects and the ideas that connect them, as a constellation you can orbit — every edge is a real dependency.",
    tag: "3D · graph",
    group: "proof",
    tint: ACCENT,
    device: "desktop",
    preview: "poster",
    poster: "map",
  },
  {
    to: "/forge",
    label: "The Particle Forge",
    blurb:
      "A few thousand particles, each spring-tied to a letter, parting around your cursor and snapping back. Physics on a canvas.",
    tag: "canvas · interactive",
    group: "runs",
    tint: ACCENT,
    device: "browser",
    preview: "poster",
    poster: "forge",
    // Off the wall, still registered. It is a screensaver: lovely once, and
    // nobody navigates to it twice, so a tile spends the wall's scarcest
    // resource — a visitor's attention on the homepage — on the room with the
    // least to say about him. ⌘K, the room pager and the /playground street
    // all still reach it, and it keeps its poster so putting it back is one
    // deleted line.
    wall: false,
  },
  {
    to: "/terminal",
    label: "The Terminal",
    blurb:
      "A faux shell you can actually type in — ls the site, cat a project, or hit the backtick key from anywhere.",
    tag: "text · easter egg",
    group: "runs",
    tint: ACCENT,
    device: "desktop",
    preview: "poster",
    poster: "terminal",
    // Off the wall, still registered — and the tile was arguing with its own
    // tag. An easter egg advertised on the homepage is not an easter egg, and
    // this one already has the discovery mechanism it wants: the backtick key
    // works from anywhere on the site. ⌘K and the room pager still reach it by
    // name for anyone who would rather not guess.
    wall: false,
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
    // The one tile that keeps its own colour, because this colour encodes the
    // thing rather than dressing it: see CHESS_GOLD above.
    tint: CHESS_GOLD,
    device: "tablet",
    preview: "poster",
    poster: "chess",
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
    tint: ACCENT,
    device: "tv",
    preview: "poster",
    poster: "weeb",
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
    tint: ACCENT,
    device: "phone",
    preview: "poster",
    poster: "hire",
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
    tint: ACCENT,
    device: "desktop",
    preview: "poster",
    poster: "resume",
  },
  {
    to: "/shipped",
    label: "The Shelf",
    blurb:
      "Every Android app that reached the Play Store from work he touched — three at Dice and Jugnoo, the rest white-label clients of the platform he worked on, each one verified against its live listing.",
    tag: "store · verified",
    group: "proof",
    tint: ACCENT,
    device: "phone",
    preview: "poster",
    poster: "shipped",
  },
  {
    to: "/pulse",
    label: "The Pulse",
    blurb:
      "A live count of what visitors actually touch across this portfolio — which rooms get opened, what gets played with, and what nobody has found yet.",
    tag: "telemetry · live",
    // Sat in "proof" and made the group label a lie. Everything else under
    // Proof is evidence about the engineer — shipped apps, the résumé, the lab
    // that reproduces the metrics. This page counts clicks on this website: it
    // is a live program reading a shared document, which is exactly what
    // "things that run" means, and nothing about a visitor opening /forge is
    // evidence about his Android work.
    group: "runs",
    tint: ACCENT,
    device: "widget",
    preview: "poster",
    poster: "pulse",
  },
  {
    to: "/ink",
    label: "The Ink",
    blurb:
      "The writing years — three editions of MANIT's institute magazine, a literary society, four published stories, and everything written before the code.",
    tag: "archive · world",
    group: "writing",
    tint: INK_OCHRE,
    device: "tablet",
    preview: "poster",
    poster: "ink",
    // The rail's "board" entry is /ink#board — same destination, and it owns
    // the 2019-authored / 2026-discovered pair.
    railId: "board",
  },
  {
    to: "/excelsior",
    label: "Excelsior",
    blurb:
      "Three editions of MANIT Bhopal's institute magazine, readable here in full — English Editor on 2019 and 2020, Joint Chief Editor on 2021.",
    // Summed from the generated edition list rather than added up by hand —
    // three editions today, and the tile is the one place a fourth would not
    // announce itself.
    tag: `${excelsiorEditions.reduce((n, e) => n + e.pages, 0)} pages`,
    group: "writing",
    tint: INK_OCHRE,
    device: "tablet",
    preview: "poster",
    poster: "excelsior",
    railId: "excelsior",
  },
  {
    to: "/loopdown",
    label: "The Loopdown",
    blurb:
      "Field notes from building production Android — what broke, what the fix actually was, and the numbers on either side of it.",
    tag: "field notes",
    group: "writing",
    tint: INK_OCHRE,
    device: "phone",
    preview: "poster",
    poster: "loopdown",
    railId: "loopdown",
  },
  {
    to: "/anthology",
    label: "The Morkinstar Journals",
    blurb:
      "A galactic field reporter files thirty-four short stories on fourteen gods and fourteen monsters, until he stops filing and keeps ninety-one pages instead.",
    // The count is spelled out rather than interpolated on purpose: this file
    // is the route registry and every consumer imports it, so pulling the
    // anthology corpus in here to derive one word would put the whole of the
    // fiction into every chunk. surfaces.test.ts pins the word to
    // anthologyEntries.length instead, which costs nothing at runtime. It said
    // "twenty" while the corpus held thirty-four, undercounting his own work
    // on a public tile.
    tag: "fiction · starmap",
    group: "writing",
    // This tile lives inside /ink's palette, not beside it: the furthest room
    // of the writing world, wearing that world's colour like the rest of it.
    tint: INK_OCHRE,
    device: "tablet",
    // No poster: /anthology's whole surface is the 3D starmap, which a static
    // capture can't represent honestly. "none" ships a legible tile today —
    // icon, label, blurb, tag — without gen:surfaces owing it a screenshot.
    preview: "none",
  },
  {
    to: "/canon",
    label: "The Canon",
    // Deliberately says what the page IS rather than what it contains: the
    // laws, the ledger and the rig states are all spoilers by name, which is
    // why the page itself gates them behind a marked divider.
    blurb:
      "The rules the Morkinstar Journals are written against — seven laws, the count, the fourteen, and what the rendering can and cannot do.",
    tag: "lore · reference",
    group: "writing",
    // Same world as /anthology and /ink, so the same ochre. This is the
    // reference shelf of the writing world, not a room beside it.
    tint: INK_OCHRE,
    device: "tablet",
    // No poster for the same reason /anthology has none: gen:surfaces would
    // owe this a capture it cannot take without a build, and "none" ships a
    // legible tile today rather than a broken frame.
    preview: "none",
  },
  {
    to: "/making",
    label: "The Making",
    // Registered in `proof`, deliberately not `writing`: the anthology is a
    // thing the portfolio contains, so the portfolio's own frame is allowed
    // an author where the anthology's pages are not. See src/data/making.ts.
    blurb:
      "The craft record for The Morkinstar Journals: the cross-lab ownership audits, what they killed, two portrait passes, and what the whole thing cost.",
    tag: "process · receipts",
    group: "proof",
    tint: ACCENT,
    device: "tablet",
    // No poster, same reasoning as /canon and /anthology: gen:surfaces would
    // owe this a capture it cannot honestly take without a build, and "none"
    // ships a legible tile today rather than a broken frame.
    preview: "none",
  },
  {
    to: "/playground",
    label: "The Playground",
    // Was an enumeration of the rooms, and `wall: false` on the grounds that
    // "the wall IS this page's job now". Both were wrong in the same way: they
    // described this route as an index, and an index really is what the wall
    // replaced. What it could never replace is the thing that only exists
    // here — the rooms as a drivable 3D street laid out as a timeline. Once the
    // blurb said "index", taking it off the wall looked like tidying rather
    // than what it was: deleting the last link to the world from the homepage,
    // leaving it reachable only from two footers.
    //
    // Describes the shape, never the roll-call. The list used to run past
    // routeHead's 158-char clamp and the rendered description ended at "a
    // typable…", losing the terminal and the experiment count outright.
    blurb:
      `Every interactive room on this site as a building on one street, drivable in 3D — and the street is a timeline, ` +
      `north is 2017 and south is now.`,
    tag: "3d world · drivable",
    group: "runs",
    tint: ACCENT,
    device: "browser",
    preview: "poster",
    poster: "playground",
  },
];

export const surfaces: Surface[] = [
  ...roomSurfaces.map((s): Surface => ({ ...s, kind: "room" })),
  ...pageSurfaces.map((s): Surface => ({ ...s, kind: "page" })),
];

/**
 * Display order of the wall's groups — and, since every group is rendered, the
 * gate that a surface cannot be grouped into somewhere the wall never draws.
 * There used to be a fifth, "index", carrying exactly one surface that was also
 * the only one with `wall: false`; a group nothing displays is how a route goes
 * quietly missing.
 */
export const WALL_GROUPS: { group: SurfaceGroup; label: string; note: string }[] = [
  { group: "proof", label: "Proof", note: "the numbers, and what verifies them" },
  { group: "runs", label: "Things that run", note: "real programs, in the page" },
  { group: "corpus", label: "Corpus", note: "long records, read as evidence" },
  { group: "writing", label: "Writing", note: "before the code, and alongside it" },
];

export const surfaceBy = (to: string) => surfaces.find((s) => s.to === to);

/**
 * Every surface the wall advertises, grouped, in wall order.
 *
 * Read by SurfaceWall (the homepage) and by Launcher (the same wall, floated
 * over any room), so a demotion takes a tile out of both — they are one wall
 * shown in two places, not two lists.
 *
 * The opt-out is `wall: false` and it is guarded rather than trusted: the
 * previous version of this flag let /playground fall off the homepage with
 * every gate green, so surfaces.test.ts now asserts the demoted set is exactly
 * the two entries below and that both are still registered and still carry
 * their own way in.
 */
export const wallSurfaces = WALL_GROUPS.map((g) => ({
  ...g,
  items: surfaces.filter((s) => s.group === g.group && s.wall !== false),
}));

/**
 * The surfaces deliberately kept off the wall, as data rather than as a
 * comment — surfaces.test.ts pins this against the registry so the two cannot
 * drift, and the failure names whichever route wandered in or out.
 */
export const demotedSurfaces = surfaces.filter((s) => s.wall === false);

/**
 * Back-compat view for the modules that still import `siteRooms`.
 * Same shape, same order as the old array, derived rather than duplicated.
 */
export const siteRooms = surfaces.filter((s) => s.kind === "room");
