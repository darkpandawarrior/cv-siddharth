# Level 2 — The Programme

Index and sequencing for the ten specs in this directory. Read a spec for the *what*; read this
for the *when*, the *who-else-needs-this*, and the *don't*.

Ten specs, ~90 named changes. This orders them into 20 increments, names the 11 pieces more than
one spec needs (so they get built once), and names the traps.

| Spec | File |
|---|---|
| Compose Playground | [`compose.md`](compose.md) |
| Lab Bench | [`lab.md`](lab.md) |
| Chess World | [`chess.md`](chess.md) |
| Excelsior Reader | [`flipbook.md`](flipbook.md) |
| Project Case Studies | [`project-detail.md`](project-detail.md) |
| JD Fit Check | [`fitcheck.md`](fitcheck.md) |
| Panda (AI assistant) | [`assistant.md`](assistant.md) |
| Résumé | [`resume.md`](resume.md) |
| Terminal / Forge / Pulse | [`terminal-forge-pulse.md`](terminal-forge-pulse.md) |
| Ink World | [`ink.md`](ink.md) |

---

## 1. THE ORDER

Sequenced by value ÷ risk, with foundations first because five specs each carry a slice of the
same four extractions. Every increment below is independently shippable: it lands, `npm test` and
`npx playwright test a11y` stay green, and the site is strictly better with nothing else built.
Where an increment is genuinely blocked, the blocker is named.

### Wave 0 — Foundations (build once, five specs consume them)

**0 · Widen the a11y gate before widening the surface.** `e2e/a11y.spec.ts`'s `ROUTES` is
`/, /hire, /resume, /project/mileway, /lab, /terminal, /blueprint, /compose, /forge, /map,
/playground, /pulse, /loopdown, /chess`. **`/excelsior`, `/ink` and `/read/$slug` are not in it.**
Increments 13, 14, 18 and 20 all add interactive controls (a range input, two dialogs, a reordered
`/ink` body) to routes nothing scans today. Add the three routes now, while they still pass, so
the first red is caused by new code and not by a pre-existing debt nobody had measured.
Ship together: `lab.md` #1, the missing `@media (prefers-reduced-motion: reduce)` off-switch on
`.cell-flash-good`/`.cell-flash-bad` (`src/index.css:347-357`) — a named hard constraint currently
unmet.
*Blocks: 13, 14, 18, 20. Verify: axe green on 17 routes; tap a Recompose Lab cell with reduced
motion on and nothing animates.*

**1 · `RoomPager` out of `RoomFrame` — `src/rooms.tsx`.** One extraction, three bugs.
`terminal-forge-pulse.md` #1. Moving the pager into its own export lets `Terminal.tsx` render it
(closing the dead end this session's own room-pager fix opened at `/forge → /terminal`), and
putting the `room:<slug>` pulse bump in the pager's mount effect instead of `Playground.tsx`'s
`RoomCard.onClick` fixes the `/pulse` undercount for every entry path the last two sessions added
— backtick, palette, pager, direct URL. The existing 1s dedupe in `usePulse()` makes the two bump
sites safe to coexist; leave `RoomCard`'s onClick alone.
*Blocks: nothing. Verify: `/terminal` has a next-room footer to `/chess`; open `/forge` by backtick
and `/pulse`'s `room:forge` count moves.*

**2 · `src/labNav.ts` — extract `openLab` / `consumePendingLab` / `OPEN_LAB_EVENT`.**
`chess.md` #1. `LabBench.tsx` statically imports nine lab panes; `App.tsx` imports `openLab` from
it and pays for all nine on the home route. Splitting the six-line navigation primitive out and
re-exporting it from `LabBench.tsx` keeps `App.tsx` / `ProjectDetail.tsx` / `rooms.tsx` compiling
unchanged.
*Blocks: 8 (chess → lab link) and 19 (the search-tree merge's `LAB_OF` rewiring). Verify: home
route chunk shrinks; every existing lab deep-link still opens its instrument.*

**3 · `src/labs/Figure.tsx` — extract from `SignalLab.tsx:499-508`, add a `"baseline"` tone.**
`lab.md` #5. The new tone (`text-accent2`, cyan) is not cosmetic — it is the type-level home of
the CAL-1 claim/baseline distinction that increment 4 then applies everywhere.
*Blocks: 9. Verify: Signal Lab renders identically after the move.*

**4 · The CAL-1 sweep — one pass, not five.** Six specs each carry a slice of the same debt.
The real number is **71 hardcoded `#3ddc84` across 36 files and 43 `#5ee6ff`**, not the 16 the lab
spec counted in its own directory. Do it as one mechanical PR per zone, in this order:
- **4a — semantics first, `src/labs/SignalLab.tsx`.** Flip the canvas colours: engine/claimed
  track → amber `#f2a13d`, raw-GPS baseline → cyan `rgba(79,214,224,0.5)`, raw GPS gets the new
  `Figure` `"baseline"` tone. Today the flagship instrument draws its claim in cyan and its
  baseline in orange — the exact inverse of the doctrine `index.css:15-16` states in English.
  Same flip, smaller, in `ClockLab.tsx`'s win curve. (`lab.md` #3.)
- **4b — the mechanical hexes.** `accent-[#3ddc84]` → `accent-accent` (9 files), `ThemeLab.tsx:16`'s
  `portfolio: "#3ddc84"` → `"#f2a13d"` (that one is a *false claim*, not a stray colour — the
  site's brand token is amber now), `ReplayLab`/`ChessSearchLab` canvas literals, `ChessVsCommits`
  (its colours feed SVG attributes, so those really can become `var(--color-accent)`),
  `Terminal.tsx`'s `THEMES.amber`/`THEMES.cyan` + default, `ParticleWordmark.tsx`'s channels,
  `ComposePlayground.tsx`'s default button fill and its radial glow (**delete the glow, don't
  reskin it** — CAL-1 says zero glow), `WritingSection.tsx`'s five inline neon series hexes →
  `var(--color-accent)`.
- **4c — the 3D scenes**, untouched by any spec and carrying ~20 of the 71:
  `Blueprint3D.tsx` (8), `FoundationGraphScene`, `StoryMapScene`, `SkillsOrbitScene`,
  `Phone3DScene`, `ParticleHeroScene`, `AmbientScene`, and chess's three scenes. Lowest priority,
  highest tedium; do it last or accept the debt knowingly.
- **Exclusions, non-negotiable:** `ComposePlayground.tsx`'s `NAMED_COLORS` (Kotlin's own
  `Color.Green` — remapping it is a fidelity regression an Android engineer clocks instantly),
  each lab's project brand colour (Kursi gold, HireSignal blue, PaymentsLab purple, Mileway cyan
  — `ThemeLab` exists to demonstrate exactly those), and `THEMES.green` in the terminal (stays a
  typeable option, only the default moves).
*Blocks: nothing functionally. Verify: `grep -rn "3ddc84" src/` returns only the exclusion list.*

**5 · The JdFitCard package — `src/lib/useJdFit.ts` + `JdFitReport.source`.** `fitcheck.md` #1 and
`assistant.md` #2 specify overlapping edits to the same component. **One owner, one PR.** Extract
`runJdFit(content, onUpdate)` from `FloatingChat.tsx:352-407` so `FitCheck.tsx` and the console
share one implementation (and one spend against `JD_RATE_WINDOWS`). Add `source?: "offline"` to
`JdFitReport` — take `assistant.md`'s narrower version, not `fitcheck.md`'s `"ai" | "offline"`:
the client sets `"offline"`, absence means the model, and the model is never told the field exists
(a prompt-injected JD must not be able to forge "AI verified").
*Blocks: 10. Verify: one network request per JD submit, console and inline paths byte-identical.*

### Wave 1 — One-line and one-file wins (highest value ÷ risk in the programme)

**6 · `<FloatingChat />` on `/resume`.** `assistant.md` #1. One import, one JSX line, matching 13
other route files. Revives `chatContext.ts`'s `PAGE_CHIPS["/resume"]` and `greetingFor` case,
which have been dead code since they were written, and puts the `/jd` flagship one click from the
page a recruiter who already decided to read the résumé is standing on. `FloatingChat` already
carries `print:hidden`, so the PDF is untouched.

**7 · Résumé contact links + print hardening.** `resume.md` #1 and #4. `<address>` wrapping real
`tel:` / `mailto:` / `https:` anchors, plus `@page { size: A4; margin: 14mm 12mm }`,
`orphans/widows: 3` on `.resume p, .resume li`, and print-only darkening of `text-zinc-500/400`.
The résumé leaves this site as a browser-printed PDF; today that PDF has no clickable email or
phone number on it. Independently shippable, ~30 minutes, and it is a hiring-funnel bug rather
than a polish item.

**8 · Chess closes its own loop.** `chess.md` #2, #3, #4, #6. `ChessBoardPane` gains a button that
`openLab("chess-search")` + navigates to `/lab` (the proof already links back here and never
forward); `ChessFindings` gains an `onPlayTheEngine` callback that switches to the Play tab;
`TABS` reorders so Play the Bot sits second; the calibration paragraph cites
`chess.thesis.decidedOnClock`. **Depends on increment 2.** Zero e2e risk — `CHESS_PANES` selects
tabs by accessible name, not index.

**9 · Lab Bench finishing.** `lab.md` #4 and #5. `featured?: boolean` on the `signal` entry in
`data/labs.ts` renders a three-word `start here` text badge (text, not colour, not motion —
axe-safe by construction); `CrashLab` and `GatewayLab` get `Figure` rows so `pile`/`blocked` stay
on screen after the toggle flips. Both numbers already exist in each closure; nothing new is
computed. **Depends on increment 3.**

**10 · The JD Fit Check renders where the form is.** `fitcheck.md` #1-#6 plus `assistant.md` #3,
#4, #5, executed as one change to `ChatWidgets.tsx` + `FitCheck.tsx`. The scorecard renders inline
under the form instead of teleporting into a 370px corner panel; the card gets its own copy button,
a `/hire` + `mailto:` footer, the `instant match` provenance badge, a `matched · gaps` header
count, `tabular-nums` on the score, an `ask about this` button per gap row, and `MetricTiles`
becomes a `ChatLink` to `/lab`. Keep the console's `/jd` path fully intact and add a single
"ask a follow-up in the assistant →" link so it stays reachable. **Depends on increment 5.**

### Wave 2 — Feature depth

**11 · Compose proves it is real.** `compose.md` #1-#4, #6, #7. `CommandPalette` in the header
(the route `rooms.tsx`'s own comment names as still missing it); a `parse tree` toggle rendering
`JSON.stringify(program, null, 2)` from the AST already in scope; `ComposeParseError` with a token
offset so errors read `Line 12, col 3:` and the gutter highlights that line; a `?c=` base64 share
link; a `Break it` preset; `<details>` replacing the `title`-only supported-grammar bar. Item #5
(the chrome retheme) already shipped in increment 4b.

**12 · `CaseSpine` — the 30-second version of a project page.** `project-detail.md` #1, #2, #3, #5.
Optional `problem` / `decision` / `outcome` / `outcomeMetricIndex` / `outcomeScreenshot` on
`ProjectDetailData`, one local component in `ProjectDetail.tsx`, and one filter so the outcome
screenshot is excluded from `ScreenMarquee`'s row. Ships gated — it no-ops until content exists.

**13 · The Ink world stops leading with Android.** `ink.md` #1-#4, plus its item #5 reassigned:
`routes/excelsior.tsx:46`'s `<Link to="/" hash="writing">` is a **live broken link** (that anchor
is now `InkDoorway`, a teaser, not the destination) — fix it to `/ink` and mount
`<WorldSwitch current="ink" />` there in the same change. `WritingSection.tsx` reorders so the
magazine content leads, the lessons block becomes a compact coda, and the EB Profile grid splits
2021 (ochre) from 2019/2020 (terracotta). **Depends on increment 0** (`/ink` is unscanned today).
Contrast-check `--color-accent2` (`#cf8f63`) on `--color-ink` (`#14100c`) before shipping — the
ink-world token has never carried body-weight text.

**14 · Excelsior remembers and orients.** `flipbook.md` #1 and #2. `src/lib/excelsiorProgress.ts`
(timeless, no `Date`, so it can safely reach the SSR'd shelf via `useEffect`), an opt-in
"Continue, page N" link, and the `wrote`/`about`/`credit` marks threaded into the contact-sheet
thumbnails and a live badge in `flipbook-bar`. **Depends on increment 0.**

**15 · The chess divergence chart.** `chess.md` #5. ~15 lines of SVG above the existing decile
table, wins in `var(--color-accent2)`, losses in `var(--color-accent)`, `aria-hidden` because the
table below it is the accessible version — the pattern `ChessArc.tsx` and `ChessVsCommits.tsx`
already establish twice.

**16 · Terminal correctness.** `terminal-forge-pulse.md` #3 and #5. Narrow `aria-live="polite"`
off `<main>` (which currently includes the per-keystroke Tab-completion ghost) down to the printed
output blocks; add an 8-line Levenshtein "did you mean" on unknown commands.

**17 · Conversation-aware chips.** `assistant.md` #6. Parse the last assistant message for a
`project` widget and prepend `chipsForProject(name)`. Bounded, no new state, no extra model call.

**18 · The Excelsior scrubber.** `flipbook.md` #3. Native `<input type="range">` plus absolutely
positioned mark ticks, and a `jump()` that bypasses the animation lock. **Depends on increment 0**
— this is the one genuinely new interactive control in the programme and it lands on a route
nothing scans today.

### Wave 3 — Structural risk; ship last, ship alone

**19 · Merge Search Tree Lab + Chess Search Lab into one `Search Trees` instrument.**
`lab.md` #6. The code already calls them siblings sharing a canvas rig. Blast radius is three
files (`data/labs.ts`, `LabBench.tsx`, `ProjectDetail.tsx`'s `LAB_OF`), but it carries two real
hazards: the real-engine mode's `chess.js` + Web Worker chunk must stay lazy *behind the mode
toggle*, not merely behind the tab, or the home route's bundle regresses; and the two-way source
selector is a new accessible control (`role="radiogroup"`, copy `ModuleGraphLab.tsx:127-146`'s
keyboard pattern, don't invent one). **Depends on increment 2.** The only true merge in the
programme, and the instruction is merge-never-delete — both projects' `full story →` links stay.

**20 · Excelsior OCR search.** `flipbook.md` #4. The only increment that generates data that does
not exist: `scripts/gen-excelsior-text.mjs` (tesseract, already on the machine, same
manual/occasional/committed-output posture as `gen-excelsior.mjs`), `public/excelsior/text/<year>.json`
fetched lazily, and one dialog reusing `ContactSheet`'s focus/escape contract with plain
`filter`/`includes` matching. Must degrade to "search isn't available for this edition" if the
JSON was never generated. **Depends on increments 0 and 14.**

### Sitewide chrome — resolve alongside, not as a wave

The open `<SiteFooter/>` / `<WorldSwitch/>` gap is smaller than it looks once increment 1 lands.
Current truth: `SiteFooter` is on `/`, `/ink`, `/loopdown`, `/read/$slug`; `WorldSwitch` is on `/`
and `/ink` only. Resolve it as three lines inside increments already scheduled, not as a sweep:
- **Full-screen rooms** (`/forge`, `/lab`, `/map`, `/blueprint`, `/chess`, `/terminal`) do not want
  a scrolling footer — they want the pager, and increment 1 gives them one. Done.
- **Scroll routes** `/project/$slug`, `/excelsior`, `/playground`, `/pulse` should mount
  `SiteFooter`. Fold into increments 12, 13 and 1 respectively.
- **`WorldSwitch`** belongs on `/excelsior` and `/loopdown` (both are Ink-world destinations with
  no way home) — increment 13 covers `/excelsior`; `/loopdown` is one line.
- **`/hire` and `/resume` stay bare.** `/hire`'s own file comment is explicit that it is the
  ninety-second surface for someone who does not want to explore. That is design, not a gap.

---

## 2. THE THREE THAT MATTER MOST

If exactly three of the twenty ever get built:

**1 · Increment 7 — the résumé's contact block and print CSS.** ~30 minutes. Today the artifact
that actually leaves this site — a browser-printed PDF sitting in a recruiter's downloads folder
three weeks later — carries his phone number and email as unclickable text, and its section labels
print gray-on-gray. Every other item on this list improves what happens while someone is on the
site. This one improves what happens after they leave, which is where hiring decisions are
actually made. Smallest diff in the programme, largest consequence per line.

**2 · Increment 10 — the JD Fit Check renders where the form is.** The homepage section promises
"paste a job description and my AI reads it," and then dispatches a `CustomEvent` that renders the
answer in a 370px panel in the opposite corner, which the recruiter has to notice opened. The
scoring engine — offline-instant, model-supersedes-in-place, always-shows-gaps — is already the
best-engineered thing on the site. It is the only feature where a recruiter's own input produces a
tailored answer, and it is the single largest gap between what a feature *is* and what it *reads
as*. This is wiring, not intelligence: every primitive already exists.

**3 · Increment 4 — the CAL-1 sweep, starting with 4a.** 71 stray Android-green hexes against an
amber theme is the incoherence a visitor registers in the first five seconds, before reading a
word. And 4a is not cosmetic at all: the flagship instrument currently draws its *claim* in the
baseline colour and its *baseline* in a near-duplicate of the claim colour, contradicting the
doctrine written in plain English in `index.css`. Fixing that is the only way the amber/cyan
language ever means anything — and it is the site's one channel for expressing its organising
idea without writing a sentence about it, which the brief forbids.

**Runners-up, and why they lost.** *Increment 12 (CaseSpine)* fixes the largest content hole — 4
of 9 project pages have no story of any kind — but it is a content project, not an increment: nine
sets of three sentences, each needing `claim-audit` before it ships. It cannot be done in one
sitting, so it is the wrong thing to bet three slots on. *Increment 11 (the compose parse tree)* is
the strongest single piece of engineer-impressing evidence on the site, but the brief ranks
recruiter-facing first, and it only pays off for a visitor who has already chosen to open
`/compose`.

---

## 3. THESIS EXPRESSION MAP

Signal, repetition, deviation, evidence — one structural carrier per feature. The test applied to
every row: **remove all surrounding copy; does the structure still say it?** Anything needing a
caption is in the rejected list below, not the table.

| Feature | The one carrier | Why it needs no caption |
|---|---|---|
| **Compose Playground** | The `Break it` preset + the live parse tree. Every keystroke re-parses (repetition); one missing brace produces an exact `Line 4, col 1` and a red gutter line (deviation, located); the AST pane shows the node that changed (evidence). | The visitor performs it: delete a brace, watch it break precisely, retype it, watch it recover. Nothing is claimed, so nothing needs explaining. |
| **Lab Bench** | Amber is always the claimed number, cyan is always what it was measured against — applied only where an instrument genuinely has that comparison. Eleven instruments, one three-beat shape each: claim → live demo → stat. | Two colours used consistently and never decoratively become a grammar by repetition alone. A legend would break it. |
| **Chess** | The click chain: the finding → the bot tuned to reproduce that exact finding → its real search tree building live in `/lab`. Each step is the evidence for the one before. | Three buttons. The reader draws the line themselves, which is the only way it lands. |
| **Excelsior** | The scrubber's mark ticks: 396 near-identical pages as a uniform bar, ~10 ticks where one of them is his. | A bar of sameness with a few marks on it *is* the idea, rendered at 2px per tick. |
| **Project Case Studies** | Weight and reading order: problem, decision, result — and only the result beat carries a number and an image. | Three plain labels, unequal visual weight. The hierarchy does the argument; the vocabulary stays boring on purpose. |
| **JD Fit Check** | The same card, twice: the instant keyword match, then the model's read replacing it in place, with a cyan `instant match` badge only on the first. | Watching a verdict get revised in front of you is the entire point, and the badge is two words, not a sentence. |
| **Panda (assistant)** | `MetricTiles` becomes a link to `/lab`. Every number the assistant asserts now points at the instrument that demonstrates it. | A claim that links to its own proof. No label required — the link target is the argument. |
| **Résumé** | The derived `Concurrent with Dice.tech` note. Two entries both say "Present"; a skimmer assumes reverse-chronological means superseded. The derived line is the deviation from the assumed pattern. | Three words, computed from data that was always there. It cannot drift, because the day a role stops saying "Present" the line removes itself. |
| **Terminal / Forge / Pulse** | Forge's particle tint driven live by distance-from-target: settled = amber, disturbed = cyan. The cursor introduces the disturbance; the springs resolve it; the colour reports the residual. | It is a physical readout of exactly the idea, running continuously, with zero DOM text. Under reduced motion every particle sits on target and the whole wordmark is solid amber — the settled signal. |
| **Ink World** | The EB Profile grid: 2019 and 2020 in terracotta, 2021 in ochre with a heavier left border. Three years of the same ritual, one different. | `boardArc`'s existing prose already says what changed. The colour makes it visible one beat *before* the sentence — which is the correct order, and it works if the sentence is never read. |

**Rejected — needed a caption, therefore failed.** Colour-coding `CaseSpine`'s three beats by the
CAL-1 channels (also a contrast risk across five themed projects, and it repurposes a site-wide
semantic as per-page decoration). A "signal vs noise" legend on the Forge canvas. A prose
paragraph anywhere explaining why Signal Lab is the one to open first, why two lab instruments
merged, or what amber and cyan mean. Any UI string containing "loop" or "pattern" as a theme
label — "Notes From The Loop" and "The Loopdown" are proper nouns of shipped work and remain fine.

---

## 4. SHARED WORK — build once

Eleven pieces more than one spec assumes. Each has a named owner increment; every other spec
consumes it.

| # | Piece | Built in | Consumed by |
|---|---|---|---|
| 1 | **`src/labNav.ts`** — `openLab`, `consumePendingLab`, `OPEN_LAB_EVENT`, re-exported from `LabBench.tsx` so existing importers don't change | 2 | `chess.md` #2, `lab.md` #6, `App.tsx`, `ProjectDetail.tsx`, `rooms.tsx` |
| 2 | **`RoomPager`** exported from `src/rooms.tsx`, carrying the `room:<slug>` mount bump | 1 | `terminal-forge-pulse.md` #1 (dead end *and* Pulse undercount), every `RoomFrame` route, `/pulse`'s headline number |
| 3 | **`src/labs/Figure.tsx`** with tones `good` / `bad` / `baseline` / `neutral` | 3 | `lab.md` #3 and #5 — `SignalLab`, `CrashLab`, `GatewayLab`. The `baseline` tone is where the CAL-1 semantic lives in code |
| 4 | **`runJdFit(content, onUpdate)`** in `src/lib/useJdFit.ts` | 5 | `FitCheck.tsx` **and** `FloatingChat.tsx`. Two copies of offline→streaming→fallback is two things to keep in sync and two spends against `JD_RATE_WINDOWS` |
| 5 | **`JdFitReport.source?: "offline"`** (`chatBlocks.ts` + `skillMatch.ts`) | 5 | `fitcheck.md` #4 and `assistant.md` #2 specify this twice, differently. Ship `assistant.md`'s narrower shape: client sets `"offline"`, absence means model, prompt never learns the field exists |
| 6 | **CAL-1 hex retirement** — 71 × `#3ddc84`, 43 × `#5ee6ff`, with the exclusion list | 4 | `lab.md` #2, `chess.md` #7, `compose.md` #5, `terminal-forge-pulse.md` #2/#4, `ink.md` #1. Five specs each owning a slice of one sweep is five chances to disagree about the exclusions |
| 7 | **`font-mono … tabular-nums`** as the numeral convention | 10 | `assistant.md` #3 (`MetricTiles`, `JdFitCard` score), `fitcheck.md` #6 (same score), `resume.md` #5 (Key Results). Already the live convention in `Terminal.tsx`, `ChessFindings.tsx`, `Pulse.tsx`, `Visitors.tsx` |
| 8 | **`profile.email` as the only source of the address** | 10 | `fitcheck.md` #2's `mailto:` hardcodes it; `resume.md` #1 reads it from `profile`. `ChatWidgets.tsx` must import `profile.ts` the way `SiteFooter.tsx` and `Terminal.tsx` already do |
| 9 | **The confirm-then-revert toast idiom** — an `aria-live="polite"` span next to the button, cleared on a 1.5–2s timeout | 10 | `compose.md` #2's Share, `fitcheck.md` #3's Copy. `FloatingChat.tsx:448-458`'s `copyReply` and `ComposePlayground.tsx`'s `aiNote` already do it. Two callers, one idiom, no new component |
| 10 | **The localStorage guard shape** — `typeof localStorage === "undefined"` + `try/catch` + a typed record | 14 | `flipbook.md` #1's `excelsiorProgress.ts`. Copy `play/Visitors.tsx`'s `readVisitor`/`writeVisitor` and `Terminal.tsx`'s `HISTORY_KEY` verbatim; do **not** generalise a third time into a shared hook |
| 11 | **`e2e/a11y.spec.ts` `ROUTES`** + `/excelsior`, `/ink`, `/read/$slug` | 0 | `flipbook.md` #3 and #4, `ink.md` #2, and any future work on those three routes |

**One more, not a component: a data correction.** `chess.md` establishes that the brief's "~74% of
decided games were settled by the clock" does not exist in the corpus — `chess.thesis.decidedOnClock`
is **0.418**, `lossesOnTime` is 0.502. Anything downstream that quotes a chess number (increment
12's spines, increment 15's chart, `assistant.md`'s system prompt, the profile README) reads
`chess.thesis.*` and nothing else. If 74% is real it is a `scripts/gen-chess-stats.mjs` change,
and it is a separate task.

---

## 5. WHAT NOT TO DO

**Dependencies nobody needs.** No CodeMirror or Monaco for compose (the gutter highlight covers
90% of it and the route exists specifically to keep its chunk small). No Fuse.js / MiniSearch /
FlexSearch for 396 short strings — `filter` + `includes` is the whole job. No charting library for
two `<polyline>`s. No LZ-string for a share param that never exceeds ~1.2 KB. No Puppeteer /
`html2pdf` to replace `window.print()`. No Levenshtein package for an 8-line DP table.

**Backends and paid surfaces.** No snippet store for `/compose` (a base64 URL param is the whole
feature). No `/fit?data=…` permalink for the JD scorecard — a new route, hash parsing, and a
decision about what happens when `profile.ts` changes under an old link, for something `mailto:` +
copy already do. No KV/Upstash rate limiter — `chat-handler.ts` already documents why the
per-isolate approximation is a deliberate trade.

**Sweeps that destroy information.** Do not push amber/cyan over every canvas: Kursi's gold,
HireSignal's blue, PaymentsLab's purple and Mileway's cyan are real client identities and
`ThemeLab` exists to show them. Do not touch `NAMED_COLORS` — `Color.Green` rendering non-green is
a fidelity regression, not a retheme. Do not delete `THEMES.green`, the queued-lessons list, the
series ticker, or either search instrument's `full story →` link; the instruction is merge and
demote, never remove.

**Two specs editing one file.** `fitcheck.md` and `assistant.md` both rewrite `JdFitCard`.
`lab.md` and `chess.md` both rewrite `ChessSearchLab.tsx`'s colour constants. `ink.md` and
`flipbook.md` both have an opinion about `routes/excelsior.tsx`. Land increments 5, 4 and 13
respectively as the single owner of each, or spend the afternoon resolving conflicts in a
component nobody wanted to touch twice.

**Making numbers look better instead of being right.** Do not seed, pad or multiply the Pulse
counters — the fix is measuring the traffic that already exists (increment 1), and the page's own
"a sign of life, not analytics" paragraph is a promise. Do not give the chess bot a measured Elo;
`calibration.ts` is explicit that the ratings are labels. Do not invent an outcome metric for a
`CaseSpine`: every number points at an existing `metrics[]` entry by index, never a duplicated
string that can drift, and every new outward-facing sentence goes through
`node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs` first.

**Second sources of truth.** Reading progress is an *offer* ("Continue, page N"), never a redirect
— `Flipbook.tsx:53-54` already establishes the URL as the only thing that decides which spread
loads, and a silent override would be a worse bug than the one being fixed. `streamReply` fires
exactly once per JD submit. `outcomeMetricIndex` references, never copies.

**Things that need babysitting.** No typing indicators, unread badges, ambient sound, or "live"
anything on the assistant launcher — every one of them inherits a backgrounded-tab and
multiple-tab edge case for a solo maintainer. No OCR preprocessing pipeline, per-column
segmentation, or multi-pass PSM voting: one `tesseract --psm 6`, committed output, re-run by hand.
No virtualisation for a 144-thumbnail contact sheet.

**Structural moves that look like fixes.** Do not reorder the résumé's `experience` array to put
Dice.tech first — strict reverse-chronological is what ATS date parsing depends on, and reordering
to hide a mismatch reads worse than the mismatch. Do not wrap `Terminal.tsx` in `RoomFrame` (it has
its own header, theme system and full-bleed layout — only `RoomPager` is shared) or force
`/compose` into it (it needs the full-height split pane). Do not rename a chess tab label without
the matching one-line edit to `e2e/a11y.spec.ts`'s `CHESS_PANES`; reordering is free, renaming is
not. Do not add `<FloatingChat />` to `/hire`.

**And the one that undoes everything.** Do not write the thesis down. Not in a badge, a tooltip, a
section header, an alt text, or a paragraph explaining why a keyword matcher and an LLM get
different coloured chips. If a change needs a sentence to justify its own metaphor, that sentence
is the evidence the change failed — cut the sentence, and if the change cannot survive without it,
cut the change.
