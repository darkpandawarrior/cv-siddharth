
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

/*
 * Achievements were cut with the rest of the scope creep: six milestones on a
 * hub whose job is opening one of eight doors was a chore list, and every one
 * of them needed its own trigger, persistence and toast. The collection is the
 * one progression worth keeping, because each artifact carries a real fact.
 */
