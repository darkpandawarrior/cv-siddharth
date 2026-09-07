import type { TLDefaultColorStyle } from "tldraw";
import { projects, metrics } from "./data/profile.ts";
import { writing } from "./data/writing.ts";

/* Shared source-of-truth for the Blueprint Room's content, consumed by both
 * the 2D tldraw sketch board (BlueprintRoom.tsx) and the 3D fly-through scene
 * (Blueprint3D.tsx) so the two views never drift out of sync.
 *
 * ── LAYOUT IS HAND-PLACED; CONTENT IS DERIVED ────────────────────────────
 * This file used to hand-write every label, which made it a second copy of
 * profile.ts and writing.ts that nothing kept honest. It drifted exactly as
 * you would expect:
 *
 *   - The map showed THREE writing series. Eight have shipped. Five of them
 *     had no node at all, so a canvas captioned "every arrow is real" was
 *     missing most of the work it was drawing.
 *   - `portfolio` — this site and its Compose Multiplatform twin — was not on
 *     the map at all, having been added to the registry long after this file.
 *   - The four headline numbers were typed out a second time here, free to
 *     disagree with the ones the homepage renders.
 *   - Three nodes ("GPS 50% → 95%", "-80% crashes", "~87% Compose") sat
 *     directly beside three METRIC tiles carrying the same three numbers, so
 *     the busiest corner of the canvas said everything twice.
 *
 * Positions stay hand-authored — the composition is the design, and no
 * generator is going to lay out a canvas that reads like chapters. Labels,
 * numbers and WHICH THINGS EXIST now come from the registries. A project or a
 * series without a slot is a test failure (blueprintContent.test.ts), never a
 * silent omission.
 */

/**
 * Two short, true facts about a project, for a node roughly 240px wide.
 *
 * Naively taking "the first two status clauses" produced labels like
 * "Active · 24 PRs merged to pub…" and "Live · React on Vercel, CMP a…" —
 * a truncation is not a fact, and an ellipsis inside a 3D scene is unreadable
 * besides. Long prose clauses are dropped rather than cut, and the project's
 * own badges ("25 modules", "39 modules", "Wasm") make up the shortfall, since
 * badges are already written to be short.
 */
const FITS = 15;

function brief(status: string, badges: readonly string[], width: number) {
  // The same ~9px-per-character budget the test measures against, so a label
  // is built to fit its own node rather than trimmed afterwards.
  const budget = Math.floor(width / 9);
  const short = (xs: readonly string[]) => xs.map((x) => x.trim()).filter((x) => x && x.length <= FITS);
  const candidates = short(status.split("·"));
  // Prefer a badge carrying a NUMBER — that is the part worth reading on a map
  // whose whole point is scale.
  for (const b of [...short(badges)].sort((a, b2) => Number(/\d/.test(b2)) - Number(/\d/.test(a)))) {
    if (!candidates.includes(b)) candidates.push(b);
  }
  const line: string[] = [];
  for (const fact of candidates) {
    if (line.length >= 2) break;
    const next = [...line, fact].join(" · ");
    if (next.length <= budget) line.push(fact);
  }
  return line.join(" · ");
}

export type NodeSpec = {
  key: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  geo?: "ellipse" | "rectangle" | "cloud" | "hexagon";
  color: TLDefaultColorStyle;
  fill?: "none" | "semi" | "solid" | "pattern";
  label: string;
};

/**
 * Where each project sits, and in what shape. Slots only — every label comes
 * from the registry below, so a renamed project renames itself here.
 *
 * `the-loopdown` lives in the WRITING cluster rather than with the builds:
 * it is a content engine, and the canvas groups by what a thing is for. The
 * KMP family is drawn as a hexagon like `sid` because it is foundation the
 * other builds stand on, not a sibling of them.
 */
const PROJECT_SLOTS: Record<string, Omit<NodeSpec, "key" | "label">> = {
  doori: { x: 700, y: 1150, w: 260, h: 110, geo: "ellipse", color: "light-blue", fill: "semi" },
  gaddi: { x: 1250, y: 1260, w: 220, h: 100, geo: "ellipse", color: "light-blue" },
  "paymentslab-kmp": { x: 1800, y: 1150, w: 240, h: 100, geo: "ellipse", color: "light-blue" },
  candidai: { x: 1650, y: 1420, w: 240, h: 100, geo: "ellipse", color: "light-blue" },
  stutter: { x: 1990, y: 1550, w: 220, h: 100, geo: "ellipse", color: "light-blue" },
  "kmp-family": { x: 1270, y: 1560, w: 260, h: 100, geo: "hexagon", color: "green" },
  // Added when the map was found to be missing it entirely: the site you are
  // reading this on is a project in the registry like any other.
  portfolio: { x: 760, y: 1450, w: 260, h: 110, geo: "ellipse", color: "light-blue" },
  "the-loopdown": { x: 2050, y: 300, w: 280, h: 120, geo: "cloud", color: "violet", fill: "semi" },
};

const PROJECT_NODES: NodeSpec[] = projects
  .filter((p) => PROJECT_SLOTS[p.slug])
  .map((p) => ({
    key: p.slug,
    ...PROJECT_SLOTS[p.slug],
    label: `${p.name.split(/\s*[—–:]\s+/)[0]}\n${brief(p.status, p.badges, PROJECT_SLOTS[p.slug].w ?? 220)}`,
  }));

/**
 * The writing, one node per series, straight from the archive.
 *
 * Three were hand-written here and the other five simply did not exist on the
 * map. Slots are laid out around the writing frame; a series past the end of
 * the ring is dropped rather than stacked on top of another, and the test
 * fails if that ever starts happening.
 */
const SERIES_SLOTS: Omit<NodeSpec, "key" | "label">[] = [
  { x: 1720, y: 40, w: 230, h: 80, geo: "rectangle", color: "violet" },
  { x: 2450, y: 60, w: 240, h: 80, geo: "rectangle", color: "violet" },
  { x: 2520, y: 620, w: 280, h: 80, geo: "rectangle", color: "violet" },
  { x: 2560, y: 380, w: 260, h: 80, geo: "rectangle", color: "violet" },
  { x: 2120, y: 20, w: 250, h: 80, geo: "rectangle", color: "violet" },
  { x: 1700, y: 600, w: 240, h: 80, geo: "rectangle", color: "violet" },
  { x: 1690, y: 830, w: 250, h: 80, geo: "rectangle", color: "violet" },
  { x: 2180, y: 900, w: 250, h: 80, geo: "rectangle", color: "violet" },
];

const SERIES_NODES: NodeSpec[] = writing.series
  .slice(0, SERIES_SLOTS.length)
  .map((sr, i) => ({
    key: `series-${sr.id}`,
    ...SERIES_SLOTS[i],
    label: `${sr.title}\n${sr.episodes} ${sr.episodes === 1 ? "part" : "parts"}`,
  }));

export const NODES: NodeSpec[] = [
  { key: "sid", x: 1150, y: 640, w: 300, h: 140, geo: "hexagon", color: "green", fill: "semi", label: "SID\nprototype → platform" },
  { key: "work", x: 300, y: 180, w: 260, h: 110, geo: "rectangle", color: "green", fill: "semi", label: "Case studies\nthe numbers" },
  // The three plain "GPS 50% → 95%" / "-80% crashes" / "~87% Compose" tiles
  // that used to sit here are GONE. They were parked directly beside the
  // animated METRIC tiles carrying those same three numbers, so the corner of
  // the canvas a visitor lands in first said everything twice. The metric
  // tiles are the better version — they count up — so they are the ones that
  // stayed, and the arrows that pointed at these now run from `work`.
  ...PROJECT_NODES,
  ...SERIES_NODES,
  { key: "books", x: 2500, y: 950, w: 260, h: 110, geo: "cloud", color: "orange", fill: "semi", label: "Books Before Bros\nthe origin blog (2018–2020)" },
  { key: "chat", x: 1180, y: 120, w: 240, h: 100, geo: "ellipse", color: "light-blue", fill: "semi", label: "Ask my AI\nhas read all of this" },
];

/**
 * Every arrow is real — the note pinned on the canvas says so, so it has to be.
 *
 * Endpoints are node keys, which are now project slugs and `series-<id>`, so a
 * renamed project or a retired series breaks the arrow loudly in the test
 * rather than quietly: Blueprint3D SKIPS an arrow whose endpoints it cannot
 * find (`if (!na || !nb) return null`), which means a typo here removes a
 * relationship from the map with no error anywhere.
 */
export const ARROWS: [string, string, TLDefaultColorStyle][] = [
  ["sid", "work", "green"],
  ["sid", "doori", "light-blue"],
  ["sid", "gaddi", "light-blue"],
  ["sid", "paymentslab-kmp", "light-blue"],
  ["sid", "candidai", "light-blue"],
  ["sid", "stutter", "light-blue"],
  ["sid", "portfolio", "light-blue"],
  ["sid", "the-loopdown", "violet"],
  ["sid", "chat", "light-blue"],
  // These three used to hop through a duplicate tile — work→gps→sensors — and
  // the middle node was a second copy of a metric tile a few hundred px away.
  // The relationship it was carrying (this number is what that series is
  // about) survives; the duplicate does not.
  ["work", "series-sensors-who-lie", "violet"],
  ["work", "series-the-coroutine-court", "violet"],
  ["work", "series-ghosts-in-the-recomposition", "violet"],
  ["series-sensors-who-lie", "the-loopdown", "violet"],
  ["series-the-coroutine-court", "the-loopdown", "violet"],
  ["series-ghosts-in-the-recomposition", "the-loopdown", "violet"],
  ["series-chain-of-custody", "the-loopdown", "violet"],
  ["series-crossing-the-schema", "the-loopdown", "violet"],
  ["series-notes-from-the-loop", "the-loopdown", "violet"],
  ["series-one-brain-two-bodies", "the-loopdown", "violet"],
  ["series-the-night-shift", "the-loopdown", "violet"],
  ["books", "the-loopdown", "orange"],
  ["doori", "kmp-family", "green"],
  ["gaddi", "kmp-family", "green"],
  ["paymentslab-kmp", "kmp-family", "green"],
  ["portfolio", "kmp-family", "green"],
  ["candidai", "kmp-family", "green"],
  ["doori", "series-sensors-who-lie", "violet"],
  ["doori", "series-chain-of-custody", "violet"],
];

// Cluster frames — named zones so the map reads like chapters.
export const FRAMES = [
  { key: "frame-work", x: 0, y: 100, w: 640, h: 1020, name: "the work" },
  { key: "frame-builds", x: 620, y: 1080, w: 1520, h: 640, name: "the builds" },
  { key: "frame-writing", x: 1660, y: -40, w: 1220, h: 1180, name: "the writing" },
];

// Real screenshots pinned like a moodboard, slightly rotated.
export const PINS = [
  { key: "pin-doori", src: "/projects/doori/screenshots/track_a_trip.gif", mime: "image/gif", animated: true, x: 660, y: 1290, w: 150, h: 320, rot: -0.06 },
  { key: "pin-gaddi", src: "/projects/gaddi/screenshots/home.gif", mime: "image/gif", animated: true, x: 1500, y: 1300, w: 150, h: 320, rot: 0.05 },
  { key: "pin-plab", src: "/projects/paymentslab-kmp/screenshots/lab_home_screen_catalog.png", mime: "image/png", animated: false, x: 2070, y: 1270, w: 150, h: 320, rot: -0.04 },
];

/**
 * The four headline numbers, FROM `metrics` — the same array the homepage
 * band renders. They were typed out a second time here and were free to
 * disagree with it; now a number can only be changed in one place.
 *
 * Positions are matched to the order `metrics` declares them in, so the
 * layout is stable as long as that array is. The test asserts the count.
 */
const METRIC_SLOTS = [
  { key: "m-mau", x: 620, y: 300 },
  { key: "m-gps", x: 340, y: 470 },
  { key: "m-crash", x: 380, y: 715 },
  { key: "m-compose", x: 340, y: 955 },
];

export const METRICS = METRIC_SLOTS.map((slot, i) => ({
  ...slot,
  value: metrics[i].value,
  label: metrics[i].label.toLowerCase(),
}));

export const NOTES: { x: number; y: number; color: TLDefaultColorStyle; text: string }[] = [
  { x: 620, y: 60, color: "yellow", text: "Every arrow is real: the writing grew out of the work, the apps share one foundation." },
  { x: 2100, y: 1400, color: "yellow", text: "This canvas is yours too — drag things, sketch, leave a note. It stays in your browser." },
  { x: 1500, y: 820, color: "yellow", text: "The tiles with counting numbers and the spinning hologram are live React + three.js — custom tldraw shapes." },
];

// Guided tour stops: bounds the 2D camera flies between (also mapped to 3D fly-cam targets).
export const TOUR: { title: string; bounds: [number, number, number, number] }[] = [
  { title: "the work", bounds: [0, 100, 700, 1020] },
  { title: "the builds", bounds: [620, 1080, 1520, 640] },
  { title: "the writing", bounds: [1660, -40, 1220, 1180] },
  { title: "live shapes", bounds: [950, 550, 900, 500] },
  { title: "everything", bounds: [-100, -100, 3000, 1900] },
];

export function centerOf(n: NodeSpec) {
  return { x: n.x + (n.w ?? 220) / 2, y: n.y + (n.h ?? 90) / 2 };
}

/* tldraw color name -> hex, reused for the 3D scene so both views share a palette. */
export const COLOR_HEX: Record<string, string> = {
  green: "#3ddc84",
  "light-green": "#7ee8a8",
  "light-blue": "#5ee6ff",
  violet: "#b98bff",
  orange: "#ffb066",
  yellow: "#ffd866",
};

// tldraw's local persistence key for the sketch board — shared with the
// dependency-free blueprintPersistence.ts, which must not import tldraw.
export const PERSISTENCE_KEY = "sid-blueprint-room-v2";
