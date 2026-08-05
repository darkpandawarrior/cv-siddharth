# Level 2 — Project Case Studies

Files in scope: `src/ProjectDetail.tsx`, `src/DeviceWall.tsx`, `src/ShowcaseFilm.tsx`, `src/ScreenMarquee.tsx`.
Data in scope: `src/data/profile.ts` (`ProjectDetailData`, `projects[]`, `caseStudies[]`), `src/data/galleries.ts`.

---

## Current state (honest)

`ProjectDetail.tsx` is a long, well-built stack of independent sections, in this order:

1. Hero triptych — name/tagline, "The brief" (`d.overview`), "What shipped" (`project.highlights`).
2. `ScreenMarquee` — full-bleed autoscrolling band, first 10 screenshots, `aria-hidden`, explicitly decorative (its own doc comment: *"The band is the poster, not the content"*).
3. `ShowcaseFilm` — only for `mileway`, `kursi`, `paymentslab` (`FILM_PROJECTS`).
4. Metrics band — flat `AnimatedMetric` tiles from `d.metrics`, no framing, no connection to anything above or below.
5. `DeviceWall` — per-platform screenshot/live-embed switcher, for projects with `targets`.
6. Videos, if any.
7. "How it works" — `d.sections` rendered as a **symmetric grid of interchangeable cards**. This is where almost all the real engineering narrative already lives (Kursi's "AI Munshi narrator," Mileway's "Location engine," Deadlock's "Record intent, never position" — genuinely excellent prose) but the grid layout gives every section equal visual weight, so nothing reads as *the* problem, *the* fork taken, or *the* payoff. It reads as a feature list, not a case study.
8. Roles, diagrams, tech stack, gallery (full list, captioned, lightbox), extra links, next-project pager.

Two things are structurally true and worth being precise about:

**Only 5 of 9 projects have `detail` at all.** `kursi`, `mileway`, `paymentslab`, `hiresignal`, `deadlock` get sections 3–8 above. `portfolio`, `kmp-family`, `cv-siddharth-kmp`, `the-loopdown` have no `detail` block, so their pages are hero + marquee + gallery only — no story of any kind, currently. "Level 2 for all" has to include these four, not just polish the five that already have depth.

**The screenshot duplication is real, and it's not just marquee-vs-gallery — for multiplatform projects it's up to three places.** `ScreenMarquee` is fed `items.map(i => i.src)`, and `items` *is* the exact array the gallery renders below (`ProjectDetail.tsx:188-190,397`) — so the same shots the marquee shows for ~10 seconds of scroll reappear seconds later, captioned, in the gallery. That overlap is called out and defended in `ScreenMarquee.tsx`'s own comment as intentional (poster vs. content). But `DeviceWall` adds a third site: Mileway's `targets` reuse `wear_dashboard.png`, `watchos_app.png`, `desktop_dashboard.png` — filenames that also appear verbatim in Mileway's `screens` gallery array (`profile.ts:796,798,804` vs `632,637,643`). A reader who compares platforms in the device wall, then scrolls to "Screens," sees three of those exact frames a second time. That third overlap is lower-stakes (different UI — tabbed comparison vs. carousel — and much further apart on the page) so it's flagged here but not worth engineering around; the marquee/gallery overlap is the one worth fixing because it's the *same band of images, seconds apart, same carousel-ish visual language*.

The `caseStudies[]` array (separate from `projects[]`, used for career achievements elsewhere in the site) already has exactly the shape this task is asking for: `{ problem, approach: string[], outcome }` (`profile.ts:172-181`). `ProjectDetailData` doesn't have this shape at all — that's the actual gap. Level 2 isn't inventing a new narrative pattern; it's bringing an already-proven one from the achievements data into the project data.

---

## What level 2 is

A `problem → decision → outcome` spine becomes a first-class, optional part of `ProjectDetailData`, rendered as one new section (`CaseSpine`) directly under the hero/marquee and above everything currently there. It is additive: every existing section (metrics band, `DeviceWall`, sections grid, roles, diagrams, tech stack, gallery) stays exactly where it is, doing exactly what it does now — the "How it works" grid remains the full detail for a reader who wants it; the spine is the 30-second version that used to not exist.

Structure carries the thesis, not vocabulary: three beats, in reading order, first-to-third — a stated problem, the fork taken (and implicitly, by omission, the one not taken), and a result tied to a real number already in the data. No beat is ever labeled with metaphor language. The labels are plain: "The problem," "The decision," "The result." That plainness is deliberate — per the guardrail, if the section needs a clever label to land, it's already failed. Ordering and visual weight (the result beat gets the number and the evidence shot; the problem beat gets neither) are what do the structural work.

The screenshot duplication gets a narrow, concrete fix, not a redesign: the spine's result beat gets exactly one evidence screenshot, and that one filename is excluded from the marquee's row. The marquee still shows ~9 other shots exactly as it does today; it just doesn't show the *one* frame the reader is about to see again ten seconds later, framed and captioned, in the story itself.

The four `detail`-less projects (`portfolio`, `kmp-family`, `cv-siddharth-kmp`, `the-loopdown`) get the same three-sentence treatment — this is the cheapest way to bring all nine to level 2, because the source material for each already exists in `description`/`highlights`, nothing needs to be researched.

---

## Concrete changes, ordered by value ÷ risk

### 1. Add the spine fields to `ProjectDetailData` — `src/data/profile.ts`

Additive only, every field optional, so nothing existing breaks and rollout is per-project and gradual (a solo maintainer can add one project's spine at a time, or none, without touching code again).

```ts
export interface ProjectDetailData {
  overview: string;
  sections: ProjectDetailSection[];
  // ...existing fields unchanged...

  /** The 30-second version. Optional — projects without it just skip the
   *  CaseSpine section and render exactly as they do today. Mirrors the
   *  problem/approach/outcome shape already proven on `caseStudies` (the
   *  career-achievements data) — same pattern, not a new one. */
  problem?: string;
  decision?: string;
  outcome?: string;
  /** Which metrics[] entry is the spine's headline number (index into the
   *  existing `metrics` array — no duplicated number to drift out of sync). */
  outcomeMetricIndex?: number;
  /** Evidence shot for the result beat — a filename from `screens` (or, for
   *  projects without a curated `screens` list, any src already in the
   *  auto-generated gallery). Excluded from ScreenMarquee's row so it isn't
   *  shown twice, seconds apart. */
  outcomeScreenshot?: string;
}
```

Referencing `metrics[outcomeMetricIndex]` instead of writing the number a second time as a string means the spine can never state a different number than the metrics band directly below it — one source of truth, not two strings that can drift.

### 2. `CaseSpine` component — inline in `src/ProjectDetail.tsx`

Same pattern as the file's other single-use local components (`NextProject`, `AutoVideo`, `SectionHeader`) — no new file for one component used once. Placed directly after `ScreenMarquee`, before the film/metrics band:

```tsx
function CaseSpine({ d, slug, accent }: { d: NonNullable<Project["detail"]>; slug: string; accent?: string }) {
  if (!d.problem || !d.decision || !d.outcome) return null;
  const metric = d.outcomeMetricIndex !== undefined ? d.metrics?.[d.outcomeMetricIndex] : undefined;
  const shot = d.outcomeScreenshot ? `/projects/${slug}/screenshots/${d.outcomeScreenshot}` : undefined;

  return (
    <section className="border-b border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <SectionHeader eyebrow="case study" title="The short version" />
        <div className="reveal grid gap-8 lg:grid-cols-3 lg:gap-6">
          <div>
            <p className="brief-label">The problem</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{d.problem}</p>
          </div>
          <div>
            <p className="brief-label">The decision</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{d.decision}</p>
          </div>
          <div>
            <p className="brief-label">The result</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{d.outcome}</p>
            {metric && (
              <p className="font-display mt-3 text-3xl font-bold" style={{ color: accent ?? "var(--color-accent)" }}>
                {metric.value} <span className="text-sm font-normal text-muted">{metric.label}</span>
              </p>
            )}
          </div>
        </div>
        {shot && (
          <div className="reveal mt-8 overflow-hidden rounded-2xl border border-line">
            <Picture src={shot} alt={`Evidence: ${d.outcome}`} className="max-h-96 w-full object-cover object-top" />
          </div>
        )}
      </div>
    </section>
  );
}
```

Call site, right after the existing marquee block:

```tsx
{items.length > 0 && <ScreenMarquee screens={marqueeSrcs} alt={`Screens from ${project.name}`} />}
{d && <CaseSpine d={d} slug={slug} accent={t?.accent} />}
```

Reuses `SectionHeader`, `.brief-label`, `.reveal`, `Picture` — zero new CSS, zero new dependency. Heading hierarchy stays correct (`SectionHeader` renders an `h2`, same as every other section on the page) so this doesn't create an axe heading-order violation.

### 3. Fix the marquee/spine overlap — `src/ProjectDetail.tsx`

One filter, computed once, next to the existing `items` derivation:

```tsx
const outcomeShot = project.detail?.outcomeScreenshot
  ? `/projects/${slug}/screenshots/${project.detail.outcomeScreenshot}`
  : undefined;
const marqueeSrcs = items.map((i) => i.src).filter((src) => src !== outcomeShot);
```

`ScreenMarquee.tsx` itself doesn't change — it already just renders whatever `screens` array it's handed. This is the whole fix: the one frame that's about to be shown again, framed and captioned, ten seconds later, doesn't also show up in the ambient scroller. Everything else in the marquee stays as-is, including the deliberate marquee/gallery overlap for the other ~9 shots — that one is fine (poster vs. index are different jobs); it was never the actual complaint.

### 4. Author the three spine sentences for all 9 projects

The highest-effort item, but it's compression of copy that already exists, not new research — and it's the one that actually makes the feature real rather than a code path nothing calls. Worked example, sourced entirely from existing `profile.ts` text (nothing new asserted):

```ts
// kursi — sourced from the existing "Same game, three depths" section body
problem:
  "A hidden-information bluffing game handed every player the same expert " +
  "board on turn one — suspicion odds, a live teleprinter log — which is " +
  "exactly the kind of interface that loses a first-timer before their first bluff.",
decision:
  "Split the board into three density layers a player graduates through by " +
  "playing, not a settings toggle: FOCUS shows only whose turn it is, one " +
  "plain-language line, and your legal moves; GUIDED adds coaching; ANALYST " +
  "is the full instrument panel.",
outcome:
  "All three layers, the AI, and a future server read the same deterministic " +
  "(GameState, Intent) → GameState engine — the density decision is a UI " +
  "skin, not a fork in the rules.",
outcomeMetricIndex: 0, // "4 · platforms, one engine"
outcomeScreenshot: "4p_pick_action.png",
```

For the four `detail`-less projects, the fastest honest source is each project's own `description` + `highlights` (already written, already true) — e.g. `cv-siddharth-kmp`'s `highlights` already states the problem ("how far CMP reaches on the web") and the decision ("almost no dependencies by design... hand-built on Compose and Ktor primitives") in one sentence each; writing the outcome is the only new sentence needed, and there's a real number sitting right there (`~16.5k lines`, `4 targets`) to cite instead of inventing one.

**Before any of this ships**, run `node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs` per the standing rule — these are new outward-facing sentences even when compressed from existing copy, and at least one candidate outcome (routing Mileway's spine through the *separate* `gps-accuracy` case study's "50% → 95%" figure) needs verifying that it's actually describing the same location engine before it's cited on the project's own detail page — don't assume two entries about GPS are about the identical system without checking.

### 5. Tie the film to the spine, for the 3 `FILM_PROJECTS` — `src/ProjectDetail.tsx`

Near-zero cost, real payoff: for `mileway`/`kursi`/`paymentslab`, the two-minute narrated tour is stronger evidence than a static screenshot. Give the film section an anchor and link to it from the result beat instead of duplicating a screenshot:

```tsx
// on the ShowcaseFilm section wrapper
<section id={`showcase-${slug}`} className="border-b border-line bg-surface">
```

```tsx
// in CaseSpine, when FILM_PROJECTS.has(slug) — pass a `filmAnchor?: string` prop
{filmAnchor && (
  <a href={filmAnchor} className="mt-2 inline-block text-xs text-accent hover:underline">
    Watch the two-minute tour ↓
  </a>
)}
```

One `id` attribute, one anchor link. No new component.

### 6. Portfolio/kmp-family/cv-siddharth-kmp/the-loopdown get a `detail` block, minimum viable

Not full case-study depth (metrics/sections/diagrams) — just enough to render `CaseSpine` so these four aren't the only pages on the site with no story. `problem`/`decision`/`outcome` only; `sections: []` is a valid `ProjectDetailData` (the grid section already guards on `d.sections.length > 0`).

---

## A11y + reduced-motion + SSR notes

- **Heading order**: `CaseSpine` reuses `SectionHeader` (`h2`) — same landmark structure as every other section, no new heading-order axe violation.
- **No color-only signal**: the three beats are distinguished by their plain-text labels ("The problem"/"The decision"/"The result"), not by color. *(Rejected during design: color-coding the problem beat in `--color-accent2` (cyan, the CAL-1 "baseline" channel) and the decision/result beats in the project's `accent`. Dropped for two reasons — it hasn't been contrast-checked against all 5 themed projects' actual card/surface colors (Kursi's teak/cream, Deadlock's maroon, etc. don't all define `accent2`, so it would silently fall back to the *global* cyan, which isn't guaranteed AA against a themed card background), and it repurposes the site's own Channel A/B semantic as decoration inside individual case studies — the kind of "the metaphor shows up even though it's not named" move the guardrail is there to catch.)*
- **No giant decorative type**: all spine text is real, readable DOM text at body size — nothing here is the giant-SVG-type category the a11y test cares about.
- **Motion**: `CaseSpine`'s only animation is the existing `.reveal` fade-in class, already gated by the site-wide `prefers-reduced-motion` media query (`index.css:249-250`) — no new motion code, so no new off-switch to build or forget.
- **SSR**: `CaseSpine` renders entirely from `project.detail` — no `Date`, `window`, or `Math.random` at render time. The evidence shot goes through the existing `Picture` component, already used SSR-safely elsewhere on this exact page.
- **Marquee stays `aria-hidden`**: `marqueeSrcs` is still consumed by the unmodified `ScreenMarquee`, which is still decorative and still skipped by screen readers — the filter changes *which* images are in the (still-hidden) band, not its accessibility contract.

---

## What NOT to do

- **Don't write "loop," "pattern," or any theme-label word in the spine copy.** The three labels stay "The problem" / "The decision" / "The result" — plain, functional, boring on purpose.
- **Don't color-code the three beats by the CAL-1 amber/cyan channel semantics.** See the a11y note above — it's both a contrast risk across 5 different project themes and a way the thesis leaks in through the back door.
- **Don't remove or restructure the existing "How it works" sections grid, metrics band, roles, diagrams, tech stack, or gallery.** They stay exactly as they render today. The spine is a new first section, not a replacement for the detail underneath it — a reader who wants the full sections grid still gets it, unchanged.
- **Don't try to eliminate the DeviceWall/gallery screenshot overlap.** It's a different comparison-vs-index UI, much further apart on the page, and not worth the curation cost of tracking which filenames appear in `targets` vs. `screens` — flagged in "current state," not fixed.
- **Don't make `CaseSpine` mandatory or block on all 9 projects having copy before it ships.** It's gated on `d.problem && d.decision && d.outcome` all being present — ship the component, backfill the four/nine (or nine/nine) content over time, no big-bang requirement.
- **Don't invent a new outcome number for any project.** Every `outcome` string and every `outcomeMetricIndex` must point at a number that's already somewhere in `profile.ts` (in that project's own `metrics`, or a `caseStudies` entry verified to be about the same system). Run claim-audit before shipping — see item 4.
- **Don't add a new dependency, new CSS animation system, or new file for `CaseSpine`.** It's one function in `ProjectDetail.tsx`, built entirely from primitives (`SectionHeader`, `.brief-label`, `.reveal`, `Picture`, `AnimatedMetric`'s sibling styling) that already exist on this exact page.
