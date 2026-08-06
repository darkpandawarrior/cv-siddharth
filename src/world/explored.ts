/**
 * Which rooms have been entered from the world, persisted across visits.
 *
 * Its own module rather than living beside the HUD components: it is storage
 * logic with no JSX, and co-locating it with components trips
 * react-refresh/only-export-components — a real warning, since a file mixing
 * the two loses fast-refresh for the components in it.
 */
const EXPLORED_KEY = "playground:explored";

/** Rooms entered from the world. Safe when storage is unavailable. */
export function loadExplored(): string[] {
  try {
    const raw = localStorage.getItem(EXPLORED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function markExplored(to: string): void {
  try {
    const seen = new Set(loadExplored());
    if (seen.has(to)) return;
    seen.add(to);
    localStorage.setItem(EXPLORED_KEY, JSON.stringify([...seen]));
  } catch {
    /* private browsing — exploring just doesn't persist, which is survivable */
  }
}

