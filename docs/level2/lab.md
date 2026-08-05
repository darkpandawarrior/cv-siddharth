# The Lab Bench — Level 2

Files read in full before writing this: `src/LabBench.tsx`, `src/data/labs.ts`,
`src/routes/lab.tsx`, `src/labs/signalEngine.ts`, `src/labs/signalRoute.ts`,
`src/labs/useCanvasLoop.ts`, and all eleven instruments (`SignalLab`, `CrashLab`,
`RecomposeLab`, `ThemeLab`, `ModuleGraphLab`, `GatewayLab`, `SearchTreeLab`,
`FanoutLab`, `ReplayLab`, `ChessSearchLab`, `ClockLab`), plus `src/App.tsx` and
`src/ProjectDetail.tsx` for the `LAB_OF` deep-link maps, `src/index.css` for the
CAL-1 token layer, and `e2e/a11y.spec.ts` to confirm `/lab` is one of the 16
axe-scanned surfaces.

## Current state (honest)

The Lab Bench is the most structurally mature feature on the site, and it
doesn't need rescuing — it needs finishing. Every one of the eleven instruments
already follows the same three-beat pattern: a claim paragraph, a live
canvas/SVG demonstration driven by real project numbers (17.6 km of actual
Pune roads for Signal Lab, Mileway's real 46-module count, PaymentsLab's real
66-gateway catalog, 18k chess games' real per-move clock data for Clock Burn),
and a footer stat bar with a toggle plus a `the full story →` link back to the
project. `signalEngine.test.ts` even asserts the headline numbers so they can't
quietly rot. This is not a feature that was phoned in.

Three real gaps, though:

1. **CAL-1 landed as tokens, not everywhere it needs to.** `src/index.css`
   already defines `--color-accent` (#f2a13d, amber, "the MEASURED signal") and
   `--color-accent2` (#4fd6e0, cyan, explicitly commented "the baseline it is
   measured against... never decorative"). `text-accent` classes throughout the
   labs pick this up for free. But **16 hardcoded `#3ddc84`** (the pre-CAL-1
   green) survive across 9 of the 11 lab files — mostly checkbox
   `accent-[#3ddc84]` and a few canvas fills — sitting right next to text that's
   already amber. And in the flagship instrument specifically, the canvas
   colors actively fight the doctrine: Signal Lab draws the corrected "engine"
   track (the claimed number, 50%→95%) in cyan, and the "raw GPS" baseline (the
   thing the claim is measured against) in orange. That's backwards from the
   rule the CSS comment states in plain English.
2. **No signal for which instrument to open first.** `data/labs.ts` already
   orders Signal Lab first and `LabBench.tsx`'s default tab state
   (`pendingLab ?? "signal"`) already opens on it — the right instinct is
   already coded in. It's just invisible: eleven flat pill buttons give a
   first-time visitor zero indication that one of them is deeper, real-data,
   and literally the section's own thesis statement made visible.
3. **Before/after asymmetry.** Signal Lab and Recompose Lab show the "before"
   and "after" numbers *simultaneously* (three-column `Figure` grid; a running
   `naive`/`smart` render counter that never resets). Crash Lab and Gateway
   Lab don't — flip the toggle and the "before" count (the undifferentiated
   pile, the blocked-call count) freezes and disappears from view; you have to
   toggle back and rely on memory to compare. The stronger pattern already
   exists in the codebase, it just isn't reused.

One structural observation, not a bug: `SearchTreeLab.tsx` (Kursi's simulated
ISMCTS) and `ChessSearchLab.tsx` (a real alpha-beta search running in a Web
Worker) are explicitly commented in the code as siblings — *"Same canvas loop,
same bottom-up tree, so the two search families read as one idea"* — yet they
live as two separate, thinner tabs instead of one instrument that lets a
visitor compare a simulated search against a real one directly.

## What level 2 is

Level 2 for the Lab Bench is not new instruments — eleven is already the
right number of true claims to back up, and the instruction is no deletions.
It's making the bench's own visual grammar agree with itself: the corrected/
claimed number is always amber, the thing it's measured against is always
cyan, exactly as the CSS token comments already promise elsewhere on the site
but the labs don't yet honor. It's giving the flagship instrument a quiet,
textual (never color-only, never motion-only) marker so a visitor's first
click is an informed one instead of a coin flip across eleven pills. It's
lifting the "show both numbers at once" pattern that Signal Lab and Recompose
Lab already prove out into the two instruments that currently hide their own
baseline. And it's the one legitimate merge: two search-tree instruments that
already share code, layout math, and canvas rig becoming one comparative
instrument — simulated tree search next to real tree search, in the same
frame — which is a stronger claim than either tab makes alone, and loses
nothing either project currently shows.

## Concrete changes, ordered by value ÷ risk

### 1. Reduced-motion off-switch for the recomposition flash (hard constraint, currently missing)

`src/index.css:347-357` defines `.cell-flash-good`/`.cell-flash-bad`, used by
`RecomposeLab.tsx:53` on every manual tap. The ambient auto-tap `setInterval`
in `RecomposeLab.tsx:25-30` already checks `prefers-reduced-motion` and skips
itself — good — but a **manually tapped** cell still plays the full keyframe
animation regardless of the media query. The task's hard constraint is
unconditional: "every motion effect must have a prefers-reduced-motion
off-switch." This one doesn't. Fix, in `src/index.css` right after line 357:

```css
@media (prefers-reduced-motion: reduce) {
  .cell-flash-bad,
  .cell-flash-good { animation: none; }
}
```

Zero risk, closes a real gap against a constraint the task calls out by name.

### 2. CAL-1 hygiene sweep — retire the 16 stray `#3ddc84`s

Mechanical, file-by-file, same fix shape everywhere: swap
`accent-[#3ddc84]` → `accent-accent` (already the working pattern —
`src/ChessRoom.tsx:376` uses it today) and swap hardcoded "this reading is
good" hex/const values for the `--color-accent` token.

| File : line | Current | Change to |
|---|---|---|
| `CrashLab.tsx:139` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `GatewayLab.tsx:178` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `ModuleGraphLab.tsx:178` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `RecomposeLab.tsx:61` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `FanoutLab.tsx:252` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `ThemeLab.tsx:204` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `SignalLab.tsx:456` | `accent-[#3ddc84]` (checkbox) | `accent-accent` |
| `ClockLab.tsx:130` | `accent-[#3ddc84]` (range input) | `accent-accent` |
| `ChessSearchLab.tsx:277` | `accent-[#3ddc84]` (range input) | `accent-accent` |
| `ChessSearchLab.tsx:22` | `const ACCENT = "#3ddc84"` (chosen-line/root-node canvas color) | `getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim()` read once in the `useCanvasLoop` setup, or simplest: hardcode `"#f2a13d"` next to a comment noting it should track the token |
| `ReplayLab.tsx:157` | `drawSegment(pathA, ..., "#3ddc84")` (the correct, deterministic replay) | `"#f2a13d"` — this is the claimed-correct path, same role as Signal Lab's "engine" track |
| `SignalLab.tsx:395` | heat scale `mag > 40 ? "#f0883e" : mag > 12 ? "#db61ff" : "#3ddc84"` | `mag > 40 ? "#ff5c5c" : mag > 12 ? "#db61ff" : "#f2a13d"` — swapping the "bad" end to `#ff5c5c` (the red already used for error states in `CrashLab`/`GatewayLab`) instead of `#f0883e` also fixes a second problem: `#f0883e` and `#f2a13d` are near-identical hues, so today's "bad" end and "good" end of this bar practically read as the same color at a glance |

One entry needs a different fix, not a swap — it's a **factual staleness**,
not a stray hex: `ThemeLab.tsx:16` — `{ name: "portfolio", label: "Portfolio",
color: "#3ddc84" }`. This is one of the lab's "6 real per-project theme
tokens," explicitly not fictional per the file's own comment. Now that
`--color-accent` is `#f2a13d`, that entry is simply wrong — the site's actual
current brand token is amber, not green. Fix: `color: "#f2a13d"`. This is the
one edit in this sweep that fixes a claim, not just a stray color.

Canvas contexts can't read Tailwind classes, so where a canvas fill needs the
token value, either hardcode the current hex with a one-line comment (cheapest,
matches how `ZONES` in `signalRoute.ts` already hardcodes its palette), or read
`getComputedStyle(...).getPropertyValue("--color-accent")` once per
`useCanvasLoop` setup closure if the color needs to survive a future token
change without a code edit. Given "an enhancement that needs babysitting is
worse than none," hardcode with a comment — the same maintenance shape the
rest of the codebase already uses.

### 3. Flip Signal Lab's claim/baseline canvas colors to match the CAL-1 doctrine

The `Figure` component in `SignalLab.tsx:499-508` already gets this half
right: `tone="good"` → `text-accent` (amber) for the engine number,
`tone="bad"` → `text-[#f0883e]` (orange) for raw GPS. But the **canvas track
colors for the same two series** don't agree with their own numbers:

- `SignalLab.tsx:199-201` draws raw GPS in `rgba(240, 136, 62, 0.5)` (orange).
- `SignalLab.tsx:217-222` draws the engine track in `rgba(94, 230, 255, ...)`
  / `#5ee6ff` (cyan) — both the solid and the dashed (IMU-bridged) variant.

Per the CSS comment at `index.css:15-16`, cyan is reserved for "the baseline
[a Channel A value] is measured against" and is "never decorative." Raw GPS
*is* that baseline — literally the quantity the engine's number is measured
against — and the engine output is the Channel A, "measured" claim (the
50%→95% headline). Today it's inverted: the claim is cyan, the baseline is
orange. Fix, in `SignalLab.tsx`:

```ts
// raw GPS — the baseline the claim is measured against
ctx.strokeStyle = "rgba(79, 214, 224, 0.5)";   // was rgba(240, 136, 62, 0.5)

// engine track — the claimed / corrected number
ctx.strokeStyle = bridged ? "rgba(242, 161, 61, 0.85)" : "#f2a13d"; // was cyan
ctx.shadowColor = "rgba(242, 161, 61, 0.5)";                        // was cyan shadow
```

And give raw GPS its own `Figure` tone (a third tone value, `"baseline"`,
alongside the existing `"good"`/`"bad"`/`"neutral"`) so its number reads
`text-accent2` (cyan) instead of the current orange-flagged-as-"bad" — raw
GPS isn't wrong the way a bug is wrong, it's the reference the claim is
checked against, and the doctrine's own wording draws exactly that
distinction. `ground truth` stays neutral zinc; it's not a channel, it's the
answer key.

Same reasoning, smaller instance, in `ClockLab.tsx`: the win curve
(`lines 96, 100, 137`, currently `#3ddc84`) is the primary claim's own
evidence — becomes `#f2a13d`/`text-accent`. The loss curve is already dashed
and already close to cyan (`#5ee6ff`); leave its role as-is, optionally tighten
the hex to the literal `--color-accent2` value for consistency. No copy
changes anywhere — this is only ever a canvas color and a CSS class, never a
sentence explaining why.

### 4. Mark the flagship instrument, textually — not with color or motion alone

`data/labs.ts`'s `LabTab` type gains one optional field:

```ts
export type LabTab = {
  key: LabKey;
  label: string;
  metric: string;
  group: "production" | "personal";
  featured?: boolean; // exactly one entry — the instrument worth opening first
};
```

Set `featured: true` on the `signal` entry only. In `LabBench.tsx`'s tab
button render (the `.map` over `TABS.filter(...)` around lines 95-109), add a
small always-on text badge next to the label when `t.featured` is true:

```tsx
{t.label}
{t.featured && (
  <span className="rounded-full border border-accent/40 px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-accent/80">
    start here
  </span>
)}
<span className={...}>{t.metric}</span>
```

This is real DOM text (axe-safe, no giant-decorative-type rule implicated),
no animation (no reduced-motion concern), and it's data-driven off one boolean
rather than a hardcoded visual special-case — if the flagship instrument ever
changes, it's a one-line diff in `data/labs.ts`, the same "single source of
truth" discipline the file's own header comment already establishes for the
instrument count.

### 5. Extract `Figure`, reuse it so Crash Lab and Gateway Lab stop hiding their own baseline

`Figure` (`SignalLab.tsx:499-508`) is already the right shape — a
label/value/sub triplet with a good/bad/neutral tone — it's just private to
one file. Move it to `src/labs/Figure.tsx`, add the `"baseline"` tone from
item 3, and re-import it in `SignalLab.tsx` (rung 2 of the ladder: reuse what
already exists instead of building a second version).

Then wire it into the two instruments that currently lose their "before" the
moment the toggle flips:

- **`CrashLab.tsx`**: `pile` (undifferentiated crashes, frozen once `triage`
  turns on) and the cluster totals (`bins`, frozen while `triage` is off) are
  already two independent counters that never reset on toggle — the data for
  a simultaneous view already exists, it's just not rendered together. Add a
  two-`Figure` row above the existing stat bar: `undifferentiated pile` (value
  `pile`, tone `bad`) and `top-2 clusters` (value `${stats.top}%`, tone
  `good`), both visible regardless of which mode is currently showing in the
  canvas.
- **`GatewayLab.tsx`**: same shape — `blocked` and `bins` are already two
  separate accumulators (`GatewayLab.tsx:29-30`) that survive a toggle flip.
  Add `blocked calls` (tone `bad`) and `routed calls` (tone `good`) as a
  `Figure` row.

This is the smallest change that actually fixes the asymmetry: no new
simulation logic, no new state — the numbers already exist in each closure,
they're just not both on screen at once the way Signal Lab and Recompose Lab
already prove is the stronger pattern.

### 6. Merge Search Tree Lab (Kursi, simulated) and Chess Search Lab (real alpha-beta) into one comparative instrument

Higher effort, still a bounded blast radius — three files touch the wiring,
plus the two lab components:

- `data/labs.ts`: replace the `search` and `chess-search` entries with one
  `search-trees` entry, e.g. `{ key: "search-trees", label: "Search Trees",
  metric: "ISMCTS vs α-β", group: "personal" }`. `LabKey` union drops two
  members, gains one — instrument count in `LAB_TABS.length` goes from 11 to
  10 automatically (it's derived, per the file's own header comment — no
  hand-edits needed anywhere prose quotes the count).
- `LabBench.tsx`: one new `case`/conditional rendering a merged
  `SearchTreesLab`, replacing the two existing `tab === "search"` /
  `tab === "chess-search"` branches. Keep the `ChessSearchLab` import lazy
  (it still needs the Web Worker + `chess.js`); the merged component's
  "simulated" mode (Kursi ISMCTS) should render without pulling that import —
  nest the lazy import so switching *into* real-engine mode is what triggers
  the worker/chess.js chunk load, not mounting the tab itself. This preserves
  the exact hazard `LabBench.tsx`'s own top-of-file comments already document
  (SSR + bundle-weight reasons both `SignalLabPane` and `ChessSearchLab` are
  lazy today).
- `ProjectDetail.tsx:22-27`: `kursi: "search"` → `kursi: "search-trees"`.
  `App.tsx` doesn't reference either key directly (only `LAB_OF` in those two
  files does), so that's the full call-site surface.

Inside the merged component: keep both canvas rigs (they already share
`useCanvasLoop`, the same bottom-up radial pre-order layout math, and near
identical draw code — `SearchTreeLab.tsx:44-90` vs `ChessSearchLab.tsx:48-90`
are already structurally the same function with different node-generation
sources), gate which one is live behind a two-option accessible toggle (a
`role="radiogroup"` pair, "simulated (Kursi ISMCTS)" / "real (α-β engine)"
— not a bare checkbox, since this isn't an on/off state, it's a choice
between two data sources). Keep both instruments' existing controls
(difficulty tier buttons for Kursi; depth-preset + move-number slider for the
real engine) visible only for the currently selected mode. Keep both
`the full story →` links (`/project/kursi` and `/chess`) — the merge
consolidates the *tab*, not either project's narrative.

This is the one "merge, never delete" opportunity in the bench: nothing said
by either instrument today goes missing, and a visitor gets to see the same
underlying idea — search over a tree of futures — proven twice, once
simulated and once for real, in the same frame instead of two separate ones.
It's also the instrument that most literally embodies the site's un-stated
thesis (two outputs, one faculty) without a single word of copy saying so —
which is exactly the guardrail the task sets: *"if the metaphor needs an
explanation paragraph, it has already failed."* Do this one last, and only
once items 1–5 are shipped and verified — it's the only item here with real
structural risk (bundle-splitting correctness, a new accessible control
pattern) in an otherwise mechanical list.

## A11y + reduced-motion + SSR notes

- `/lab` is one of the 16 surfaces `e2e/a11y.spec.ts` runs axe against with no
  allowlist (`e2e/a11y.spec.ts:17`) — every change above must re-pass that
  scan. None of items 1–5 touch ARIA structure. Item 6 introduces one new
  control (the radiogroup) — give it a real accessible name
  (`aria-label="search source"` or a visible `<legend>`-equivalent) and
  `aria-pressed`/`role="radio"` + `aria-checked` wired the same way
  `ModuleGraphLab.tsx:127-146`'s `role="button"` pattern already handles
  keyboard activation (Enter/Space) for a non-native control in this codebase
  — copy that pattern rather than inventing a new one.
- The route itself renders with `ssr: false` (`routes/lab.tsx:9`), so none of
  this touches the SSR/hydration-mismatch constraint directly. `LabBench.tsx`
  is still imported by the home route for `openLab`/`LabKey`, which is exactly
  why `SignalLabPane` and `ChessSearchLab` are lazy today (top-of-file
  comments, `LabBench.tsx:4-14`) — item 6's merged component must preserve
  that same laziness for its real-engine mode, or the home route's SSR bundle
  regresses.
- `useCanvasLoop.ts:17,36-40` already collapses any canvas-driven lab straight
  to its final frame under `prefers-reduced-motion` and skips the RAF loop
  entirely — this covers Crash, Gateway, Fan-out, Replay, Search Tree, Chess
  Search for free. `SignalLab.tsx:87-90` has its own equivalent check
  (`playing` defaults off, playhead starts at `total`). The one real gap is
  item 1 (`.cell-flash-*` keyframes) — after that fix, every motion effect in
  the bench has an off-switch, closing the constraint out completely for this
  feature.
- Decorative giant type: none of the labs use oversized DOM text for
  decoration (`ClockLab`'s SVG chart uses real `<text>` elements sized for
  data labels, not display type) — no change needed here.

## What NOT to do

- Don't retheme every canvas in every lab to amber/cyan indiscriminately.
  Kursi's gold (`SearchTreeLab.tsx`), HireSignal's blue (`FanoutLab.tsx`,
  explicitly commented "reserved for this sim's own visuals"), PaymentsLab's
  purple (`GatewayLab.tsx`), and Mileway's cyan (`ModuleGraphLab.tsx`) are
  each a project's own real brand identity, not a stray hex to sweep. CAL-1's
  amber/cyan pairing applies specifically where an instrument is genuinely
  comparing a claimed number against its baseline (Signal Lab, Clock Lab) —
  applying it universally would flatten exactly the client-identity detail
  `ThemeLab` itself exists to demonstrate.
- Don't add a fourth prose paragraph anywhere explaining why Signal Lab is
  the one to open first, or why two instruments got merged, or what the
  amber/cyan colors mean. Item 4's badge says "start here" in three words and
  stops. If any of these changes need a sentence of justification in the UI
  itself, that's the guardrail's own test failing.
- Don't reach for a charting library, a state-management library, or a new
  canvas-abstraction layer for any of this. Every fix above is a color swap,
  one new optional field, one extracted-and-reused component, and one
  bounded merge across three files already wired for exactly this kind of
  swap (`LAB_OF` maps, the derived `LAB_TABS` count). The bench's own
  architecture already anticipated needing to add and reshuffle instruments
  without ceremony — use it, don't route around it.
- Don't touch `signalEngine.ts` or `signalEngine.test.ts`. The physics/filter
  logic is the most carefully reasoned code in the bench (the extensive
  inline comments on gain scheduling, divergence resets, and the
  noise-inflates/dropout-deflates tension are load-bearing documentation, not
  filler) — none of the level-2 changes above touch numbers, only how they're
  colored, badged, and paired on screen.
