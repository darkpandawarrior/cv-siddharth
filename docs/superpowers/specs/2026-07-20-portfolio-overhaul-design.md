# Portfolio Visual + Content Overhaul — Design

Date: 2026-07-20 · Repo: cv-siddharth · Deploys: Vercel (push to main) → cv-siddharth.vercel.app

## Diagnosis (from live-site + source audit)

1. **Text walls.** Below the hero, the home page is 100% text. Project cards carry 5–6 dense
   multi-line bullets each; the Mileway case study and Mileway project card repeat the same
   ~200-word content twice on one page; Dice experience has 10 dense bullets.
2. **Media never surfaces.** `public/projects/` holds 45MB of screenshots/gifs, refreshed daily
   by automation — zero of it renders on the home page. Galleries only exist on detail pages.
3. **3D is token.** AmbientScene is a faint 1400-star field; the hero phone is a CSS div.
   `three` + `@react-three/fiber` + `drei` are already installed and chunk-split.
4. **Prose drift risk.** Automation syncs media but not prose; facts in `profile.ts` may lag
   the source repos (Mileway V24, PaymentsLab rails, Kursi, career-ops PR list).

## Goals

Recruiter-first scannability (5-second rule), media-led cards, real 3D moments, verified facts.
Keep: dark identity, Android-green accent, sid.android brand, chat assistant, existing routes
(`#resume`, `#writing`, `#project/<slug>`), fast first paint, reduced-motion fallbacks.

## Design

### 1. Progressive disclosure (kill the text walls)

- **Project cards** become media-led: gif/screenshot thumbnail (from `public/projects/<slug>`),
  name, tagline, platform chips, **max 2** one-line highlights, stat strip
  (e.g. `35 modules · 5 platforms · 149 tests`). All depth moves to the existing
  `ProjectDetail` pages. Card body copy budget: ≤ 40 words visible.
- **Case studies**: stat-led compact cards — big metric, one-line problem, one-line outcome,
  approach bullets collapsed behind an inline expander ("How → 3 bullets"). The Mileway
  "featured case study" slot is replaced by a media banner card linking to `#project/mileway`
  (removes the duplication); Dice work (GPS, crashes, Compose, white-label) stays as the four
  case-study cards.
- **Experience**: first 4 headline bullets visible, rest behind "+ N more" expander. Each
  bullet tightened to ≤ 18 words, label-first.
- **Recently shipped**: cap at 4 most recent, one line each.

### 2. 3D upgrades (R3F, already installed)

- **Hero Phone3D**: real 3D device (RoundedBox frame + emissive screen plane textured with a
  real app screenshot, subtle cursor parallax + idle float, green rim light). Lazy-loaded in
  the same pattern as AmbientScene; falls back to current CSS `TiltPhone` when
  `prefers-reduced-motion`, no WebGL, or small viewports.
- **AmbientScene v2**: scroll-reactive — camera drifts with scroll progress, star hue shifts
  green→cyan through the page, plus a soft parallax nebula sprite layer. Still one canvas,
  dpr ≤ 1.5, low-power, no postprocessing.
- Guardrails: no new deps; both scenes stay in the lazy three chunk; LCP unaffected (canvas
  behind content, phone reserved-space).

### 3. Content refresh (verified, not guessed)

- Audit agent compares every factual claim in `src/data/profile.ts` against the local source
  repos (`~/Repos/Android/…/Mileway`, PaymentsLab, Kursi, career-ops checkout) + their READMEs;
  outputs a correction list. Copy rewrite applies corrections + the word budgets above.
- Tone: metric-first, verbs, zero filler. The chatbot remains the "depth" escape hatch and
  cards say so once, not per-card.

### 4. Explicit non-goals

- No redesign of ProjectDetail galleries, ResumeView, WritingView, chat backend.
- No new npm dependencies; no framework moves; no github.io changes (it's a redirect shell
  by design).

## Delivery

Feature branch `feat/visual-overhaul` → push → Vercel preview URL on the PR → Siddharth
merges to deploy. No direct push to main.

## Verification

`npm run build` green + browser pass (desktop 1280 & mobile 375, reduced-motion check,
console-error scan) + before/after screenshots in the PR.
