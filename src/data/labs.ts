/**
 * The Lab Bench instrument registry, lifted out of LabBench.tsx so that every
 * piece of prose quoting the instrument count derives it instead of hardcoding
 * it. Five separate strings used to carry "Nine" by hand (LabBench.tsx,
 * routes/lab.tsx, lib/routeHead.ts, data/profile.ts, App.tsx's room count) —
 * adding an instrument meant finding all five, and routeHead.ts's own comments
 * document what happens when a hand-maintained copy drifts.
 *
 * Plain data, no component imports: routeHead.ts runs on the SSR path, and
 * importing LabBench.tsx there would drag in SignalLab's leaflet dependency,
 * which touches `window` at module-load time.
 */

export type LabKey =
  | "signal"
  | "crashes"
  | "recompose"
  | "theme"
  | "modules"
  | "gateways"
  | "search"
  | "fanout"
  | "replay";

export type LabTab = {
  key: LabKey;
  label: string;
  metric: string;
  group: "production" | "personal";
};

export const LAB_TABS: LabTab[] = [
  { key: "signal", label: "Signal Lab", metric: "50% → 95%", group: "production" },
  { key: "crashes", label: "Crash Triage", metric: "-80%", group: "production" },
  { key: "recompose", label: "Recomposition", metric: "~87% Compose", group: "production" },
  { key: "theme", label: "White-label", metric: "80% faster", group: "production" },
  { key: "modules", label: "Module Graph", metric: "46 modules", group: "personal" },
  { key: "gateways", label: "Gateway Lab", metric: "66 gateways", group: "personal" },
  { key: "search", label: "Search Tree", metric: "10 personas", group: "personal" },
  { key: "fanout", label: "Provider Fan-out", metric: "62 providers", group: "personal" },
  { key: "replay", label: "Deterministic Replay", metric: "0-tolerance", group: "personal" },
];

const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
];

/** Spells a count for prose; numerals past the table. Capitalised — callers
 * lowercase it where a sentence needs that. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
