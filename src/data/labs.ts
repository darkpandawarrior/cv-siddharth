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
 * which touches `window` at module-load time. The provider count comes from
 * data/hiresignal.ts and NOT from profile.ts for a related reason: profile.ts
 * re-exports siteRooms from surfaces.ts, surfaces.ts imports this file, and
 * reaching back into profile.ts from here closes that ring — LAB_TABS reads as
 * undefined in whichever module loses the race.
 */
import { providerCount } from "./hiresignal.ts";

export type LabKey =
  | "signal"
  | "crashes"
  | "recompose"
  | "theme"
  | "modules"
  | "gateways"
  | "search"
  | "fanout"
  | "replay"
  | "chess-search"
  | "chess-clock";

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
  // Interpolated, not typed. This said 62 while the case study two files over
  // said 78, because the generator that moves the case study's number had no
  // pattern for a tab label — the lab understating the work it exists to show.
  { key: "fanout", label: "Provider Fan-out", metric: `${providerCount} providers`, group: "personal" },
  { key: "replay", label: "Deterministic Replay", metric: "0-tolerance", group: "personal" },
  { key: "chess-search", label: "Chess Search", metric: "alpha-beta", group: "personal" },
  { key: "chess-clock", label: "Clock Burn", metric: "+8.5 pts", group: "personal" },
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

/* ── The deep-link signal ─────────────────────────────────────────────────
 *
 * A case-study card opens a specific bench tab: openLab(tab), then navigate to
 * /lab. If the bench is already mounted the event reaches it; if the route is
 * about to mount it fresh, `pendingLab` carries the choice across.
 *
 * It lives HERE, next to the registry, and not in LabBench.tsx — for the same
 * reason the registry itself was moved out, one consumer later. App.tsx wants
 * `openLab` and nothing else from the bench, and importing it from LabBench.tsx
 * put the entire bench in the homepage's own chunk: 53 kB of instruments, plus
 * their scene code, downloaded by every visitor to `/` so that two buttons
 * could set a string before navigating away. This module is plain data with no
 * React import, which is what makes it safe to reach for from anywhere.
 */
const OPEN_LAB_EVENT = "open-lab";
let pendingLab: LabKey | null = null;

export function openLab(tab: LabKey) {
  pendingLab = tab;
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new CustomEvent(OPEN_LAB_EVENT, { detail: tab }));
}

/**
 * Read and clear are deliberately separate calls, not one `take()`.
 *
 * The bench reads this from a useState initializer, and React invokes those
 * twice under StrictMode — a read that also cleared would hand the tab to the
 * first invocation and "signal" to the second. Peek in the initializer, clear
 * in the effect, exactly as the bench did when both lived in one file.
 */
export function peekPendingLab(): LabKey | null {
  return pendingLab;
}

export function clearPendingLab() {
  pendingLab = null;
}

/** Subscribes to openLab() calls while the bench is mounted. Returns an
 *  unsubscribe, so a caller's effect can just `return onOpenLab(...)`. */
export function onOpenLab(handler: (tab: LabKey) => void): () => void {
  const listener = (e: Event) => {
    const tab = (e as CustomEvent).detail as LabKey;
    if (LAB_TABS.some((x) => x.key === tab)) handler(tab);
  };
  window.addEventListener(OPEN_LAB_EVENT, listener);
  return () => window.removeEventListener(OPEN_LAB_EVENT, listener);
}
