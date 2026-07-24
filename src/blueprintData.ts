import type { TLDefaultColorStyle } from "tldraw";

/* Shared source-of-truth for the Blueprint Room's content, consumed by both
 * the 2D tldraw sketch board (BlueprintRoom.tsx) and the 3D fly-through scene
 * (Blueprint3D.tsx) so the two views never drift out of sync. */

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

export const NODES: NodeSpec[] = [
  { key: "sid", x: 1150, y: 640, w: 300, h: 140, geo: "hexagon", color: "green", fill: "semi", label: "SID\nprototype → platform" },
  { key: "work", x: 300, y: 180, w: 260, h: 110, geo: "rectangle", color: "green", fill: "semi", label: "Case studies\nthe numbers" },
  { key: "gps", x: 60, y: 480, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "GPS 50% → 95%" },
  { key: "crash", x: 100, y: 720, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "-80% crashes" },
  { key: "compose", x: 60, y: 960, w: 240, h: 90, geo: "rectangle", color: "light-green", label: "92% Compose · 738k LOC" },
  { key: "mileway", x: 700, y: 1150, w: 260, h: 110, geo: "ellipse", color: "light-blue", fill: "semi", label: "Mileway\n5 platforms · offline AI" },
  { key: "kursi", x: 1250, y: 1260, w: 220, h: 100, geo: "ellipse", color: "light-blue", label: "Kursi\nlive web build" },
  { key: "paymentslab", x: 1800, y: 1150, w: 240, h: 100, geo: "ellipse", color: "light-blue", label: "PaymentsLab\ngateway lab" },
  { key: "hiresignal", x: 1650, y: 1420, w: 240, h: 100, geo: "ellipse", color: "light-blue", label: "HireSignal\n25-module KMP" },
  { key: "deadlock", x: 1990, y: 1550, w: 220, h: 100, geo: "ellipse", color: "light-blue", label: "DEADLOCK\ntime-loop game" },
  { key: "toolkit", x: 1270, y: 1560, w: 260, h: 100, geo: "hexagon", color: "green", label: "kmp-toolkit\nshared foundation" },
  { key: "loopdown", x: 2050, y: 300, w: 280, h: 120, geo: "cloud", color: "violet", fill: "semi", label: "The Loopdown\nfield notes that tell stories" },
  { key: "sensors", x: 1720, y: 40, w: 230, h: 80, geo: "rectangle", color: "violet", label: "Sensors Who Lie" },
  { key: "court", x: 2450, y: 60, w: 240, h: 80, geo: "rectangle", color: "violet", label: "The Coroutine Court" },
  { key: "ghosts", x: 2520, y: 620, w: 280, h: 80, geo: "rectangle", color: "violet", label: "Ghosts In The Recomposition" },
  { key: "books", x: 2500, y: 950, w: 260, h: 110, geo: "cloud", color: "orange", fill: "semi", label: "Books Before Bros\nthe origin blog (2018–2020)" },
  { key: "chat", x: 1180, y: 120, w: 240, h: 100, geo: "ellipse", color: "light-blue", fill: "semi", label: "Ask my AI\nhas read all of this" },
];

export const ARROWS: [string, string, TLDefaultColorStyle][] = [
  ["sid", "work", "green"],
  ["sid", "mileway", "light-blue"],
  ["sid", "kursi", "light-blue"],
  ["sid", "paymentslab", "light-blue"],
  ["sid", "hiresignal", "light-blue"],
  ["sid", "deadlock", "light-blue"],
  ["sid", "loopdown", "violet"],
  ["sid", "chat", "light-blue"],
  ["work", "gps", "light-green"],
  ["work", "crash", "light-green"],
  ["work", "compose", "light-green"],
  ["gps", "sensors", "violet"],
  ["crash", "court", "violet"],
  ["compose", "ghosts", "violet"],
  ["sensors", "loopdown", "violet"],
  ["court", "loopdown", "violet"],
  ["ghosts", "loopdown", "violet"],
  ["books", "loopdown", "orange"],
  ["mileway", "toolkit", "green"],
  ["kursi", "toolkit", "green"],
  ["paymentslab", "toolkit", "green"],
  ["mileway", "sensors", "violet"],
];

// Cluster frames — named zones so the map reads like chapters.
export const FRAMES = [
  { key: "frame-work", x: 0, y: 100, w: 640, h: 1020, name: "the work" },
  { key: "frame-builds", x: 620, y: 1080, w: 1520, h: 640, name: "the builds" },
  { key: "frame-writing", x: 1660, y: -40, w: 1220, h: 1180, name: "the writing" },
];

// Real screenshots pinned like a moodboard, slightly rotated.
export const PINS = [
  { key: "pin-mileway", src: "/projects/mileway/screenshots/track_a_trip.gif", mime: "image/gif", animated: true, x: 660, y: 1290, w: 150, h: 320, rot: -0.06 },
  { key: "pin-kursi", src: "/projects/kursi/screenshots/home.gif", mime: "image/gif", animated: true, x: 1500, y: 1300, w: 150, h: 320, rot: 0.05 },
  { key: "pin-plab", src: "/projects/paymentslab/screenshots/lab_home_screen_catalog.png", mime: "image/png", animated: false, x: 2070, y: 1270, w: 150, h: 320, rot: -0.04 },
];

export const METRICS = [
  { key: "m-gps", x: 340, y: 470, value: "95%", label: "gps accuracy — live count" },
  { key: "m-crash", x: 380, y: 715, value: "-80%", label: "production crashes" },
  { key: "m-mau", x: 620, y: 300, value: "50k+", label: "monthly active users" },
  { key: "m-compose", x: 340, y: 955, value: "92%", label: "jetpack compose of 738k loc" },
];

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
