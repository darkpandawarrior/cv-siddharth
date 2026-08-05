# The Excelsior Reader — Level 2

Files read in full before writing this: `src/Flipbook.tsx`, `src/routes/excelsior.tsx`,
`src/Excelsior.tsx`, `src/data/excelsiorMarks.ts`, `src/data/excelsior.ts`,
`scripts/gen-excelsior.mjs`, the `.flipbook*` block in `src/index.css` (lines 1125–1372).

## Current state (honest)

- **Real 3-D page turn** (`Flipbook.tsx`): CSS `rotateY` leaf with front/back faces, true
  spreads via `pagesOf()`, cover-alone handling, one-turn-at-a-time lock, neighbour prefetch.
  This part is already good — level 2 does not touch the turn mechanic.
- **URL state**: `?year=&page=` round-trips through `validateSearch` in
  `routes/excelsior.tsx`. `ssr: false` on this route, so the whole reader is client-only —
  no hydration constraint inside `Flipbook.tsx` itself.
- **Contact sheet**: every page as a thumbnail grid, `role="dialog"`, focus-trapped, Escape
  to close. No indication in the grid of which pages matter.
- **Deep links** (`excelsiorMarks.ts`): 10 hand-verified marks, typed `"wrote" | "about" |
  "credit"`. Rendered as a chip row **above** the Flipbook in `routes/excelsior.tsx`
  (lines 72–93) — colour-coded (accent / accent2 / line) and already carries the exact
  distinction the brief asks for. It just stops at the entry point: once you're inside the
  reader turning pages, the chips are scrolled out of view and nothing in the flipbook
  itself tells you "you're standing on a marked page" or "here's another one three pages
  over."
- **No progress**: leaving the page and coming back starts at spread 0 (or wherever the URL
  says) every time. Nothing remembers page 90 of 128 was where you stopped.
- **No search**: the counter (`{left}–{right} / {total}`) is the only sense of place. For
  396 pages that's a page count, not a map.
- **No text layer, anywhere.** `excelsiorMarks.ts`'s own comment says it: *"the PDFs have no
  text layer, so OCR was only used to narrow down which pages to open."* `pdftoppm` in
  `gen-excelsior.mjs` rasterises straight to WebP. There is currently no machine-readable
  text for any of the 396 pages. "Search across pages" is not a UI gap, it's a missing data
  pipeline stage — item 4 below treats it as such.

## What level 2 is

Level 2 does not add features to the flipbook so much as it makes the **396 pages
legible as one object** instead of a stack you turn through blind. Four things, each
targeting one named gap: remember where you were (progress), see what kind of page you're
on without leaving the reader (wrote-vs-about, surfaced in-place not just pre-entry),
see where you are in the whole and where the marked pages sit relative to you (a scrubber,
not just a fraction), and — the one real data-pipeline addition — be able to ask the
magazine a question instead of paging through it blind (OCR-backed search, generated
offline exactly the way the page images already are, shipped as a lazily-fetched static
JSON, not bundled).

Nothing here touches the turn animation, the URL-state contract, or the contact sheet's
existing focus/escape handling — those are already right.

---

## Concrete changes, ordered by value ÷ risk

### 1. Reading progress (cheapest, safest, do first)

**New file** `src/lib/excelsiorProgress.ts` — a typed localStorage helper, same shape as
the existing precedents in this repo (`Terminal.tsx`'s `HISTORY_KEY`,
`play/GuestWall.tsx`'s `MINE_KEY`, `play/Visitors.tsx`'s `readVisitor`/`writeVisitor`):

```ts
const KEY = "excelsior-progress";
type Progress = Record<string, { page: number; total: number }>; // keyed by year

export function readProgress(): Progress {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}
export function writeProgress(year: string, page: number, total: number) {
  if (typeof localStorage === "undefined") return;
  const next = { ...readProgress(), [year]: { page, total } };
  localStorage.setItem(KEY, JSON.stringify(next));
}
```

No timestamp, no "3 days ago" string — that needs `Date` at render time and this data
can flow into an SSR'd component (see below), so keep it timeless. `page`/`total` is
already everything `Flipbook.tsx` computes every render.

**`routes/excelsior.tsx`**: in the existing `onPageChange` handler (line 100), add one line
— `writeProgress(String(year), p, total)` — where `total` comes from
`excelsiorEditions.find(...)`. This route is `ssr: false`, so no guard needed beyond the
helper's own `typeof localStorage` check (defense in depth, costs nothing).

**`Flipbook.tsx` flipbook-bar**: the counter already computes `left`/`right`/`total` every
render — add a percentage next to it, pure arithmetic, no new state:
```tsx
<p className="flipbook-counter" aria-live="polite">
  {left && right ? `${left}–${right}` : (left ?? right)} / {total}
  <span className="flipbook-percent"> · {Math.round(((left ?? right ?? 1)) / total * 100)}%</span>
</p>
```

**`src/Excelsior.tsx` (the shelf, mounted on the SSR'd homepage via `WritingSection.tsx`)**:
add a "Continue reading, page N" line to `EditionCard`. This is the one place progress
touches an SSR surface, so it must follow the pattern already used elsewhere in this repo
(`play/Visitors.tsx` computes its client-only state in a `useEffect`, never at render):

```tsx
const [resume, setResume] = useState<number | null>(null);
useEffect(() => { setResume(readProgress()[ed.year]?.page ?? null); }, [ed.year]);
// ...
{resume && resume > 1 && (
  <Link to="/excelsior" search={{ year: Number(ed.year), page: resume }} className="magazine-action magazine-action-quiet">
    Continue, page {resume}
  </Link>
)}
```
First paint (server and client, pre-hydration) renders nothing extra — `resume` is `null`
until the effect runs, so SSR output and the first client render match. This is opt-in,
not an auto-redirect: the URL is still the only thing that decides what spread loads,
per the comment already in `Flipbook.tsx` lines 53–54. Don't make progress silently
override the URL — that's a bigger, sneakier bug than the one being fixed.

**Risk**: near zero. Additive state, one new tiny file, no new deps.

### 2. Surface "wrote vs about" inside the reader, not just before it

The distinction already exists (`excelsiorMarks.ts` `kind` field) and is already rendered
with the right colours in `routes/excelsior.tsx` — it just stops at the chip row above the
book. Bring it into the two places you actually spend time: the contact sheet and the
current-page state.

**`Flipbook.tsx`**: accept a new prop `marks: ExcelsiorMark[]` (the marks for the *current*
edition only — filter in `routes/excelsior.tsx` before passing down:
`excelsiorMarks.filter(m => Number(m.year) === year)`).

- Pass `marks` through to `ContactSheet`. In the thumbnail grid, tag any `n` that has a
  matching mark with a small corner dot, reusing the exact glyph/colour convention the
  chip row already established (✎ amber for `wrote`, ❝ cyan for `about`, ✦ neutral for
  `credit`):
  ```tsx
  const mark = marks.find((m) => m.page === n);
  // ...
  <button key={n} ... className={`flipbook-thumb ${mark ? `flipbook-thumb-${mark.kind}` : ""}`}>
    <img ... />
    {mark && <span className="flipbook-thumb-mark" aria-hidden>{mark.kind === "wrote" ? "✎" : mark.kind === "about" ? "❝" : "✦"}</span>}
    <span>{n}</span>
  </button>
  ```
  Screen-reader text: extend the thumb `<button>`'s accessible name (currently just the
  `<img alt>`) so a mark is announced — `aria-label={mark ? `Page ${n} — ${mark.label}` : undefined}`.

- In the main spread: when `left`/`right` matches a mark's `page`, show a small pill in
  `flipbook-bar` next to the counter (`flipbook-mark-badge`, same colour classes as the
  chip row in `routes/excelsior.tsx`) — "You're on: The Loopdown" for a `wrote` page, etc.
  This is the moment-of-arrival version of the chip row, not a duplicate of it.

**CSS** (`src/index.css`, appended after the existing `.flipbook-thumb` rules ~line 1348):
`.flipbook-thumb-wrote`, `.flipbook-thumb-about` border-tint the thumbnail using the same
`--color-accent` / `--color-accent2` tokens the chip row already uses; `.flipbook-thumb-mark`
positions the glyph top-left (the page number `<span>` already owns bottom-right).

**Risk**: low. No new data, no new state — just threading an already-loaded, already-typed
array one level deeper and reusing an existing colour convention.

### 3. A scrubber, so "396 pages" reads as a position, not a count

Replace the plain-text fraction with an interactive position control. This is the one that
actually answers "does a 396-page artefact feel navigable."

**`Flipbook.tsx`**: add a second way to move — a direct `jump(targetSpread)` that sets
`spread` without going through `go()`'s animation lock (scrubbing fast across 60 spreads
must not try to animate every intermediate one):
```ts
const jump = useCallback((target: number) => {
  setFlip(null);
  clearTimeout(timer.current);
  setSpread(Math.max(0, Math.min(target, lastSpread(total))));
}, [total]);
```
Replace `<p className="flipbook-counter">` with a labelled range plus the existing text
(keep the text — it's the a11y-safe `aria-live` announcer; the range is the visual/motor
affordance layered on top, not a replacement for it):
```tsx
<div className="flipbook-scrubber">
  <input
    type="range"
    min={0}
    max={lastSpread(total)}
    value={spread}
    onChange={(e) => jump(Number(e.target.value))}
    aria-label={`Page ${left ?? right} of ${total}`}
    className="flipbook-scrubber-track"
  />
  {marks.map((m) => (
    <span
      key={m.page}
      className={`flipbook-scrubber-tick flipbook-scrubber-tick-${m.kind}`}
      style={{ left: `${(Math.floor(m.page / 2) / lastSpread(total)) * 100}%` }}
      title={m.label}
      aria-hidden
    />
  ))}
</div>
<p className="flipbook-counter" aria-live="polite">…</p> {/* unchanged, kept for SR + percent */}
```
`<input type="range">` is a native control (ladder rung 4) — free keyboard support
(arrow keys move it by 1, Home/End jump to ends, all already expected behaviour for a
range), free touch dragging, no library. The existing `window`-level `ArrowLeft`/`ArrowRight`
listener in `Flipbook.tsx` (lines 77–87) still drives `go()` for the animated single-step
turn when focus is anywhere else on the page; when focus is *on* the range itself, the
browser's native range key handling takes over for that element, which is standard and
expected — don't fight it by calling `preventDefault` inside the range's own `onKeyDown`.

Tick marks are `position: absolute` divs over the track (native `<datalist>` tick rendering
is inconsistent enough across browsers that a styled overlay, matching how `flipbook-thumb`
already does absolute-positioned overlays, is the more reliable rung here).

**CSS**: `.flipbook-scrubber { position: relative; flex: 1; }`, `.flipbook-scrubber-track`
styled per the existing hairline/amber/cyan direction (`appearance: none`, thin track,
amber thumb), `.flipbook-scrubber-tick` 2px-wide ticks in accent/accent2/muted matching
the mark-kind colours from item 2.

**Risk**: medium. It's the one genuinely new interactive control, so it's the one that
needs an explicit pass through `e2e/a11y.spec.ts` (axe) and manual keyboard testing —
range inputs are usually clean on axe, but verify with the real 16-surface run before
calling this done.

### 4. Search across pages (highest value, highest effort — real data pipeline, not just UI)

This is the one item that isn't "wire up data that already exists" — it requires
generating data that doesn't exist yet. Scope it honestly: OCR of scanned, laid-out
magazine pages (stylised mastheads, pull quotes, columns) will miss things. That's fine —
this is "find the page you half-remember," not a legal-grade index. Ship it as best-effort
and say nothing stronger in the UI.

**New script** `scripts/gen-excelsior-text.mjs`, sibling to `scripts/gen-excelsior.mjs` and
following its exact convention: manual/occasional, NOT in `prebuild`, output committed,
gitignored cache for anything heavy. `tesseract` is already on the machine that runs
`gen-excelsior.mjs` (same "system dependency, not npm package" posture as `poppler`) —
confirmed present at `/opt/homebrew/bin/tesseract` on this machine. No new npm dependency.

```js
// node scripts/gen-excelsior-text.mjs   — OCRs any page missing from the text manifest.
// Requires: tesseract (`brew install tesseract`), same posture as poppler in gen-excelsior.mjs.
import { execFileSync } from "node:child_process";
// for each year/page: tesseract <page>.webp stdout --psm 6  →  lowercase, collapse whitespace
// write public/excelsior/text/<year>.json as { [pageNumber]: string }
```
`--psm 6` (uniform block of text) is a reasonable default for magazine columns; this is a
one-line flag to tune per-edition if a first pass comes back noisy — leave it as a
calibration knob (a `ponytail:`-style comment naming it), don't over-engineer a
multi-pass PSM-detection heuristic for a 3-edition corpus.

**Output shape**: `public/excelsior/text/2021.json`, `.../2020.json`, `.../2019.json` —
plain static assets, **not** `src/data/*.ts` imports. `excelsiorMarks.ts` living as a TS
import is fine at 10 entries; doing the same for ~400 OCR'd page strings would ship
recruiter-facing JS that nobody asked to download just to turn a page. Fetch on demand.

**New component** `src/ExcelsiorSearch.tsx`, structurally a sibling of `ContactSheet`
(same `role="dialog"`, same focus-on-open + Escape-to-close contract already proven in
`Flipbook.tsx`'s `ContactSheet` and `Excelsior.tsx`'s masthead lightbox — reuse that
pattern, don't invent a third):
```tsx
export function ExcelsiorSearch({ year, onPick, onClose }: {...}) {
  const [text, setText] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    fetch(`/excelsior/text/${year}.json`).then((r) => r.json()).then(setText);
  }, [year]);
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    if (!text || q.trim().length < 2) return [];
    const needle = q.toLowerCase();
    return Object.entries(text).filter(([, t]) => t.includes(needle)).slice(0, 30);
  }, [text, q]);
  // render: input + result list, each result → onPick(Number(page))
}
```
`.filter(...).includes(...)` over ≤144 short strings per edition is rung-3 stdlib — no
Fuse.js/MiniSearch/FlexSearch. Add a fuzzy-match library only if plain substring search
turns out to miss too much in practice; don't pre-install one speculatively.

**`Flipbook.tsx` flipbook-tools**: one more icon button next to the existing `Grid3x3`/
`Download` pair — `<Search size={15} />` (lucide, already a dependency) opening
`ExcelsiorSearch`, wired the same way `sheet` state already opens `ContactSheet`.

**Risk**: highest of the four. New offline tooling (tesseract), a new fetched-JSON
surface, a new dialog. Contain the blast radius by keeping it fully additive and fully
optional: if `public/excelsior/text/<year>.json` is simply never generated for an edition,
the fetch 404s, `text` stays `null`, and the search dialog shows "search isn't available
for this edition" rather than throwing — the reader must work exactly as it does today if
this step is skipped entirely.

---

## A11y + reduced-motion + SSR notes

- **`e2e/a11y.spec.ts` runs axe with no allowlist.** Every new interactive element here —
  the range input, the search button, the search dialog, the continue-reading link — needs
  a real accessible name (`aria-label` on the range; the search button needs one too, e.g.
  `aria-label="Search this issue"`) before that suite is trusted again.
- **Reduced motion**: `jump()` (item 3) already never sets `flip` state, so it produces no
  animation to begin with — no new media-query branch needed there. The existing
  `@media (prefers-reduced-motion: reduce)` block (`index.css` ~1365) that hides
  `.flipbook-leaf` on animated turns is untouched by any of this and still covers `go()`.
- **SSR**: `routes/excelsior.tsx` is `ssr: false`, so items 1 (progress-write side), 2, 3,
  4 all live entirely on the client with no hydration concern. The **one** SSR-touching
  piece is the "Continue reading" link on the homepage shelf (`Excelsior.tsx`, mounted via
  `WritingSection.tsx` on the default-SSR `/` route) — it must set its resume state inside
  `useEffect`, never read `localStorage` or compute anything conditionally at render time,
  exactly like the existing `play/Visitors.tsx` guard (`typeof localStorage === "undefined"`)
  already does elsewhere in this repo. No `Date.now()`/relative-time string anywhere in
  this feature — the progress record intentionally carries no timestamp, so there's nothing
  time-based to get wrong between server and client render.
- **Search fetch** must not run at SSR either — it's inside `ExcelsiorSearch`, only mounted
  client-side when the dialog opens (`sheet`-style boolean gate), so this is automatic, not
  something to add a guard for.

## What NOT to do

- **Don't auto-jump to the last-read page from the URL/route loader.** Progress is a
  read-only *offer* ("Continue, page N") the reader clicks, never a silent redirect that
  overrides `?year=&page=` — the code's own comment (`Flipbook.tsx` 53–54) already
  established the URL as the single source of truth for "which page am I on"; don't grow a
  second, competing source of truth that fires before the URL does.
- **Don't chase OCR perfection.** No preprocessing pipeline, no per-column segmentation, no
  multi-pass PSM voting. One `tesseract --psm 6` pass, committed output, re-run by hand if
  a specific page comes back unusably garbled. This is a "find the page" tool, not a
  transcription project.
- **Don't bundle the OCR text as a TS import.** `excelsiorMarks.ts`-style `import` is right
  for 10 hand-curated entries; it is wrong for ~400 OCR'd page bodies. Static JSON under
  `public/`, fetched only when the search dialog opens.
- **Don't add a search library** (Fuse.js/MiniSearch/FlexSearch/Lunr) for 396 short strings.
  `Array.prototype.filter` + `String.prototype.includes` is the whole job at this size.
- **Don't let the scrubber replace keyboard `ArrowLeft`/`ArrowRight` turning.** Both
  coexist: the range is a new way to jump, the existing `window` keydown listener is
  unchanged and still owns the animated single-step turn everywhere focus isn't on the
  range itself.
- **Don't virtualize the contact sheet grid.** Max 144 pages per edition, already
  `loading="lazy"` on every `<img>` — a virtualization library would be solving a problem
  this size of dataset doesn't have.
- **Don't touch the turn animation, the `pagesOf`/`lastSpread` spread math, or the
  `ssr: false` / `validateSearch` contract in `routes/excelsior.tsx`.** All four changes
  above are additive on top of that — none of them require touching it, so don't.
