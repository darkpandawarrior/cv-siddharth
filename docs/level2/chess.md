# The Chess World — Level 2

Files read in full before writing this: `src/ChessRoom.tsx`, `src/ChessArc.tsx`,
`src/chess/{BoardSurface,calibration,calibration.test,ChessArcScene,ChessBoardPane,
ChessFindings,ChessVsCommits,DailyPuzzle,engine.worker,engineClient,GraveyardScene,
GuessTheMove,repertoireModel,repertoireModel.test,RepertoireTreeScene,search,
search.test}.ts(x)`, `src/data/chess.ts` (structure + `thesis`/`repertoire`/`platforms`
blocks), `src/labs/ChessSearchLab.tsx`, `src/LabBench.tsx`, `src/App.tsx` (the
`openLab`/`LAB_OF` call sites), `src/routes/chess.tsx`, `src/data/labs.ts`,
`e2e/a11y.spec.ts` (the chess-pane loop).

## Correction to the brief, up front

The brief says the mined finding is "~74% of decided games were settled by the
clock." The live corpus disagrees: `src/data/chess.ts` → `thesis.decidedOnClock`
is **0.418** (41.8%), from a 3,104-game blitz sample carrying clock annotations
(`thesis.sampleSize`). `lossesOnTime` is 0.502, `winsOnTime` is 0.334 — "half of
every loss was a timeout" is the number this room actually has, not
three-quarters. I did not find a 0.74 anywhere in the generated file. Nothing
below invents or repeats the 74% figure; everything cites `chess.thesis.*` as
it exists today. If 74% comes from a different derivation the generator
(`scripts/gen-chess-stats.mjs`) doesn't currently compute, that's a separate,
prior task — not something to fudge in JSX. Per the claim-audit rule, this is
flagged rather than silently corrected in prose.

## Current state (honest)

**The engineering is real and good, and it is hiding in the wrong room.**
`src/chess/search.ts` is a genuine hand-rolled negamax/alpha-beta search over
`chess.js` legality — SAN-string move ordering chosen and measured against the
verbose form (a documented ~20x node-throughput win), iterative deepening with
a wall-clock budget, mate-distance scoring, a seeded PRNG (`mulberry32`) for
reproducible noise. `src/chess/calibration.ts` models the *exact shape* of the
clock finding as a bell-curve thinking-time budget (`clockBudget()`) so the bot
literally reproduces the behavioural flaw the corpus found, not just its
rating. This is precisely the "engineer who debugs the loop" half of the site's
thesis, executed well, in code that already carries the receipts in comments.

But none of that is visible from `/chess`. `ChessBoardPane.tsx` (the "Play the
Bot" tab) tells the reader in one sentence that it's "an alpha-beta search
running in a Web Worker" and stops there — no tree, no node count context, no
link to proof. The actual proof already exists: `src/labs/ChessSearchLab.tsx`,
mounted on the **`/lab`** route via `LabBench.tsx`, draws the real search tree
live (canvas replay of the actual `TreeEdge[]` the worker returns — "not a
simulation," per its own comment) and even ends with a link back — `Link to
"/chess"`, "play the engine → the chess room." The link only runs one way. A
recruiter who opens `/chess`, reads "The Findings," clicks "Play the Bot," and
is told it's "an alpha-beta search" has no path to the one place on this site
that proves that sentence. The best evidence for "his work, not a library" is
one route away and undiscoverable from here.

**The finding is already the landing tab, and it already reads well** — the
headline sentence in `ChessFindings.tsx` fires immediately, backed by a decile
table with a small inline bar per row. That's a real strength, not a gap: the
brief's "make the finding land in one screen" is mostly already true. What's
missing is that the table is the *only* way to absorb the shape of the
divergence — there's no chart, just ten rows of tabular-nums a reader has to
parse to see that losses bleed clock earlier than wins. And the tab order
buries the thing that makes the finding *actionable* — the bot that was tuned
to have the same flaw — five tabs deep, after two 3D scenes and a repertoire
table that have nothing to do with the engineering.

**Seven tabs, and the pattern-recognition/engineering split is invisible in
the tab strip itself.** Current order: `findings, arc, graveyard, repertoire,
play, puzzle, rhythm`. "Findings" (the analysis) and "Play the Bot" (the
engineering that encodes the analysis) are the two tabs that matter most for a
Lead-track screen, and they're separated by two data-visualisation tabs that
say nothing about either.

**A11y is already solid here and must not regress.** `BoardSurface.tsx`'s
`MutationObserver` patch for dnd-kit's unnamed draggable buttons is a real,
already-shipped remediation (documented: 32 serious violations on an untouched
board without it). `e2e/a11y.spec.ts` already walks all seven chess tabs by
clicking, by accessible name, and scans each. Every change below is designed
to not need a new entry in that loop, and to not touch `BoardSurface.tsx`.

## What level 2 is

Level 2 is not "add features." The build is already there — a real search
algorithm, a real calibration model, a real accessibility remediation, real
generated data. Level 2 is **closing the loop the codebase already built and
then split across two routes**: reader hits the finding, reader is one click
from the engine that was tuned to reproduce that exact finding, reader is one
more click from watching that engine's actual search tree grow, live, in a
canvas that already exists and already links back here — it just never links
*forward*. Level 2 also means the flagship number is seen, not just read: a
small SVG divergence chart sitting where the eye already lands, using the
CAL-1 tokens the rest of the site is being re-themed onto, so this room's
proof-of-work doubles as an on-brand demonstration of the visual language
rather than a wall of monospace percentages. And level 2 means the tab strip
itself tells the "engineer who debugs the loop" story in its reading order,
not just in what's inside each tab.

## Concrete changes, ordered by value ÷ risk

### 1. Extract `openLab` out of `LabBench.tsx` into its own module

**File: new `src/labNav.ts`.** `LabBench.tsx` currently defines `pendingLab`,
`openLab()`, and the `OPEN_LAB_EVENT` constant at module scope (lines 39–52),
alongside *static* imports of nine lab panes (`CrashLab`, `RecomposeLab`,
`ThemeLab`, `ModuleGraphLab`, `GatewayLab`, `SearchTreeLab`, `FanoutLab`,
`ReplayLab`, `ClockLab`). `App.tsx` already imports `openLab` straight from
`"./LabBench.tsx"` (line 41) to wire the case-study cards' deep links — which
means the home route is already paying for those nine lab panes' worth of
static imports just to get one function. Chess should not repeat that mistake
onto its own route: `/chess` has its own careful lazy-loading discipline
(every 3D scene and the board itself are `lazy()`-loaded specifically so
panes nobody opens cost nothing), and importing `openLab` from `LabBench.tsx`
inside `ChessBoardPane.tsx` would drag all nine lab panes into the Play tab's
chunk to reach one six-line function.

Move just the navigation primitive:

```ts
// src/labNav.ts
import type { LabKey } from "./data/labs.ts";
export type { LabKey };

const OPEN_LAB_EVENT = "open-lab";
let pendingLab: LabKey | null = null;

export function consumePendingLab(): LabKey | null {
  const tab = pendingLab;
  pendingLab = null;
  return tab;
}

export function openLab(tab: LabKey) {
  pendingLab = tab;
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new CustomEvent(OPEN_LAB_EVENT, { detail: tab }));
}

export { OPEN_LAB_EVENT };
```

`LabBench.tsx` deletes its own copy (lines 39–52) and instead does
`export { openLab } from "./labNav.ts"; export type { LabKey } from
"./labNav.ts";` so `App.tsx`, `ProjectDetail.tsx`, and `rooms.tsx` — the three
other current importers — need zero changes. Its `useState<LabKey>(() =>
pendingLab ?? "signal")` becomes `useState<LabKey>(() => consumePendingLab()
?? "signal")` (same one-shot-consume semantics, now explicit instead of a
bare module read). Its listener for `OPEN_LAB_EVENT` imports the constant from
`labNav.ts` instead of redeclaring it.

Ladder: this is rung 2 (reuse what's already built) done properly — the
feature (`openLab`) already exists, it's just entangled with nine panes it
doesn't need. Splitting it is the smaller diff than either duplicating the
function in `chess/` or accepting the bloat.

### 2. Link "Play the Bot" forward to the live proof it currently only links back from

**File: `src/chess/ChessBoardPane.tsx`.** Add, near the existing "Both bots
are named after real ratings…" paragraph (line ~292), a link using the exact
pattern `App.tsx` already uses four times (`openLab(key); navigate({ to:
"/lab" })`):

```tsx
import { useNavigate } from "@tanstack/react-router";
import { openLab } from "../labNav.ts";
// ...
const navigate = useNavigate();
// ...
<button
  type="button"
  onClick={() => { openLab("chess-search"); navigate({ to: "/lab" }); }}
  className="mt-2 font-mono text-[11px] text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-dim"
>
  Watch this exact search build its tree, live →
</button>
```

`"chess-search"` is already a valid `LabKey` (`src/data/labs.ts` line 44).
This closes the loop `ChessSearchLab.tsx` opened one-way: it already says
"play the engine → the chess room"; now the chess room says the reverse. Zero
new routes, zero new components, one existing `LabKey` wired through one
existing navigation primitive.

A11y: `ChessBoardPane`'s pane is already in `e2e/a11y.spec.ts`'s
`CHESS_PANES` (`"Play the Bot"`), so the new button is scanned for free — a
real `<button>`, no new test entry needed.

### 3. Close the loop the other direction: the finding names the bot that was tuned to repeat it

**Files: `src/ChessRoom.tsx`, `src/chess/ChessFindings.tsx`.** Right now
`ChessFindings` renders standalone (`export function ChessFindings()`, no
props) because it's driven entirely by the bundled `chess.ts`, not the fetched
corpus — that's a deliberate, correct choice (it's why Findings is the default
tab and doesn't wait on the 254 KB fetch) and nothing here should undo it. Add
one optional callback prop instead of a route:

```tsx
// ChessRoom.tsx
{tab === "findings" && (
  <>
    <h3 ...>{active?.label}</h3>
    <ChessFindings onPlayTheEngine={() => setTab("play")} />
  </>
)}
```

```tsx
// ChessFindings.tsx
export function ChessFindings({ onPlayTheEngine }: { onPlayTheEngine?: () => void }) {
  // ...
```

In the "THE THESIS" card, directly under the decile table (after line ~147,
inside the same `<article>`), add:

```tsx
{onPlayTheEngine && (
  <button
    type="button"
    onClick={onPlayTheEngine}
    className="mt-4 self-start font-mono text-[11px] text-accent underline decoration-accent/40 underline-offset-2 transition hover:text-accent-dim"
  >
    Play the bot tuned to repeat this habit →
  </button>
)}
```

This is a plain in-room tab switch (`ChessRoom`'s own `useState<ChessTab>`),
not a navigation — cheapest possible wiring, and it's the button a recruiter
who just read the headline stat actually wants: not "here's more data" but
"show me you built something *because* of this."

A11y: the button lives inside the default-landing "Findings" pane, which the
existing `/chess` entry in the top-level `SURFACES` loop in `e2e/a11y.spec.ts`
already scans (the loop scans "the shell plus the default pane," per its own
comment at line ~116) — no test change needed.

### 4. Reorder the tab strip so the engineering sits next to the finding it answers

**File: `src/ChessRoom.tsx`, the `TABS` array (line 47).** Current order:
`findings, arc, graveyard, repertoire, play, puzzle, rhythm`. New order:

```ts
const TABS: { key: ChessTab; label: string }[] = [
  { key: "findings", label: "The Findings" },
  { key: "play", label: "Play the Bot" },
  { key: "arc", label: "The Arc" },
  { key: "graveyard", label: "The Graveyard" },
  { key: "repertoire", label: "Repertoire" },
  { key: "puzzle", label: "Guess the Move" },
  { key: "rhythm", label: "Rhythm" },
];
```

Rationale: "Findings" states the pattern, "Play the Bot" is the engineering
that encodes it — those two belong adjacent, before the three data-viz tabs
(Arc/Graveyard/Repertoire) that are about the corpus rather than the build.
"Guess the Move" and "Rhythm" stay last; they're the lightest, most
tangential panes.

Risk: **zero to the a11y test.** `e2e/a11y.spec.ts`'s `CHESS_PANES` array
(line ~137) selects each tab with `page.getByRole("button", { name: pane.tab
})` — by accessible name, not position — and iterates its own list in its own
order, independent of `TABS`. Reordering `TABS` doesn't reorder or break that
loop. (Renaming a label *would* require a matching one-line edit to
`CHESS_PANES` — this change doesn't rename anything, so it isn't needed.)

`type ChessTab` and `TABS` array order also happen to be the same array the
component maps over for the button strip (`ChessRoom.tsx` line ~444), so this
is a one-array-literal change with no other call sites to touch.

### 5. Give the flagship finding a chart, not just a table — and make it the CAL-1 demonstration piece

**File: `src/chess/ChessFindings.tsx`**, inside the "THE THESIS" card, above
the existing `<table>` (kept — "no deletions" — the table remains the
detailed/accessible data, the chart becomes the at-a-glance read). Reuse the
exact SVG technique `ChessArc.tsx` already established for this codebase:
`viewBox`, `preserveAspectRatio="none"`, `vectorEffect="non-scaling-stroke"`
on every line, no `<text>` inside the SVG (labels are HTML, so they don't
squash under the non-uniform scale), and colour via the CSS custom properties
— `var(--color-accent)` (CAL-1 Channel A, amber, `#f2a13d`) for **losses** and
`var(--color-accent2)` (Channel B, cyan, `#4fd6e0`) for **wins** — the exact
"measured vs. baseline" pairing the site's visual language already commits to,
applied to real data rather than decoration. The thesis is never named in the
copy; the chart just *is* two lines diverging, which is the structural
expression the guardrail asks for.

```tsx
const W = 400, VB_H = 60, INSET = 4;
const xAt = (i: number) => INSET + (i / (chess.thesis.deciles.length - 1)) * (W - 2 * INSET);
const yAt = (v: number) => VB_H - v * VB_H; // v is already a 0–1 fraction
const path = (key: "win" | "loss") =>
  chess.thesis.deciles.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`).join(" ");

<svg viewBox={`0 0 ${W} ${VB_H}`} preserveAspectRatio="none" style={{ height: 72 }}
     className="mt-4 w-full rounded-lg border border-line bg-ink" aria-hidden>
  <polyline points={path("win")} fill="none" stroke="var(--color-accent2)" strokeWidth="1.75"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  <polyline points={path("loss")} fill="none" stroke="var(--color-accent)" strokeWidth="1.75"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
</svg>
<div className="mt-1.5 flex gap-4 font-mono text-[11px]">
  <span className="text-accent2">— wins</span>
  <span className="text-accent">— losses</span>
</div>
```

No new dependency, no new component file — it's ~15 lines inside the file
that already renders the data it charts. `aria-hidden` on the SVG because the
table immediately below it (already captioned, already the case study's
established text-alternative pattern from `ChessArc`/`ChessVsCommits`) is the
accessible version of the same numbers; nothing new to write for a screen
reader. No animation, so no `prefers-reduced-motion` branch needed — same
reasoning `ChessVsCommits.tsx` already documents for its own static SVG
("2 points and two paths do not need a render loop").

### 6. Make the calibration copy cite the number it's calibrated against

**File: `src/chess/ChessBoardPane.tsx`.** The intro paragraph (line ~200-205)
already says the bot's clock habit is real ("tuned to two ratings he actually
held — including the clock habit, so it burns its thinking time through the
middlegame and hurries the finish") but never quotes the finding it's tuned
against, and doesn't import `chess.thesis` at all (`ChessBoardPane.tsx`
already imports `chess` from `"../data/chess.ts"` for `chess.bestUpset`, so
`chess.thesis` is one property away). One sentence:

```tsx
The pacing isn&rsquo;t cosmetic: {(chess.thesis.decidedOnClock * 100).toFixed(1)}%
of his own decided games were settled by the clock, not the board — this
worker&rsquo;s thinking-time budget is that same curve, played back as a
search deadline.
```

(Or reuse the `pct()` helper pattern already established in `ChessFindings.tsx`
— a two-line local const, not a new shared util, since it's one call site.)
This is the sentence that makes "demonstrably his work" land: not "trust me,
I wrote a search," but "here is the number, and here is the code that turns
the number into a behaviour, and you can watch it happen" (linking to item 2).

## Ordered lower-priority items (real, but not the top of the value÷risk stack)

### 7. CAL-1 hex debt specific to this room

Three files still hardcode the pre-CAL-1 green/cyan instead of reading the
now-live `--color-accent` (`#f2a13d`) / `--color-accent2` (`#4fd6e0`) tokens
in `src/index.css`:

- `src/chess/BoardSurface.tsx` line 60: `HIGHLIGHT = "rgba(61,220,132,"` (the
  selected-square/legal-move highlight), and lines 140-141:
  `darkSquareStyle`/`lightSquareStyle` hex.
- `src/labs/ChessSearchLab.tsx` lines 22-24: `ACCENT`, `CHOSEN`, `DIM` — these
  feed a `<canvas>` 2D context, which cannot read a CSS custom property via
  `var()` directly, so the fix is a literal-value swap to the CAL-1 hex, not a
  `var()` substitution.
- `src/chess/ChessVsCommits.tsx` lines 27-29: `GAMES`, `COMMITS`, `WINRATE` —
  same canvas-adjacent constraint (fed into `<svg>` `stroke`/`fill` attributes
  as plain strings, not inline `style`, so these ones actually *can* become
  `var(--color-accent)` etc. directly, unlike the canvas cases above).

This is real and worth doing, but it's cosmetic relative to items 1-6 — it
doesn't touch the "engineering leads" narrative — and the three.js scenes
(`GraveyardScene.tsx`, `RepertoireTreeScene.tsx`, `ChessArcScene.tsx`) likely
carry the same debt in their material colours and weren't opened in this pass.
Treat as a separate, focused CAL-1 sweep rather than folding it into this one.

## A11y + reduced-motion + SSR notes

- `/chess` is `ssr: false` (`src/routes/chess.tsx`) — the whole room is
  client-only. Every hard constraint about `Date`/`window`/`Math.random` at
  render time is moot for anything inside `ChessRoom.tsx` or `src/chess/*`;
  nothing in items 1-6 introduces a new SSR surface regardless.
- Items 2, 3: plain `<button>`/existing `Link` semantics, keyboard-operable
  for free, no new ARIA. Both land inside panes already enumerated in
  `e2e/a11y.spec.ts`'s per-tab scan (`"Play the Bot"` is in `CHESS_PANES`;
  the Findings pane is the default pane the top-level `/chess` scan already
  covers) — **no test file changes required** for items 1-4 or 6.
- Item 5's chart: `aria-hidden`, zero motion, matches the established
  SVG-chart-plus-text-table pattern this codebase already uses twice
  (`ChessArc.tsx`, `ChessVsCommits.tsx`) — reviewers should hold it to that
  same bar (no `<text>` inside the SVG, `vectorEffect="non-scaling-stroke"`
  on every line) rather than inventing a new pattern.
- Item 4 (tab reorder): confirmed zero risk against the existing e2e test —
  see the reasoning inline above. Still worth re-running
  `npx playwright test a11y` once after the change, since "confirmed by
  reading the test" and "confirmed by running it" are different claims.
- Item 1 (`labNav.ts` extraction): behaviourally inert — same functions, same
  event name, same one-shot-consume semantics, moved to a smaller module.
  The only thing to verify is that `LabBench.tsx`'s re-export keeps `App.tsx`,
  `ProjectDetail.tsx`, and `rooms.tsx` compiling unchanged (they should — the
  import specifier they use, `"./LabBench.tsx"`, doesn't change).
- Nothing here adds a dependency, a new route, a new data fetch, or a
  server-only code path. Nothing here needs babysitting after it ships.

## What NOT to do

- **Don't duplicate `ChessSearchLab`'s canvas tree into `/chess`.** The whole
  point of item 2 is that the proof already exists — link to it. A second
  copy of the radial-layout/replay logic in `ChessBoardPane.tsx` is a second
  thing to keep in sync with `search.ts` forever, for a room that already has
  a working link to the first one.
- **Don't chase the brief's 74% figure.** The generated corpus says 41.8%.
  Build against `chess.thesis.decidedOnClock`, not a number that isn't in the
  data. If 74% is real and comes from a derivation the generator doesn't
  compute yet, that's a `scripts/gen-chess-stats.mjs` change and a separate
  task, not something to hardcode into JSX to match a brief.
- **Don't add a promotion-piece picker, PGN import/export, an opening book, a
  transposition table, or any depth/strength knob above what `calibration.ts`
  already calibrates.** `search.ts`'s own comment already states the upgrade
  path and the explicit reason to stop: "the calibration targets 1078 and
  1425, and every strength knob added above that has to be tuned back down
  again." Respect that; it's the author's own documented restraint, not an
  omission.
- **Don't touch `BoardSurface.tsx`'s `MutationObserver` remediation.** It's a
  correct, already-verified fix for a real dnd-kit a11y hazard (32 serious
  violations without it, per its own comment). Nothing in this spec needs to
  go near it, and nothing should.
- **Don't rename any tab label without updating `e2e/a11y.spec.ts`'s
  `CHESS_PANES` array in the same change.** The test selects by accessible
  name; reordering (item 4) is safe, renaming is not, without that one-line
  matching edit.
- **Don't fold the CAL-1 hex sweep (item 7) into this change.** It's real and
  named above with exact files and lines, but it's cosmetic and orthogonal to
  the narrative fix — bundling it in triples the diff for a PR whose actual
  point is "the finding and the engine now point at each other."
- **Don't try to give the bot a measured Elo.** `calibration.ts` and
  `ChessBoardPane.tsx` both already carry careful copy establishing that the
  preset ratings are labels, not measured strength ("this engine has never
  played a rated pool"). Adding a "your win rate says it's rated ~1200" readout
  would contradict that discipline for a number nobody asked for.
