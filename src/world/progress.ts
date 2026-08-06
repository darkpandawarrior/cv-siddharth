import { ARTIFACTS } from "./artifacts.ts";

/**
 * What a visitor has done here, across visits.
 *
 * All of it is localStorage and none of it is a server: no accounts, no
 * leaderboard, nothing to moderate, nothing that stops working when an API key
 * expires. The design doc's "nothing server-side" rule applies to the whole
 * progress layer, not just the triathlon clock.
 *
 * Storage is wrapped because private browsing throws on write, and a visitor in
 * a locked-down browser should lose their progress, not the world.
 */

const ARTIFACT_KEY = "playground:artifacts";
const ACHIEVEMENT_KEY = "playground:achievements";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, value: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    /* private browsing — this session still works, it just won't be remembered */
  }
}

export const loadCollected = (): Set<string> => readSet(ARTIFACT_KEY);

/** Records a pickup. Returns false if it was already held, so callers can tell
 *  a genuine find from re-driving through the same spot. */
export function collect(id: string): boolean {
  const held = readSet(ARTIFACT_KEY);
  if (held.has(id)) return false;
  held.add(id);
  writeSet(ARTIFACT_KEY, held);
  return true;
}

/**
 * Milestones. Each names something a visitor DID, not something they were
 * given — every one of them corresponds to a mechanic the world would otherwise
 * have to explain in prose.
 *
 * The set is deliberately small. Twenty achievements would turn a portfolio into
 * a chore list; six mark the moments that are genuinely worth noticing, and the
 * last two are the only ones most visitors will never see.
 */
export type Achievement = {
  id: string;
  label: string;
  detail: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-flight", label: "Airborne", detail: "Left the ground under your own speed" },
  { id: "first-sail", label: "Afloat", detail: "Found out the car swims" },
  { id: "thermal", label: "Thermal rider", detail: "Climbed a column of rising air" },
  { id: "orbit", label: "Out of atmosphere", detail: "Reached orbit from a launch pad" },
  { id: "all-rooms", label: "Every door", detail: "Entered all eight rooms from the world" },
  {
    id: "all-artifacts",
    label: "Completionist",
    detail: `Collected all ${ARTIFACTS.length} artifacts — land, sea, sky and orbit`,
  },
];

export const loadUnlocked = (): Set<string> => readSet(ACHIEVEMENT_KEY);

/** Returns the achievement if this call is what unlocked it, else null. */
export function unlock(id: string): Achievement | null {
  const held = readSet(ACHIEVEMENT_KEY);
  if (held.has(id)) return null;
  const found = ACHIEVEMENTS.find((a) => a.id === id);
  if (!found) return null;
  held.add(id);
  writeSet(ACHIEVEMENT_KEY, held);
  return found;
}
