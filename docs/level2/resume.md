# Level 2 — The Résumé (`/resume`)

Files read in full: `src/ResumeView.tsx` (159 lines), `src/routes/resume.tsx` (30 lines), plus for
context: `src/data/profile.ts` (`profile`, `experience`, `metrics`), `src/index.css` (`.resume-mode`,
`@media print`), `src/routes/__root.tsx` (`PERSON_LD`), `src/lib/project-jsonld.ts` +
`project-jsonld.test.ts` (the codebase's existing pattern for data-derived `<script type="application/
ld+json">`), `e2e/a11y.spec.ts` (confirms `/resume` is one of the 16 axe-gated surfaces).

## Current state (honest)

`ResumeView.tsx` is already doing the one thing that matters most: it renders from the same
`profile` / `experience` / `metrics` / `resumeSkills` / `openSource` module the rest of the site
uses, not a hand-maintained duplicate. That architectural call is correct and level-2-complete —
nothing in this spec touches it.

Three real problems sit on top of that good foundation:

1. **Contact block is dead text.** Lines 31–34: phone, email, LinkedIn, GitHub are plain `<p>` text,
   no `<a href>`. On screen you can't click to call/email. In a browser "Save as PDF" export (which
   is how this résumé actually leaves the site — the button literally calls `window.print()`), the
   PDF a recruiter opens has zero clickable links either. This is the single highest-traffic surface
   on the site with the least functional contact info on it.

2. **Experience opens on a role that contradicts the headline.** `profile.resumeTitle` is "Senior
   Android Engineer — Mobile Architecture & Platform"; `profile.summary` (the résumé-only paragraph,
   lines 19–20) is entirely Android/Kotlin/Compose. Then `experience[0]` (profile.ts:61–75) is Neev
   Consulting — Python/Frappe/LibreChat/MCP, zero Android content — and it's dated `Apr 2026 —
   Present`. A recruiter skimming top-to-bottom hits "Senior Android Engineer" → an all-Android
   summary → immediately Python/ERP work. The fix is **not** to reorder (résumé + ATS convention is
   strict reverse-chronological; reordering out of date order is what actually breaks ATS parsing and
   reads as evasive to a recruiter) and **not** to delete the Neev entry. The fix is that the data
   already contains the answer and the UI doesn't surface it: `experience[1]` (Dice.tech) is *also*
   `Jun 2023 — Present`. Both roles are concurrent. Nothing on the page currently says so, so a fast
   skim misreads "left Android for consulting" instead of "still owns the Android platform, plus
   this."

3. **No print/ATS hardening beyond `.resume { font-size: 11px }`.** No `@page` rule (browser default
   PDF margins), no orphan/widow control on paragraph and list text, and `text-zinc-500` /
   `text-zinc-400` (section labels, job dates) is a contrast level tuned for a backlit screen — it
   goes gray-on-gray-ish in toner-economy or grayscale office printing. None of this fails automated
   a11y (on-screen contrast is fine) — it's specifically a print-fidelity gap.

Not a problem, just worth naming: `src/routes/__root.tsx`'s site-wide `PERSON_LD.worksFor` (line 29)
hardcodes `{ name: "Dice.tech" }` — the exact same "which job is current" fact this spec derives for
the résumé, but hand-typed instead of derived. It's the same drift risk as issue 2, in a file outside
this feature's assignment. Flagging it here because the fix in item 3 below (a derived-not-hardcoded
concurrency list) is directly reusable there in a later pass.

## What level 2 is

Print fidelity: the PDF a recruiter actually saves has working links, sane page margins, and text
that survives a black-and-white office printer — not just a webpage that happens to have a print
stylesheet. ATS parseability: the headline and the first thing under it agree, without touching the
one property (strict reverse-chronological order) ATS software actually depends on. Sync: every new
piece of this surface — the concurrency note, the résumé's own structured data — is a small pure
function computed from `profile.ts`, the same discipline `project-jsonld.ts` already established for
project pages, so nothing here can go stale independently of the data it's describing.

## Concrete changes, ordered by value ÷ risk

### 1. Real `<a href>` contact block — highest value, lowest risk

`src/ResumeView.tsx`, replace lines 31–34:

```tsx
<address className="not-italic mt-1.5 text-sm text-zinc-600">
  <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
    {profile.phone}
  </a>{" "}
  ·{" "}
  <a href={`mailto:${profile.email}`} className="hover:underline">
    {profile.email}
  </a>{" "}
  ·{" "}
  <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline">
    {profile.linkedin.replace("https://", "")}
  </a>{" "}
  ·{" "}
  <a href={profile.github} target="_blank" rel="noopener noreferrer" className="hover:underline">
    {profile.github.replace("https://", "")}
  </a>
</address>
```

`<address>` is the correct HTML5 landmark for exactly this content (contact info for the page's
author) — screen readers announce it, and browsers default it to `italic`, hence `not-italic` to keep
the current look. No color classes added, so contrast is unchanged (`text-zinc-600` on white is
already ~7.4:1, well past AA) — this is purely "make the existing text a real link," which is why it
carries no a11y risk. `target="_blank"` only on the two external profile links, not `tel:`/`mailto:`.
Keyboard focus is free: the site-wide `:focus-visible` rule (`src/index.css:300`) already applies to
any `<a>`, no new CSS needed.

### 2. Derived "concurrent role" note — fixes the headline mismatch without reordering or deleting

New file `src/lib/resumeMeta.ts` (mirrors the existing `src/lib/project-jsonld.ts` pattern: a pure,
unit-tested function the view calls, not logic inlined in JSX):

```ts
import type { Experience } from "../data/profile.ts";

/**
 * Companies where more than one Experience entry is still "Present" — used
 * so a skimming reader never mistakes the newest entry for having replaced
 * the one below it. Derived from the data, not hardcoded: a role rolling
 * off "Present" drops out of this list on its own, nothing to remember to
 * update by hand.
 */
export function concurrentCompanies(experience: Pick<Experience, "company" | "period">[]): string[] {
  return experience.filter((e) => /present/i.test(e.period)).map((e) => e.company);
}
```

`src/ResumeView.tsx`, inside the Experience `.map()` (after line 80), add:

```tsx
const concurrent = concurrentCompanies(experience);
// ...
{experience.map((job) => (
  <div key={job.company} className="mt-3 break-inside-avoid">
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="text-sm font-bold">{job.role} · {job.company}</h3>
      <p className="shrink-0 text-xs text-zinc-500">{job.period}</p>
    </div>
    {concurrent.length > 1 && concurrent.includes(job.company) && (
      <p className="text-xs italic text-zinc-500">
        Concurrent with {concurrent.filter((c) => c !== job.company).join(", ")}
      </p>
    )}
    {/* existing <ul> unchanged */}
```

This is additive only — no entry moves, no entry is removed, order stays strictly reverse-
chronological (ATS-safe). It makes a true fact in the data ("both roles say Present") visible in
under a second instead of requiring the reader to notice two separate date ranges.

Test, `src/lib/resumeMeta.test.ts` (matches the `project-jsonld.test.ts` shape — plain vitest, no
rendering, no fixtures):

```ts
import { describe, it, expect } from "vitest";
import { concurrentCompanies } from "./resumeMeta.ts";

describe("concurrentCompanies", () => {
  it("flags every company still marked Present when more than one is", () => {
    const exp = [
      { company: "A", period: "Apr 2026 — Present" },
      { company: "B", period: "Jun 2023 — Present" },
      { company: "C", period: "Jan 2021 — May 2023" },
    ];
    expect(concurrentCompanies(exp)).toEqual(["A", "B"]);
  });

  it("returns a single entry when only one role is current (caller gates on length > 1)", () => {
    expect(concurrentCompanies([{ company: "A", period: "2023 — Present" }])).toEqual(["A"]);
  });
});
```

This is the "how does it stay in sync" answer for issue 2: the moment a role's `period` stops
containing "Present", the badge disappears on its own — nothing to remember to edit in `ResumeView.tsx`
when the data changes.

**Separately, not part of this diff — flag for the profile owner:** `profile.summary` (line 19–20)
could get one clause bridging into the current Neev Consulting chapter so the Professional Summary
paragraph doesn't read as pre-Neev. Per `CLAUDE.md` rule 2, any new claim text about his own work
must go through `node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs` before landing — not
something to auto-generate here.

### 3. Résumé-specific JSON-LD, derived from the same data — sync guarantee + SEO

Add to `src/lib/resumeMeta.ts`:

```ts
import { profile, experience } from "../data/profile.ts";

const SITE_URL = "https://cv-siddharth.vercel.app";

/** Person schema for /resume, built from the live profile/experience data —
 * so unlike __root.tsx's hand-typed PERSON_LD.worksFor, this can't drift
 * from what the page itself says. */
export function buildResumeJsonLd() {
  const current = concurrentCompanies(experience).length
    ? experience.filter((e) => /present/i.test(e.period))
    : [];
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: `${SITE_URL}/resume`,
    jobTitle: profile.resumeTitle,
    worksFor: current.map((e) => ({ "@type": "Organization", name: e.company })),
    email: `mailto:${profile.email}`,
    telephone: profile.phone,
    sameAs: [profile.linkedin, profile.github],
  };
}
```

`src/routes/resume.tsx`, `head()` — add a `scripts` array exactly like `project.$slug.tsx:30` does:

```tsx
import { buildResumeJsonLd } from "../lib/resumeMeta.ts";
// ...
head: () => ({
  meta: [/* unchanged */],
  links: [/* unchanged */],
  scripts: [{ type: "application/ld+json", children: JSON.stringify(buildResumeJsonLd()) }],
}),
```

Note this is website SEO/structured-data, not ATS parsing — ATS software reads the downloaded PDF's
text layer, not the page's `<script>` tags. Ordered above the pure print-CSS fixes because it reuses
`concurrentCompanies` from item 2 (small marginal cost) and closes the exact drift class flagged in
"Current state."

### 4. Print fidelity CSS — `src/index.css`, extend the existing `@media print` block (line 257)

```css
@page {
  size: A4;
  margin: 14mm 12mm;
}

@media print {
  body { background: white; }
  .resume { font-size: 11px; }

  /* Section labels and job dates use text-zinc-500/400 for on-screen
     hierarchy; that contrast level goes flat in toner-economy or grayscale
     office printing. Darken for print only — same attribute-selector idiom
     already used below for .project-detail. */
  .resume [class*="text-zinc-500"],
  .resume [class*="text-zinc-400"] {
    color: #3f3f46 !important; /* zinc-700 */
  }

  .resume p,
  .resume li {
    orphans: 3;
    widows: 3;
  }

  /* ...existing .project-detail rules unchanged... */
}
```

`@page` is written at the top level (not nested in `@media print`) per standard CSS — Chrome's print
pipeline (both the print dialog and headless "Save as PDF") honors it either way, but top-level is
the portable form. This is sitewide, not résumé-only, but résumé is the surface it visibly matters on
(the project-detail print path in the same block gets the same benefit for free).

### 5. Key Results → `font-mono tabular-nums` — CAL-1 alignment, near-zero risk

`src/ResumeView.tsx` line 70–72, the Key Results line currently renders `m.value` and `m.label` as
plain text in the same font as everything else. `font-mono` (→ `--font-mono`, JetBrains Mono) is
already the established idiom sitewide for anything numeric (`src/App.tsx` uses it repeatedly for
stat displays). Wrap just the value:

```tsx
<p className="mt-1.5 text-sm leading-relaxed text-zinc-800">
  {metrics.map((m) => (
    <span key={m.label}>
      <span className="font-mono tabular-nums font-semibold">{m.value}</span> {m.label}
    </span>
  )).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [] as React.ReactNode[])}
</p>
```

(The `.reduce` is only needed because the current code builds the string with `.join(" · ")`, which
doesn't work once each value needs its own `<span>` — this is the minimum change to keep the same
visual separator with per-value styling. If that reads as more machinery than it's worth, the
one-line alternative is to leave the join as plain text and skip this item entirely — see effort
note.)

Font-family only, no color change — zero print/ATS/contrast impact, purely typographic.

### 6. Download PDF button → `bg-accent` — CAL-1 alignment, on-screen chrome only

`src/ResumeView.tsx` line 18–23, currently `bg-zinc-900 ... hover:bg-zinc-700 text-white`. Every
other primary CTA on the site (`src/App.tsx:359`, `src/BlueprintRoom.tsx:51`) uses the same recipe:
`rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim`.
Swap to match:

```tsx
<button
  onClick={() => window.print()}
  className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink hover:bg-accent-dim"
>
  <Printer size={15} /> Download PDF
</button>
```

This button is `print:hidden` (it's part of the on-screen chrome above the `<article>`, not the
résumé itself), so this has literally zero effect on the printed/PDF output — pure on-screen brand
consistency.

## A11y + reduced-motion + SSR notes

- **A11y:** item 1 (`<a href>` + `<address>`) is a net a11y improvement, not just a UX one — dead
  text with no href is unreachable by keyboard and unannounced as a link by a screen reader. Focus
  styling is free via the existing global `:focus-visible` rule. No new color pairs are introduced
  anywhere in this spec, so no new contrast surface to check. `/resume` is already one of the 16
  axe-gated surfaces in `e2e/a11y.spec.ts` — none of these six changes add interactive elements
  without accessible names, so this should stay green.
- **Reduced motion:** `ResumeView.tsx` has no animation today (`html.resume-mode body::before`
  already hides the ambient gradient) and none of these six changes introduce any — nothing to gate.
- **SSR:** every addition is either a pure function of imported data (`concurrentCompanies`,
  `buildResumeJsonLd`) or plain JSX — no `Date`, `window`, or `Math.random` at render time.
  `window.print()` (item 6) is already, and remains, inside an `onClick` handler, never called during
  render.

## What NOT to do

- **Don't reorder `experience` to put Dice.tech first.** Strict reverse-chronological order is what
  ATS date-parsing and a careful human recruiter both expect; reordering to "fix" the headline
  mismatch would look like hiding the most recent role, which is worse than the mismatch it solves.
  Item 2 fixes the actual problem (illegibility of concurrency) without touching order.
- **Don't rename section headers to generic ATS-speak** ("Core Competencies" → "Skills", "Key
  Results" → nothing, etc.). There's no evidence these fail parsing on any ATS this résumé is likely
  to hit in 2026, and it would flatten the one thing that makes this résumé read like a person instead
  of a template.
- **Don't build a custom PDF-generation pipeline** (Puppeteer/`html2pdf` at build or request time) to
  replace `window.print()`. The stated design ("Save as PDF in the print dialog produces the
  shareable document," `ResumeView.tsx:7`) is correct for a solo maintainer — a build-time PDF adds a
  render pipeline, a caching question, and a new failure mode for one button's worth of value. Item 4
  closes the actual print-fidelity gap without that machinery.
- **Don't bring CAL-1 amber/cyan into the printed `.resume` article itself.** Items 5–6 apply
  `font-mono` (typography, not color) and `bg-accent` only to on-screen, `print:hidden` chrome. The
  résumé's black-on-white, zinc-grayscale body is intentionally ATS/print-safe — introducing accent
  color into the printed content itself would reduce contrast reliability on real office printers and
  work against, not with, item 3's print-fidelity goal.
- **Don't touch `src/routes/__root.tsx`'s `PERSON_LD.worksFor`.** Flagged above as the same drift
  class as issue 2, but it's outside this file's assignment — a future pass can point it at
  `concurrentCompanies(experience)` once this lands, reusing the function instead of re-deriving it.
- **Don't add a `companyUrl` field to `Experience` to hyperlink company names.** Speculative — no
  named problem calls for it, and it reads as salesy on a résumé rather than useful. Skip per YAGNI.

## Effort

Small. Items 1, 4, 6 are pure CSS/JSX edits to existing files, no new files. Items 2–3 add one new
~30-line file (`src/lib/resumeMeta.ts`) plus one ~15-line test, following a pattern
(`project-jsonld.ts` / `.test.ts`) that already exists in this codebase — no new architecture, no new
dependency. Item 5 is the only one worth reconsidering on cost: the `.reduce` needed to give each
metric value its own `<span>` is more machinery than the payoff (one font-family change on four
numbers) — reasonable to cut entirely and ship 1, 2, 3, 4, 6 only.
