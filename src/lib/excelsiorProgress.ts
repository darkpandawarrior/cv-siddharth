/**
 * Reading progress for the Excelsior reader — where a reader left off, per
 * edition, so leaving mid-issue doesn't mean starting over next time.
 *
 * Timeless on purpose: no `Date.now()`, no "3 days ago" string. The one place
 * this reaches an SSR'd surface is the "Continue reading" link on the
 * homepage shelf (`Excelsior.tsx`), which has to render identically on the
 * server and the first client paint — read only from a `useEffect`, never at
 * render time.
 *
 * try/catch on every access: private browsing, a full quota or storage
 * disabled outright all throw on `localStorage`, and none of that should ever
 * break the reader. Same shape as the other localStorage helpers in this repo
 * (`play/visitors.ts`'s `readVisitor`/`writeVisitor`, `play/GuestWall.tsx`'s
 * `readMine`/`rememberMine`).
 */
const KEY = "excelsior-progress";

export type ExcelsiorProgress = Record<string, { page: number; total: number }>;

export function readProgress(): ExcelsiorProgress {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as ExcelsiorProgress;
  } catch {
    return {};
  }
}

export function writeProgress(year: string, page: number, total: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = { ...readProgress(), [year]: { page, total } };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or a full quota — the reader still works, it just won't remember */
  }
}
