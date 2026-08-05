# Site Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn cv-siddharth from a stack of twelve hardcoded homepage sections into a three-path site
navigated by a live anomaly rail, with his recovered writing and outside testimony on the primary
path instead of behind a doorway.

**Architecture:** A facet registry (`src/data/facets.ts`) becomes the single source of navigable
things, each carrying an **authored** and a **discovered** date. Pure logic modules
(`src/lib/facets.ts`, `src/lib/railGeometry.ts`) derive ordering and canvas geometry from it and are
unit-tested; thin `.tsx` components render them. The rail is canvas-over-real-anchors: the canvas is
decoration, the `<a>` list underneath is the navigation.

**Tech Stack:** React 19, TanStack Router, Tailwind v4 (`@theme` tokens in `src/index.css`), Vite,
Vitest (node environment), Playwright.

## Global Constraints

- Vitest runs `environment: "node"` and includes **only** `src/**/*.test.ts`, `api/**/*.test.ts`,
  `scripts/**/*.test.mjs`. `.tsx` is not testable here — all new logic goes in `.ts` modules.
- CAL-1 palette is fixed. Channel A `--color-accent` #f2a13d is the measured signal; Channel B
  `--color-accent2` #4fd6e0 is the baseline being compared to. No new accent colours.
- Decorative giant type renders as inline SVG `<text>` with `textLength` + `lengthAdjust`, never as
  DOM text (axe colour-contrast, serious).
- Any element with class `reveal` must be inside the `Reveal` component's IntersectionObserver, or
  it stays at `opacity: 0` forever.
- No new npm dependency for the rail. Canvas + rAF via `useCanvasLoop`.
- No copy anywhere explains the loop, the rail, or the three paths.
- Nothing personal enters this repo: recovered material ships as prose he authored or as a derived
  aggregate. Third-party PII excluded outright. Raw documents stay in AgentHarnessData.
- Anything outward-facing runs `node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs`
  before it ships; new claims are added to `claims.json`, never corrected as prose.
- Work on a branch. Do not commit to `main`. The tree already carries unrelated uncommitted work —
  stage only the files each task names, never `git add -A`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/facets.ts` | The registry: every navigable thing, with authored/discovered dates and path membership. Data only. |
| `src/lib/facets.ts` | Pure derivations over the registry: filter by path, sort by chronology, detect recovered items, format the dual stamp. |
| `src/lib/facets.test.ts` | Unit tests for the above. |
| `src/lib/railGeometry.ts` | Pure geometry: baseline tick positions, deviation offsets, hit-testing a y-coordinate to a facet id. |
| `src/lib/railGeometry.test.ts` | Unit tests for the above. |
| `src/AnomalyRail.tsx` | The rail: canvas via `useCanvasLoop` + an `<a>` list underneath. Thin. |
| `src/InstrumentView.tsx` | The expanded full-bleed trace view. Thin. |
| `src/index.css` | Rail + instrument-view style blocks, using existing tokens. |
| `src/routes/__root.tsx` | Mounts the rail on every route. |
| `src/data/beforeTheCode.ts` | Drishtant record upgraded from the signed LOR. |
| `src/data/archiveText.ts` (generator) | "The Tour" added via `scripts/gen-archive-text.mjs`. |
| `src/App.tsx` | Home resequenced; sections read from the registry. |

---

## Stage 1 — The facet registry

### Task 1: Facet types and pure derivations

**Files:**
- Create: `src/data/facets.ts`
- Create: `src/lib/facets.ts`
- Test: `src/lib/facets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Facet`, `FacetPath`, `FacetKind`, `facets`, `facetsForPath(facets, path)`,
  `byChronology(facets)`, `isRecovered(facet, minGapYears)`, `dualStamp(facet)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/facets.test.ts
import { describe, it, expect } from "vitest";
import { facetsForPath, byChronology, isRecovered, dualStamp } from "./facets";
import type { Facet } from "../data/facets";

const f = (over: Partial<Facet>): Facet => ({
  id: "x", label: "X", href: "/x", authored: "2024-01-01",
  discovered: "2024-01-01", paths: ["deep"], kind: "work", ...over,
});

describe("facetsForPath", () => {
  it("keeps only facets that declare the path", () => {
    const all = [f({ id: "a", paths: ["fast"] }), f({ id: "b", paths: ["deep"] })];
    expect(facetsForPath(all, "fast").map((x) => x.id)).toEqual(["a"]);
  });

  it("keeps a facet that declares several paths", () => {
    const all = [f({ id: "a", paths: ["fast", "deep"] })];
    expect(facetsForPath(all, "deep").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("byChronology", () => {
  it("sorts by authored date ascending, not by discovered", () => {
    const all = [
      f({ id: "new", authored: "2026-01-01", discovered: "2026-01-01" }),
      f({ id: "old", authored: "2020-08-14", discovered: "2026-08-05" }),
    ];
    expect(byChronology(all).map((x) => x.id)).toEqual(["old", "new"]);
  });

  it("does not mutate its input", () => {
    const all = [f({ id: "b", authored: "2026-01-01" }), f({ id: "a", authored: "2020-01-01" })];
    byChronology(all);
    expect(all.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("isRecovered", () => {
  it("is true when discovery trails authoring by the gap or more", () => {
    expect(isRecovered(f({ authored: "2020-08-14", discovered: "2026-08-05" }), 2)).toBe(true);
  });

  it("is false for something discovered as it was made", () => {
    expect(isRecovered(f({ authored: "2026-01-01", discovered: "2026-01-05" }), 2)).toBe(false);
  });
});

describe("dualStamp", () => {
  it("renders his own A :: B form for a recovered facet", () => {
    expect(dualStamp(f({ authored: "2020-08-14", discovered: "2026-08-05" }))).toBe(
      "2020-08-14 :: 2026-08-05",
    );
  });

  it("renders a single stamp when nothing was recovered", () => {
    expect(dualStamp(f({ authored: "2026-01-01", discovered: "2026-01-01" }))).toBe("2026-01-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/facets.test.ts`
Expected: FAIL — `Failed to resolve import "./facets"`.

- [ ] **Step 3: Write the registry types and seed data**

```ts
// src/data/facets.ts
/**
 * The registry of navigable things. Home sections, the rail's deviations and
 * the instrument view all derive from this one list — adding a facet is a data
 * edit, not an App.tsx edit.
 *
 * `authored` and `discovered` are separate because they genuinely are: a 2021
 * story found in 2026 belongs at 2021 in the trace and is still news.
 */
export type FacetPath = "fast" | "deep" | "wandering";
export type FacetKind = "work" | "writing" | "corpus" | "lab" | "record";

export interface Facet {
  id: string;
  label: string;
  href: string;
  /** ISO date the thing was made. */
  authored: string;
  /** ISO date it became expressible here. Equal to `authored` when nothing was recovered. */
  discovered: string;
  paths: FacetPath[];
  kind: FacetKind;
}

export const facets: Facet[] = [
  { id: "work", label: "Case studies", href: "/#work", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast", "deep"], kind: "work" },
  { id: "experience", label: "Experience", href: "/#experience", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast"], kind: "record" },
  { id: "loopdown", label: "Notes From The Loop", href: "/loopdown", authored: "2026-08-13",
    discovered: "2026-08-13", paths: ["deep"], kind: "writing" },
  { id: "excelsior", label: "Excelsior", href: "/excelsior", authored: "2021-06-15",
    discovered: "2026-07-10", paths: ["deep", "wandering"], kind: "writing" },
  { id: "board", label: "EB Profiles", href: "/ink#board", authored: "2019-05-09",
    discovered: "2026-07-10", paths: ["deep"], kind: "record" },
  { id: "chess", label: "Chess corpus", href: "/chess", authored: "2026-07-30",
    discovered: "2026-07-30", paths: ["wandering"], kind: "corpus" },
  { id: "lab", label: "Labs", href: "/lab", authored: "2026-07-24",
    discovered: "2026-07-24", paths: ["wandering"], kind: "lab" },
];
```

- [ ] **Step 4: Write the pure derivations**

```ts
// src/lib/facets.ts
import type { Facet, FacetPath } from "../data/facets";

export function facetsForPath(all: Facet[], path: FacetPath): Facet[] {
  return all.filter((f) => f.paths.includes(path));
}

/** Ordered by when the thing was MADE, which is not when it turned up. */
export function byChronology(all: Facet[]): Facet[] {
  return [...all].sort((a, b) => a.authored.localeCompare(b.authored));
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function isRecovered(facet: Facet, minGapYears: number): boolean {
  const gap = Date.parse(facet.discovered) - Date.parse(facet.authored);
  return gap >= minGapYears * MS_PER_YEAR;
}

/** His own form, from the 2020 draft: `A :: B` when the two eras overlap. */
export function dualStamp(facet: Facet): string {
  return facet.authored === facet.discovered
    ? facet.authored
    : `${facet.authored} :: ${facet.discovered}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/facets.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/facets.ts src/lib/facets.ts src/lib/facets.test.ts
git commit -m "feat(facets): registry with authored and discovered dates"
```

---

### Task 2: Rail geometry

**Files:**
- Create: `src/lib/railGeometry.ts`
- Test: `src/lib/railGeometry.test.ts`

**Interfaces:**
- Consumes: `Facet` from `src/data/facets`, `byChronology` from `src/lib/facets`.
- Produces: `Deviation { id: string; y: number }`, `baselineTicks(height, spacing)`,
  `deviationsFor(facets, height, pad)`, `hitTest(deviations, y, tolerance)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/railGeometry.test.ts
import { describe, it, expect } from "vitest";
import { baselineTicks, deviationsFor, hitTest } from "./railGeometry";
import type { Facet } from "../data/facets";

const f = (id: string, authored: string): Facet => ({
  id, label: id, href: `/${id}`, authored, discovered: authored,
  paths: ["deep"], kind: "work",
});

describe("baselineTicks", () => {
  it("spaces ticks evenly down the height", () => {
    expect(baselineTicks(100, 25)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns a single tick when the rail is shorter than one spacing", () => {
    expect(baselineTicks(10, 25)).toEqual([0]);
  });

  it("refuses a non-positive spacing rather than looping forever", () => {
    expect(() => baselineTicks(100, 0)).toThrow();
  });
});

describe("deviationsFor", () => {
  it("places the oldest facet at the top pad and the newest at height minus pad", () => {
    const out = deviationsFor([f("new", "2026-01-01"), f("old", "2020-01-01")], 200, 20);
    expect(out[0]).toEqual({ id: "old", y: 20 });
    expect(out[1]).toEqual({ id: "new", y: 180 });
  });

  it("centres a lone facet", () => {
    expect(deviationsFor([f("only", "2020-01-01")], 200, 20)).toEqual([{ id: "only", y: 100 }]);
  });

  it("returns nothing for no facets", () => {
    expect(deviationsFor([], 200, 20)).toEqual([]);
  });
});

describe("hitTest", () => {
  const devs = [{ id: "a", y: 50 }, { id: "b", y: 150 }];

  it("returns the id within tolerance", () => {
    expect(hitTest(devs, 54, 8)).toBe("a");
  });

  it("returns null outside tolerance", () => {
    expect(hitTest(devs, 100, 8)).toBe(null);
  });

  it("returns the nearest when two are in range", () => {
    expect(hitTest([{ id: "a", y: 50 }, { id: "b", y: 56 }], 55, 8)).toBe("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/railGeometry.test.ts`
Expected: FAIL — `Failed to resolve import "./railGeometry"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/railGeometry.ts
import type { Facet } from "../data/facets";
import { byChronology } from "./facets";

export interface Deviation {
  id: string;
  y: number;
}

/** Evenly spaced baseline ticks, inclusive of both ends. */
export function baselineTicks(height: number, spacing: number): number[] {
  if (spacing <= 0) throw new Error("baselineTicks: spacing must be > 0");
  const out: number[] = [];
  for (let y = 0; y <= height; y += spacing) out.push(y);
  return out.length ? out : [0];
}

/**
 * Deviations are laid out by CHRONOLOGY, not by nav order — the rail is a
 * trace of when things were made, so the reading order is time.
 */
export function deviationsFor(facets: Facet[], height: number, pad: number): Deviation[] {
  const ordered = byChronology(facets);
  if (ordered.length === 0) return [];
  if (ordered.length === 1) return [{ id: ordered[0].id, y: height / 2 }];
  const span = height - pad * 2;
  return ordered.map((f, i) => ({ id: f.id, y: pad + (span * i) / (ordered.length - 1) }));
}

export function hitTest(deviations: Deviation[], y: number, tolerance: number): string | null {
  let best: Deviation | null = null;
  let bestDist = Infinity;
  for (const d of deviations) {
    const dist = Math.abs(d.y - y);
    if (dist <= tolerance && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best ? best.id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/railGeometry.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/railGeometry.ts src/lib/railGeometry.test.ts
git commit -m "feat(rail): chronological deviation geometry and hit-testing"
```

---

## Stage 2 — The rail

### Task 3: `AnomalyRail` component

**Files:**
- Create: `src/AnomalyRail.tsx`
- Modify: `src/index.css` (append a `/* --- Anomaly rail --- */` block)
- Modify: `src/routes/__root.tsx` (mount `<AnomalyRail />` once, outside `<main>`)

**Interfaces:**
- Consumes: `facets` (`src/data/facets`), `deviationsFor`/`hitTest` (`src/lib/railGeometry`),
  `dualStamp` (`src/lib/facets`), `useCanvasLoop` (`src/labs/useCanvasLoop`).
- Produces: default-exported `AnomalyRail` React component, no props.

**Build notes — these are requirements, not suggestions:**
- The canvas is `aria-hidden` decoration. Underneath it sits a real `<nav aria-label="Timeline">`
  containing one `<a href={facet.href}>` per facet, keyboard-reachable in DOM order, each labelled
  `${facet.label} — ${dualStamp(facet)}`. Remove the canvas and the rail still navigates.
- `useCanvasLoop` handles `prefers-reduced-motion` itself (900 fast-forward steps, one draw). Do not
  add a second reduced-motion branch for the animation. Do gate the one-time sweep hint on it.
- The sweep hint fires once per visitor: guard on a `localStorage` key `sidos.rail.seen`.
- Magnetic hover: track pointer y on the rail's bounding box, feed `hitTest` with a tolerance of 8.
- Colour: baseline ticks use `--color-accent2` (the thing being compared to); deviations use
  `--color-accent` (the measured signal). Read them via `getComputedStyle` on `document.documentElement`
  so a token change propagates.

- [ ] **Step 1: Build the component and mount it**

Write `src/AnomalyRail.tsx` per the build notes. Mount in `src/routes/__root.tsx` outside `<main>`
so it is not inside the `id="main-content"` skip-link target.

- [ ] **Step 2: Verify it renders and navigates with JS animation off**

Run: `npm run dev`, open `/`, then in DevTools set Rendering → Emulate `prefers-reduced-motion: reduce`
and reload.
Expected: rail is static, every deviation is still a focusable link, `Tab` reaches each one, `Enter`
navigates.

- [ ] **Step 3: Verify contrast and roles**

Run: `npx playwright test` (existing e2e includes an axe pass).
Expected: PASS, no new `color-contrast` or `link-name` violations.

- [ ] **Step 4: Verify LCP did not regress**

Run: `npm run build && npm run preview`, then `npx lhci autorun` against the config in
`lighthouserc.json`.
Expected: LCP within the existing budget.

- [ ] **Step 5: Commit**

```bash
git add src/AnomalyRail.tsx src/index.css src/routes/__root.tsx
git commit -m "feat(rail): live anomaly rail on every route"
```

---

### Task 4: Instrument view

**Files:**
- Create: `src/InstrumentView.tsx`
- Modify: `src/AnomalyRail.tsx` (drag / `\` opens it)
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `facets`, `byChronology`, `dualStamp`.
- Produces: default-exported `InstrumentView` taking `{ open: boolean; onClose: () => void }`.

**Build notes:**
- Full-bleed overlay, `role="dialog"` `aria-modal="true"` `aria-label="Timeline"`, focus trapped,
  `Escape` closes, focus returns to the rail on close.
- Scroll position underneath is preserved — the overlay does not unmount the page.
- Entries render in his form: label, then `dualStamp(facet)`. Recovered facets
  (`isRecovered(facet, 2)`) get the second stamp; nothing else does.
- No copy explains what the view is.

- [ ] **Step 1: Build the overlay and wire the `\` key and drag**
- [ ] **Step 2: Verify keyboard contract**

Run: `npm run dev`, press `\`, then `Tab` repeatedly, then `Escape`.
Expected: focus stays inside the overlay; `Escape` closes and returns focus to the rail.

- [ ] **Step 3: Verify scroll preservation**

Scroll to the Experience section, press `\`, close.
Expected: same scroll offset.

- [ ] **Step 4: Commit**

```bash
git add src/InstrumentView.tsx src/AnomalyRail.tsx src/index.css
git commit -m "feat(rail): instrument view on drag or backslash"
```

---

## Stage 3 — Surfacing the soul

### Task 5: Upgrade the Drishtant record from the signed LOR

**Files:**
- Modify: `src/data/beforeTheCode.ts` (the `Drishtant` entry in `societies`)

**Facts to add, all from the LOR signed by Dr K. K. Dhote, Faculty Coordinator, 11/05/2021:**
member since 2018; ran the society recruitment, 250+ participants; content creation on **Scribbled**,
the student blog; **Illuminati 8.0** within Technosearch'18, 1500+ footfall; coordinated **Ripple'20**,
MANIT's Literary Fest.

- [ ] **Step 1: Update the `blurb` and add a `source` note naming the LOR and its date**
- [ ] **Step 2: Add each new claim to `claims.json`**

```bash
$EDITOR ~/Tools/DevTools/AgentHarness/skills/claim-audit/claims.json
```

- [ ] **Step 3: Run the audit**

```bash
node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs
```

Expected: PASS with the new claims recorded.

- [ ] **Step 4: Commit**

```bash
git add src/data/beforeTheCode.ts
git commit -m "fix(drishtant): record matches the signed LOR, not less"
```

---

### Task 6: Recover "The Tour" into the archive

**Files:**
- Modify: `scripts/gen-archive-text.mjs` (source entry)
- Regenerate: `src/data/archiveText.ts`

**Build notes:**
- `authored: "2020-08-14"` (the in-story date), `discovered: "2026-08-05"`.
- The `{more here, edit here}` markers stay in the body. It is an unfinished draft and shipping it
  finished would be a lie about what it is.
- `page: 0` — it never ran in print.
- No third-party or personal content travels with it; only the prose.

- [ ] **Step 1: Add the source entry and regenerate**

```bash
node scripts/gen-archive-text.mjs
```

- [ ] **Step 2: Verify it renders**

Run: `npm run dev`, open `/read/the-tour`.
Expected: renders, markers visible, dual stamp shows `2020-08-14 :: 2026-08-05`.

- [ ] **Step 3: Commit**

```bash
git add scripts/gen-archive-text.mjs src/data/archiveText.ts
git commit -m "feat(archive): recover the 2020 observation-log draft"
```

---

### Task 7: EB Profiles as a deep-path facet

**Files:**
- Modify: `src/data/facets.ts` (the `board` facet already exists — give it a real target)
- Modify: `src/WritingSection.tsx` (give the board block a stable `id="board"` anchor)
- Modify: `src/App.tsx` if the deep path needs the section rendered on `/` rather than `/ink`

**Build notes:** the three `boardProfiles` quotes stay **verbatim**, including the Hindi, glossed only
where `gloss` already exists in the data. `boardArc` is promoted out of caption size.

- [ ] **Step 1: Add the anchor and promote `boardArc`**
- [ ] **Step 2: Verify the rail reaches it**

Run: `npm run dev`, press `\`, click the EB Profiles deviation.
Expected: lands on the board block.

- [ ] **Step 3: Commit**

```bash
git add src/data/facets.ts src/WritingSection.tsx src/App.tsx
git commit -m "feat(soul): board profiles reachable from the trace"
```

---

## Stage 4 — Home resequence

### Task 8: Collapse the overlapping sections

**Files:**
- Modify: `src/App.tsx` (`HomePage`, lines 1279–1314, and the section components above it)

**Decisions, already made — do not relitigate them mid-task:**
- `Metrics`, `FitCheck` and `Skills` all answer *is he any good*. Keep `Metrics` and `FitCheck` on the
  Fast path; `Skills` moves to the Deep path.
- `ChessTeaser` and `PlaygroundTeaser` both answer *go poke at something*, which the rail now owns.
  Collapse to one Wandering doorway.
- `Circuit` appears three times as filler. Keep at most one, between Experience and the doorway.
- Section order on the Fast path: Hero → Metrics → FitCheck → CaseStudies → Projects → Experience →
  Contact.

- [ ] **Step 1: Resequence `HomePage` and delete the dead section components**
- [ ] **Step 2: Verify no route or anchor broke**

Run: `npx vitest run src/lib/navigation.test.ts`
Expected: PASS. If `SECTION_IDS` lost an id, update the test **and** every caller — that module is the
single classifier for all internal `#hash` links.

- [ ] **Step 3: Verify e2e**

Run: `npx playwright test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/lib/navigation.ts src/lib/navigation.test.ts
git commit -m "refactor(home): fast path is seven sections, not twelve"
```

---

## Stage 5 — Per-surface pass

### Task 9: Systemise all 19 routes

**Files:** every file under `src/routes/`, plus the components each renders.

Work route by route, committing per route. For each: one type scale (the `--text-*` tokens), one
spacing rhythm (`--space-section-y`), one section-header pattern, one empty/loading/error state, and
correct nav behaviour for its path.

- [ ] **Step 1: `$.tsx` (404) first** — it is 44 lines, undesigned, and the most likely first
      impression from a stale link.
- [ ] **Step 2: Fast-path routes** — `/hire`, `/resume`. Sober and printable; the résumé keeps its
      dark-on-light contrast rules.
- [ ] **Step 3: Deep-path routes** — `project.$slug`, `/ink`, `/loopdown`, `/excelsior`, `read.$slug`.
- [ ] **Step 4: Wandering routes** — `/lab`, `/playground`, `/terminal`, `/compose`, `/forge`,
      `/pulse`, `/blueprint`, `/chess`, `/map`.
- [ ] **Step 5: Run the full check after each group**

```bash
npm run lint && npx vitest run && npx playwright test
```

---

## Stage 6 — Voice pass

### Task 10: Rewrite every string in his register, then audit

**Files:** `src/data/profile.ts` first (it is the content source of truth), then every route's copy.

**The register, from his own titles:** declarative, present tense, hard stop, second clause lands
rather than qualifies. *"Plausible is worse than wrong."* *"I audited my own migrations. It was not
fine."*

**Rules:**
1. Prefer a real sentence he wrote to a good sentence written for him.
2. Banned: "passionate about", "leveraged", "cutting-edge", "seamless", "robust solutions". Any
   sentence that would survive being about somebody else is cut.
3. Specificity is the tell — a number, a date, a named failure.
4. Never fabricate a personal detail, preference, or anecdote.
5. No copy explains the loop, the rail, or the paths.

- [ ] **Step 1: Rewrite `src/data/profile.ts` copy**
- [ ] **Step 2: Rewrite route copy, committing per route**
- [ ] **Step 3: Run the claim audit**

```bash
node ~/Tools/DevTools/AgentHarness/skills/claim-audit/audit.mjs
```

Expected: PASS. Add new claims to `claims.json`; never write a correction as prose. Lines quoting a
disproven phrase to correct it keep their `<!-- claim-audit:allow -->` marker.

- [ ] **Step 4: Full check and commit**

```bash
npm run lint && npx vitest run && npx playwright test
git commit -m "feat(copy): site reads in his register"
```

---

## Self-review

**Spec coverage.** §2.1 recovered material → Tasks 5, 6. §3.1 three paths → Tasks 1, 8. §3.2 rail →
Tasks 2, 3, 4. §3.3 registry → Task 1. §3.4 soul surfacing → Tasks 5, 6, 7. §4 voice → Task 10. §5
per-surface → Task 9. §6 non-negotiables → Global Constraints. No spec section is unimplemented.

**Type consistency.** `Facet`, `FacetPath`, `FacetKind`, `Deviation` are defined once in Task 1/2 and
referenced by those names throughout. `facetsForPath`, `byChronology`, `isRecovered`, `dualStamp`,
`baselineTicks`, `deviationsFor`, `hitTest` keep the same signatures wherever they appear.

**Known asymmetry, stated rather than hidden.** Tasks 1–7 carry full TDD cycles because they are new
logic with testable seams. Tasks 8–10 carry decisions, commands and gates but not per-string code
blocks, because the repo has no component-test harness and pre-writing every copy edit would be
invention, not planning. If that asymmetry is unacceptable, Stage 5 and 6 should be re-planned as
their own documents after Stage 4 lands and the real surface count is known.
