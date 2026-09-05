// The Storyboard's constellation, kept here rather than inside StoryMap.tsx so
// a Node script can import it. `scripts/gen-kotlin-data.mjs` emits it into the
// Compose twin, and a .tsx module pulls React in and cannot be imported from
// Node. Same reasoning that keeps surfaces.ts out of a component.
//
// StoryMap.tsx re-exports all three names, so importers keep their old path.
import { BOOKS_BEFORE_BROS } from "./writingMeta.ts";

export type StoryNode = {
  id: string;
  label: string;
  sub?: string;
  x: number; // normalized 0..1
  y: number;
  r: number;
  color: string;
  target: string; // "#hash", external url, or "chat"
};

const GREEN = "#3ddc84";
const CYAN = "#5ee6ff";
const PURPLE = "#8f74ff";
const ORANGE = "#f0883e";

export const NODES: StoryNode[] = [
  { id: "sid", label: "SID", sub: "prototype → platform", x: 0.5, y: 0.46, r: 26, color: GREEN, target: "#top" },
  { id: "work", label: "Case studies", sub: "the numbers", x: 0.24, y: 0.2, r: 15, color: GREEN, target: "#work" },
  { id: "doori", label: "Doori", sub: "5 platforms", x: 0.1, y: 0.5, r: 14, color: GREEN, target: "#project/doori" },
  { id: "gaddi", label: "Gaddi", sub: "live web build", x: 0.2, y: 0.8, r: 12, color: GREEN, target: "#project/gaddi" },
  { id: "paymentslab-kmp", label: "PaymentsLab-KMP", sub: "gateway lab", x: 0.38, y: 0.88, r: 12, color: GREEN, target: "#project/paymentslab-kmp" },
  { id: "candidai", label: "Candidai", sub: "25-module KMP", x: 0.56, y: 0.68, r: 12, color: GREEN, target: "#project/candidai" },
  { id: "stutter", label: "STUTTER", sub: "time-loop game", x: 0.7, y: 0.58, r: 12, color: GREEN, target: "#project/stutter" },
  { id: "experience", label: "Experience", x: 0.62, y: 0.12, r: 11, color: CYAN, target: "#experience" },
  { id: "skills", label: "Skills", x: 0.4, y: 0.08, r: 11, color: CYAN, target: "#skills" },
  { id: "writing", label: "The Loopdown", sub: "field notes", x: 0.78, y: 0.34, r: 15, color: PURPLE, target: "#loopdown" },
  { id: "books", label: "Books Before Bros", sub: "the origin blog", x: 0.9, y: 0.64, r: 13, color: ORANGE, target: BOOKS_BEFORE_BROS.url },
  { id: "chat", label: "Ask my AI", sub: "knows all of this", x: 0.66, y: 0.84, r: 13, color: CYAN, target: "chat" },
  { id: "blueprint", label: "Blueprint Room", sub: "infinite canvas", x: 0.52, y: 0.16, r: 12, color: ORANGE, target: "#blueprint" },
];

// Wiring: hub feeds everything; the work feeds the writing; the writing
// descends from the blog; the AI has read the lot.
export const EDGES: [string, string][] = [
  ["sid", "work"], ["sid", "doori"], ["sid", "gaddi"], ["sid", "paymentslab-kmp"],
  ["sid", "candidai"], ["sid", "stutter"],
  ["sid", "experience"], ["sid", "skills"], ["sid", "writing"], ["sid", "chat"],
  ["doori", "writing"], ["work", "writing"], ["books", "writing"],
  ["doori", "gaddi"], ["gaddi", "paymentslab-kmp"], ["paymentslab-kmp", "candidai"], ["candidai", "stutter"],
  ["chat", "writing"], ["chat", "work"],
  ["sid", "blueprint"],
];
