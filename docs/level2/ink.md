# Level 2 — The Ink World

Files read in full before writing this: `src/routes/ink.tsx`, `src/WritingSection.tsx`,
`src/Excelsior.tsx`, `src/data/beforeTheCode.ts`, `src/WorldSwitch.tsx`, the `.ink-world` /
`.world-switch` / `.magazine-*` rules in `src/index.css` (lines 978–1123, 1447–1549). Also read for
context (not in scope to edit): `src/App.tsx` (`InkDoorway`, ~1160–1200), `src/routes/loopdown.tsx`,
`src/WritingView.tsx`, `src/data/writing.ts`, `src/data/writingMeta.ts`, `src/routes/excelsior.tsx`.

## Current state (honest)

`/ink` is real and already well-built in places. The token-scope trick in `index.css`
(`.ink-world` overriding `--color-*` so every existing component keeps working) is good
engineering — sepia ground, ochre accent, Rozha One serif, paper-grain pseudo-element, all dark
throughout so it reads as a different room, not a flashbang. `Excelsior.tsx`'s shelf (CSS-only
3D cover flip, `:hover`/`:focus-within` shared, reduced-motion fallback that keeps the lightbox
reachable, proper focus-trap/return on the masthead modal) is close to done as a component. The
three EB Profile cards + the closing `boardArc` line are the best-written content on the whole
site — three years of the same ritual, then the line that says what the last year actually was,
without ever using the word "pattern."

But `/ink`'s body is not its own page. `<WritingSection />` is dropped in unmodified, and
`WritingSection.tsx` has exactly one caller left (`ink.tsx` — confirmed by grep; `App.tsx` no
longer mounts it). It was written for a different job: a mid-scroll teaser on the old
14,000px homepage, competing for attention against Android case studies. That original job
explains every problem below.

1. **The intro paragraph re-centers on Android before a single word of fiction.** `ink.tsx`'s own
   hero (lines 39–44) already says "a different life." Three lines later, `WritingSection`'s H2
   opens with *"Field notes from real Android and KMP work, told through a recurring cast of
   personified bugs — plus the creative archive that came before the code."* (`WritingSection.tsx:40–43`).
   A visitor arriving at `/ink` cold from Google — searching his name plus "Excelsior" or the
   short story title — gets Android/KMP as the first substantive sentence on a page whose entire
   premise is "before the code."

2. **The page order puts the engineering pointer first and the actual Ink content last.** Reading
   top to bottom: H2 + intro (engineering-framed) → Loopdown-origin blockquote (good, Ink-native)
   → featured lesson card + queued lessons + series ticker (all engineering blog content, ~140
   lines) → "the archive" teaser card → Excelsior magazine block (shelf, EB Profiles, societies —
   the actual "different life" content) at the very bottom. Two-thirds of the page happens before
   the reason anyone landed on `/ink` shows up.

3. **Series colors bleed the wrong world's palette through the ink skin.** `accentOf()`
   (`src/data/writingMeta.ts`) returns five hardcoded neon hex values —
   `#8f74ff` / `#4ec9b0` / `#f0883e` / `#db61ff` / `#38bdf8` — designed to distinguish engineering
   series against a near-black control-room ground. `WritingSection.tsx` uses them via inline
   `style={{ color, borderLeft }}` on the featured card (line 67, 70), every queued-lesson card
   (line 121, 126, 129), and every series-ticker chip (line 161, 163) — none of which route
   through the `.ink-world` token scope, because they're hex strings, not `var()`. On sepia paper
   with cream ink, a purple-bordered card next to a pink-dotted chip is exactly "one section with
   a new palette" — the CSS-variable retheme was done correctly everywhere else in this file and
   skipped here, because these five call sites predate the world split.

4. **The EB Profile grid has no signal/baseline distinction even though the content earns one.**
   All three years render `text-accent2` uniformly (`WritingSection.tsx:252`). `boardArc` right
   below the grid draws the actual arc in words: two years of the same joke, then the year
   ("Most FYC ever," 2021) that became "the job description." The grid doesn't echo that in
   pixels at all — a free structural expression of the thesis (repeat, repeat, deviation) is
   sitting right there, unused.

5. **The archive card sends the reader out of the world with no warning.** `WritingSection.tsx`'s
   "The archive" card (lines 174–188) says *"everything I wrote before I wrote code"* — pure Ink
   content — and links to `/loopdown`, which is `WritingView.tsx`'s full control-room skin (no
   `.ink-world`, sticky Build-nav with Projects/Map/Résumé links, "Field notes from an engineer
   who writes" H1). The click is a hard world-flip with zero visual warning and no way back — the
   `/loopdown` route mounts no `WorldSwitch`.

6. **Adjacent, not in my file list, but directly caused by this world split and worth flagging
   loudly:** `src/routes/excelsior.tsx` — reached from every EB Profile card, every magazine-shelf
   spread, and `WritingSection`'s own "Read Excelsior" link — has its only way back hardcoded as
   `<Link to="/" hash="writing">` (line 46). `/#writing` used to be the homepage's inline writing
   section; that section is `/ink` now, and the homepage's `#writing` anchor is `InkDoorway`
   (`App.tsx:1166`), a *teaser*, not the destination. The backlink is stale, and the route mounts
   no `WorldSwitch` either, so a reader who deep-links into the magazine reader from `/ink` has no
   correct way back into the ink world except the browser's back button. One-line fix
   (`to="/ink"` + render `<WorldSwitch current="ink" />`), high value, but the file isn't mine —
   flagging for whoever owns `excelsior.tsx` rather than silently patching around it.

## What level 2 is

For The Ink specifically: a visitor who lands on `/ink` cold reads fiction-and-print content
first, in a room that only ever wears its own palette, and reaches the engineering half of the
site as a clearly-signposted *destination* they choose to walk into — not a redirect they trip
over. The repeat-then-deviation shape that already exists in the data (three EB Profile years,
the last one different) gets expressed in the layout and the color, not narrated. Nothing is
deleted: the lessons/series content stays, exactly as much of it, just placed and colored so it
reads as "what this became" instead of "what this actually is."

## Concrete changes, ordered by value ÷ risk

### 1. Stop routing series colors around the ink token scope (`src/WritingSection.tsx`)

Replace every `accentOf(...)`-derived color used for rendering (not for data lookup) with the
ink-world CSS variables, since this file's only mount point is `.ink-world`:

- `featuredAccent` (line 32): drop `accentOf(featured?.series)` for
  `"var(--color-accent)"` on the featured card, `"var(--color-accent2)"` is reserved for step 4.
- Queued-lesson cards (`accent` at line 121): same swap, `"var(--color-accent)"`.
- Series ticker (`accentOf(s.id)` at lines 161, 163): same swap. Since every chip now shares one
  color, differentiate by fill vs outline instead of hue — filled dot for `series[0]` (most
  recent), outline-only dot for the rest — so the ticker doesn't go visually flat. Cheapest way:
  add a `.tag-chip-current`/plain conditional class, no new CSS variables.
- **Do not touch `SERIES_COLOR` / `accentOf` in `src/data/writingMeta.ts`** — `WritingView.tsx`
  (`/loopdown`) still legitimately wants the five-color distinction on its own control-room
  ground. This is a call-site fix in `WritingSection.tsx` only, not a data-model change.

Net diff: ~6 lines changed, zero new state, nothing added. Immediately fixes the worst visual
"wrong palette" symptom on the page.

### 2. Reorder the section so Ink content leads and the engineering pointer closes it (`src/WritingSection.tsx`)

Move the JSX blocks (cut/paste, no logic changes) into this order:

1. Eyebrow + H2 + intro paragraph — **rewritten**, see copy below.
2. The Loopdown-origin blockquote (unchanged — already Ink-native, already links to `/excelsior`).
3. The Excelsior magazine block in full: shelf → EB Profiles → societies (currently the last
   ~130 lines of the file, lines 206–300) — promoted to directly after the blockquote.
4. A **compact** closing strip built from the current featured-card + queued-lessons + series-ticker
   block (currently lines 60–169, ~110 lines) — demoted, and visually tightened: this doesn't need
   to be a two-column hero grid anymore now it's a coda, not the lead. Collapse to one row: the
   featured lesson as a single compact card + a text link to the full hub, no queued-lesson list
   (that belongs to `/loopdown`'s own page, not a teaser on `/ink`). This is the one place a
   genuine trim is warranted — not a deletion of the feature (the full lesson list still lives at
   `/loopdown`), just not duplicating it here at hero size.
5. "The archive" + "Books Before Bros" cards (currently lines 172–204) — keep near the closing
   strip, since both point at "what came after / alongside" the magazine content, not at the
   magazine content itself.
6. Sync footer line (unchanged, stays last).

Rewritten intro paragraph (H2 stays "Writing," only the paragraph under the eyebrow changes):

> Three years on a college magazine's board, a run of short fiction that started as blog posts,
> and the record of what a team actually thought of me — before any of it was code.

Rewritten copy for the closing strip's lead line, replacing the sentence that currently opens the
whole section:

> The same board habits, five years and one career later: engineering write-ups under the Notes
> From The Loop banner.

Neither sentence uses "loop," "pattern," or any theme label — both are plain factual statements
("the record of what a team thought," "five years and one career later") that a hiring manager
reads as biography, not as an invitation to decode a metaphor. "Notes From The Loop" is quoted
because it's the actual, already-shipped series name (`src/data/writing.ts`), not new theme copy.

### 3. Give the EB Profile grid a signal/baseline split (`src/WritingSection.tsx`, ~line 252)

```tsx
<span
  className="font-display text-sm font-bold"
  style={{ color: p.year === "2021" ? "var(--color-accent)" : "var(--color-accent2)" }}
>
  {p.title}
</span>
```

Also thicken the left border on the 2021 card slightly relative to 2019/2020's (e.g.
`border-l-2` vs no left border, or `card-elevated` already gives all three a uniform border — add
`style={{ borderLeft: p.year === "2021" ? "3px solid var(--color-accent)" : undefined }}` to the
card itself, matching the pattern the featured-lesson card already uses elsewhere in this same
file). Three years, two of them the same ochre-less baseline color, the third one warmer — a
reader notices without being told why, which is the whole guardrail. One conditional, no new
markup, no new component.

### 4. Make the archive card honest about where it's sending the reader (`src/WritingSection.tsx`, lines 174–188)

Two changes, both inside this file:

- Copy: change "everything I wrote before I wrote code" (which describes *this* page's content,
  not what's on the other end of the link) to something that describes the destination —
  e.g. *"Every piece, indexed on the field-notes hub."*
- Affordance: reuse the existing `.world-switch` visual language instead of inventing new UI —
  a small two-tone dot (ochre → the site's green/amber Build tone) next to the arrow, matching how
  `WorldSwitch` itself previews the other world's color before you click. Concretely: wrap the
  existing `<ArrowRight>` in the same two-color-half pattern already defined for
  `.world-switch-seam`, reused at a smaller scale (`.world-switch-side`'s color logic, not new
  CSS) — or, cheaper still, just tint the card's hover border with `color-mix(in srgb,
  var(--color-accent) 50%, #f2a13d)` so the hover state itself previews "you're about to cross
  into the amber room." Either is a few lines; don't build a new transition component for one
  card.

This is the lowest-risk item on the list (copy + one hover-state tint) and the one that most
directly answers "make the Build/Ink relationship legible" without touching `/loopdown` at all.

### 5. Flag, don't fix: `src/routes/excelsior.tsx` backlink + missing `WorldSwitch`

Not in scope for this pass (file isn't named in the brief), but since it's a direct casualty of
the world split and sits on the only path out of every EB Profile / magazine-shelf deep link:
`Link to="/" hash="writing"` (line 46) should become `Link to="/ink"`, and the route should mount
`<WorldSwitch current="ink" />` the same way `ink.tsx` does. One line + one import. Whoever owns
that file should pick this up — it's currently a broken link in production, not a nice-to-have.

## A11y + reduced-motion + SSR notes

- All changes above are JSX reordering, inline-style color swaps, and copy edits — no new
  `Date`/`window`/`Math.random` at render time, nothing that touches SSR.
- No new motion is introduced anywhere in this spec. `TiltCard` already ships
  `motion-reduce:[&_*]:!transform-none`; `.magazine-book`/`.magazine-cover` already have a
  `@media (prefers-reduced-motion: reduce)` block that kills the flip transform while leaving the
  masthead lightbox reachable by click regardless. Nothing here needs a new off-switch because
  nothing here adds motion.
- The EB Profile color split (item 3) and series-ticker fill/outline split (item 1) are color/style
  changes only — verify contrast against the ink ground after implementing:
  `--color-accent` (`#d9a441`) is already documented at 9.0:1 on `--color-ink`, `--color-accent2`
  (`#cf8f63`) needs a contrast check against `#14100c` before shipping (it wasn't previously used
  for body-weight text, only for icons/hover, so this is new usage of an existing token — check
  it, don't assume it inherits the accent's number).
- Reordering the DOM (item 2) does not change any heading level or landmark — still one `<h2>`,
  still inside the same `<section id="writing">`. Re-run `e2e/a11y.spec.ts` against `/ink` after
  the move; nothing here should trip it, but the axe run is the actual gate, not this note.
- The decorative giant type rule (SVG not DOM text) doesn't apply to anything proposed here — no
  new display type is being added, only recolored/reordered existing text.

## What NOT to do

- Don't touch `SERIES_COLOR/accentOf` in `src/data/writingMeta.ts` — it's shared with
  `WritingView.tsx` at `/loopdown`, which still needs the five-color distinction on its own
  control-room ground. Fix the call sites in `WritingSection.tsx`, not the shared data.
- Don't delete the queued-lessons list or the series ticker — trim their *size* on this page (item
  2), don't remove the feature. The full versions stay live at `/loopdown`, which is their actual
  home.
- Don't build a new archive-reading surface on `/ink` to avoid sending readers to `/loopdown` —
  that's a new route, new data wiring, real scope creep for a solo maintainer. Fix the honesty of
  the link instead (item 4).
- Don't try to "fix" `/excelsior` or `/loopdown` in this pass beyond the one flagged line in item
  5 — both are out of the named file list, and `WritingView.tsx`/`loopdown.tsx` are very likely
  someone else's surface in this same round of work. Flag, don't silently absorb.
- Don't invent a new "signal vs baseline" component system. Item 3's fix is one inline conditional
  on an existing `<span>`/card — resist the urge to generalize it into a `<SignalBadge>` for a
  three-item grid that will not grow (there are exactly three years of Excelsior; it's over).
- Don't add copy anywhere that names the thesis. "Notes From The Loop" as a proper-noun link label
  is fine (it's the real, already-shipped series name); a new sentence explaining *why* the writing
  years matter to an engineering résumé is not.
