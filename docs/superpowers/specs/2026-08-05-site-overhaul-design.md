# Site overhaul — three paths, one instrument, his own voice

**Date:** 2026-08-05
**Status:** approved in conversation, pending written review
**Supersedes nothing.** Extends `2026-07-20-portfolio-overhaul-design.md` and the in-flight
editorial pass (`Editorial.tsx`, the `.chapter-word` / `.magazine-*` CSS blocks).

---

## 1. Diagnosis

The site is not underbuilt. It is ~32k LOC across 19 routes with a coherent design system
(CAL-1 Channel A amber / Channel B cyan, a fluid type scale, a three-step motion system, and
`--color-muted` verified at AA on every dark ground). Visitors already react well to it.

Three real problems remain, and only one of them is visual.

**P1 — The soul is behind a door.** The most human material on the property renders only inside
`WritingSection.tsx` at `/ink`: the three EB Profiles the Editorial Board wrote *about* him in his
own voice (2019–21), `boardArc` — which closes *"The last one is still the job description."* — the
two societies, and the fiction archive. A visitor on the primary path never reaches any of it. The
site reads as competent and unpeopled, and that is a routing bug, not a writing bug. **The writing
already exists and is good. It is simply unreachable.**

**P2 — The home scroll is a stack, not a sequence.** Twelve sections in `HomePage`, several
answering the same visitor question. `Metrics`, `FitCheck` and `Skills` all address *is he any
good*. `ChessTeaser` and `PlaygroundTeaser` both address *go poke at something*. `Circuit` appears
three times as connective tissue between sections whose adjacency is not argued for. Nothing here
is bad; it accumulated.

**P3 — New facets cost a refactor.** Stated in `project_growable_past`: home sections are hardcoded
JSX in `App.tsx` and each `src/data/` module has a bespoke shape. His past grows — three magazines
and 396 pages arrived in days — and every arrival currently means editing `App.tsx`. The Build/Ink
binary was already too small on the day it shipped.

## 2. The finding this design is built on

`src/data/beforeTheCode.ts`, `coverStory2021`:

> Excelsior '21 was not a magazine with a cover story in it; the cover story **was** the magazine.
> Mr. Talesman opens on p24 and sends the reader down one of three branching paths — Compliant,
> Rebel, Explorer — each with its own prologue and epilogue. He was Joint Chief Editor on it.

He shipped a branching, multi-entrance reader interface in print in 2021. The "two front doors"
direction chosen for this overhaul is a thing he already did, with three. The architecture below is
therefore **recovered, not imposed** — which is the entire difference between a portfolio with a
concept and a portfolio with a person in it.

**The paths are structural, never named after the story.** No copy references Compliant, Rebel or
Explorer, and no copy explains the lineage. Per `project_loop_thesis`: if the metaphor needs an
explanation paragraph, it has already failed.

### 2.1 Recovered material (Drive sweep, 2026-08-05)

A Drive sweep — not previously done, and the reason this section exists — surfaced material that is
not in `writing.ts`, `beforeTheCode.ts`, or anywhere on the site.

**"The Tour" (untitled draft, 2020).** A second lockdown-era time story, unpublished and unfinished.
Researchers from 2436 travel to August 2020 to observe "the quarantined." It is written as a
**timestamped observation log** — every section header is a clock reading, and where the two eras
overlap it runs both: `0950 HOURS: JAN 23, 2436 :: 0803 HOURS : AUG 14, 2020`. The subject is never
named, only numbered, explicitly "to maintain confidentiality." The draft still contains
`{more here, edit here}` in two places.

This changes §3.2. The rail's grammar is not invented for it — it is **his**, from 2020: dual
timestamps, subject-as-ID, log entries against a monotonous baseline where only the deviations are
worth recording. The unfinished markers stay visible if the piece ships; a past that grows is
better served by a real draft than a tidied one.

**The Drishtant LOR (signed, Dr K. K. Dhote, Faculty Coordinator, 11/05/2021).** Outside testimony,
and the only voice on the site that is neither his nor his friends'. It carries facts the site does
not have: member since 2018; ran a recruitment drawing 250+ students; content creation on
**"Scribbled"**, the student blog the site currently calls only "the society blog"; Illuminati 8.0
within Technosearch'18, 1500+ footfall; coordination of Ripple'20, MANIT's Literary Fest.

The site's current Drishtant blurb is **thinner than its own evidence**. This is the recorded
retroactive-upgrade pattern firing again, and it is exactly what the authored/discovered split in
§3.3 exists to render.

**Certificates.** Excelsior '19 and '20, Drishtant 2nd Year / Core Team / Final Year Core Team, plus
`LOR2_PE` and `Drishtant GP`. Every society claim on the site has a signed document behind it.
`Excelsior 2010` also exists (another alum's copy) — not his work, but real evidence for the
publishing lineage rather than an assertion.

**Exclusions, non-negotiable.** The Drive folder holding the 2020 draft is a junk drawer also
containing account statements, an insurance policy, a medical certificate, travel documents, and
**five other people's CVs**; recent files include payslips, ITR/Form-16 PDFs, and a contractor
agreement. None of it enters this repo. Recovered material ships only as (a) prose he authored, or
(b) a derived aggregate. Third-party PII is excluded outright — aggregation does not launder it.
Raw documents stay in AgentHarnessData per `DATA_CONTRACT.md`.

## 3. Architecture

### 3.1 Three paths, one page

`/` remains the sober scroll and is never blocked by a chooser. What changes is that the same
material is legible at three depths, and the visitor picks depth continuously rather than once.

| Path | Who | What they get | Time |
|---|---|---|---|
| **Fast** | Recruiter, hiring manager | Hero → the numbers → fit check → two case studies → contact | ~90s |
| **Deep** | Engineer evaluating him as a peer | The mechanism: how the sensor problem was actually solved, the migration audit, the corpus work | ~10 min |
| **Wandering** | Anyone curious | Labs, terminal, chess, the archive, the magazines, the fiction | unbounded |

The Fast path is the default scroll and loses nothing. Deep and Wandering are entered from the rail
(§3.2) or from in-context affordances, never from an interstitial.

### 3.2 The anomaly rail

A live instrument pinned to the left edge of every route. It is the second door, the path switcher,
and the growable-facet index — one component doing all three, which is why it earns the pixels.

**At rest:** a repeating tick baseline, drawn on canvas via the existing `useCanvasLoop.ts` rAF
pattern. It is the only thing on the page moving when the page is idle.

**Its grammar comes from §2.1**, not from instrument-panel pastiche. A deviation's label reads as a
log entry, and where a facet has both an authored and a discovered date it renders both, in his own
`A :: B` form. That device is his, from 2020, and using it is the difference between a site that
looks instrumented and a site that is.

**Deviations:** each real facet is a deviation in the trace, positioned by its place in his
chronology, not by nav order. Hover blooms a label; click navigates. Deviations pulse on a slow
offset cycle so something is always breathing without anything strobing.

**Expansion:** drag the rail right, or press `\`, and the viewport unfolds into the instrument view
— the trace becomes full-bleed and the facets become the navigation. Release and the scroll
position underneath is exactly preserved. This is the "hard chooser" moment delivered on demand
instead of as a tollbooth.

**Unmissability**, because a thin line genuinely is missable:
- motion at rest, alone on an otherwise still page
- magnetic lean toward the cursor within ~80px
- a single full sweep 2s after first load, once per visitor, then it settles

**Accessibility is a construction constraint, not a pass afterwards.** The rail renders real `<a>`
elements behind the canvas; the canvas is `aria-hidden` decoration over a live list. Keyboard
reaches every deviation in DOM order. Under `prefers-reduced-motion` the baseline goes static,
deviations become plain dots, the sweep hint does not fire, and drag/keyboard expansion still
works. Nothing is motion-gated.

**No new dependency.** Canvas + rAF.

### 3.3 The facet registry

One type replaces twelve hardcoded sections and the bespoke-shape problem:

- a facet declares its label, its chronological anchor (**authored** date and **discovered** date,
  which per `project_growable_past` are years apart), which paths it belongs to, and how it renders
- the rail derives its deviations from the registry
- the home sequence derives its order from the registry
- a newly recovered facet — the next magazine, the next stack of certificates — is **a data entry**,
  not an `App.tsx` edit

Authored-vs-discovered is a first-class field, not a note. It is the only honest way to render a
past that grows, and it is renderable: a 2021 story discovered in 2026 can sit at 2021 in the trace
and still register as recent.

**Privacy line held:** new personal facets ship as derived aggregates only, on the chess precedent
(a large game corpus reduced to an analysis surface carrying zero PII — read `src/data/chess.ts`
for the actual figures; never quote them from memory). Raw personal data stays in AgentHarnessData.

### 3.4 Surfacing the soul

The human material moves onto the primary path without rebuilding the 14,000px homepage:

- The EB Profiles become a registry facet of their own, rendered as a dedicated section on the Deep
  path and reachable as a rail deviation anchored at 2019–21 — three parodies, verbatim, in the
  years they were written, including the Hindi, unglossed except where `gloss` already exists in the
  data. They do not go on the Fast path; a recruiter with 90 seconds is not the audience for them.
- `boardArc` is promoted to load-bearing copy. *"The last one is still the job description."* is the
  strongest sentence on the property and currently renders as a 14px caption at the bottom of a
  section most visitors never see.
- The fiction archive becomes reachable from the trace, not only from `/ink`.
- `/ink` remains, and remains the deep home for all of it. This is about reach, not relocation.

## 4. Voice doctrine

The requirement is that the site feel written by him and not generated. The defence against slop is
not stylistic effort; it is **sourcing**. His register is already documented in his own artefacts:

> *"The captain routes. The captain never rows."*
> *"I audited my own migrations. It was not fine."*
> *"Plausible is worse than wrong."*
> *"Invariants are cheap. Silent corruption is not."*
> *"Every filter needs a documented exception."*

The pattern: declarative, present tense, a hard stop, and a second clause that lands rather than
qualifies. No hedging, no throat-clearing, no adjective stacking.

**Rules for the copy pass:**
1. Prefer a real sentence he wrote to a good sentence written for him. Quoted material stays
   verbatim — `beforeTheCode.ts` already says so about `quote`, and it applies sitewide.
2. Banned: "passionate about", "leveraged", "cutting-edge", "seamless", "robust solutions",
   "I'm a developer who loves". Any sentence that would survive being about somebody else is cut.
3. Specificity is the tell. A number, a date, a named failure. "I audited my own migrations. It was
   not fine." works because it admits something.
4. Never fabricate a personal detail, a preference, or an anecdote. If it is not in the repo, in a
   magazine, or stated by him, it does not ship.
5. No copy anywhere explains the loop, the rail, or the three paths.
6. Everything outward-facing goes through
   `node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs` before it ships, and new
   claims are added to `claims.json` rather than corrected as prose.

## 5. Per-surface pass

All 19 routes against one type scale, one spacing rhythm, one section-header pattern, and one
empty/loading/error state. Concretely:

- **`/`** — resequenced from twelve sections to the Fast path, with Deep and Wandering entered from
  the rail. The overlapping pairs (`Metrics`/`FitCheck`/`Skills`, `ChessTeaser`/`PlaygroundTeaser`)
  are consolidated, not merely reordered. `Circuit` stops being used three times as filler.
- **`/hire`, `/resume`** — the Fast path's terminal pages. Sober, fast, printable. The résumé stays
  dark-on-light and keeps its own contrast rules.
- **Case studies / `project.$slug`** — chapter dividers as inline SVG `<text>` (per the recorded
  contrast trap), the triptych retained, mechanism over feature-listing.
- **`/ink`, `/loopdown`, `/excelsior`, `/read.$slug`** — the writing world; already the strongest
  content, needs the weakest work. Consistency only.
- **`/lab`, `/playground`, `/terminal`, `/compose`, `/forge`, `/pulse`, `/blueprint`, `/chess`,
  `/map`** — the Wandering path. This is where spectacle is allowed to be loud, because a visitor
  who arrived here chose to.
- **`$.tsx` (404)** — currently 44 lines and the only page nobody designed. It is also the page most
  likely to be someone's first impression from a stale link.

## 6. Non-negotiables

- CAL-1 palette holds. Channel A is the measured signal, Channel B is the baseline; if it is cyan it
  is the thing being compared to. No new accent colours.
- No decorative giant type as DOM text — inline SVG `<text>` with `textLength` + `lengthAdjust`.
  (Recorded trap: it fails axe colour-contrast as DOM text, and it *should*.)
- Any element wearing `reveal` must be inside the `Reveal` component's IntersectionObserver, or it
  renders at `opacity: 0` forever. (Recorded trap, already hit once.)
- LCP is not permitted to regress. The rail is below-the-fold work and mounts after paint.
- Existing test suites (`vitest`, `playwright`, `lighthouserc`) stay green. New non-trivial logic —
  the rail's hit-testing, the registry's ordering — ships with one runnable check each.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The rail reads as decoration and nobody opens it | Motion at rest, magnetic hover, one-time sweep. Instrument if it stays unopened. |
| Instrument view becomes the pretension failure mode | It is never the only navigation. Every facet stays reachable by ordinary links and by keyboard. |
| Voice pass drifts into writing *for* him | Rule 1: prefer his real sentence. Rule 4: fabricate nothing. |
| Registry refactor destabilises a working homepage | Registry lands behind the existing render first; sections migrate one at a time, each verifiable. |
| Scope sprawl across 19 routes | Sequenced below; each stage is independently shippable and independently revertable. |

## 8. Sequence

1. **Registry** — the enabling refactor. Nothing visual; unblocks everything.
2. **Rail + instrument view** — the new thing, built while appetite is high.
3. **Soul surfacing** — needs the registry to place facets, needs the rail to reach them.
4. **Home resequence** — needs 1–3 to exist before deciding what the home scroll no longer has to carry.
5. **Per-surface pass** — the breadth work.
6. **Voice pass + claim-audit** — last, because it rewrites strings the earlier stages move.
