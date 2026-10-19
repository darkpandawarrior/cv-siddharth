# cv-siddharth DESIGN.md

> Inherits: house design standard (AgentHarness skill `design-md`). This file wins on conflict.
> Agents: read this before creating or changing any UI. Values live in `src/index.css` (`@theme`),
> never copy a hex from here into a component. Scene (r3f / canvas) colours go through
> `src/themeColor.ts` and `src/themeColorThree.ts`.

Dial: ENERGY 6 / RHYTHM 5 / MOTION 6

## Overview

A control room for a person's work, read at night. The reference is an instrument panel on a
survey vehicle: a dark ground, one measured signal, one baseline it is compared against, and
labels set like equipment stencils. Nothing glows for mood. If it lights up, it is data.

The audience is a hiring engineer skimming for proof. Content leads and is never gated behind a
boot screen or an "open the app" step (`docs/SIDOS-VISION.md`). Motion and 3D enhance the content
and degrade to static art on small screens and under reduced motion.

Surfaces: the main site (`src/routes/*`), the immersive rooms (globe, blueprint, chess, map,
ops), the printable resume (`/resume`, dark-on-light), and the "ink world" (`.ink-world`), a
warm paper theme used by the fiction pages. Art direction for the 3D world is in
`docs/superpowers/specs/2026-08-24-night-survey-art-direction.md`.

## Colors

Source: `src/index.css`, the `@theme` block (line 1 onward) and the `.ink-world` override.

Two channels, CAL-1:
- Channel A, `--color-accent` (amber): the MEASURED signal. Hover and pressed use `--color-accent-dim`.
- Channel B, `--color-accent2` (phosphor cyan): the BASELINE a Channel A value is compared with.
  Never decorative. If it is cyan it is the thing being compared against.

Grounds, darkest first: `--color-void`, `--color-ink`, `--color-surface`, `--color-card`,
`--color-line` (seams and borders). Text: `--color-text`, `--color-text-dim`, and `text-muted`
(`--color-muted`), which exists because the zinc greys failed WCAG AA. Use `text-muted`, not zinc.

Scene palette (`--color-signal`, `-probe`, `-warn`, `-alt`, `-danger`) is a separate system from
CAL-1. It names the four world lanes (work, chess, writing, open source), which must stay
colour-vision distinct (`scripts/validate_palette.js`). Do not alias it onto accent or accent2.

State colours are aliases, not new tints: `--state-ok`, `--state-degraded`, `--state-broken`.
Ink world swaps the whole set warm (ochre accent, terracotta accent2). Add a token there too
whenever you add one globally, or the swap leaves a cold hole.

Contrast floor is WCAG AA 4.5:1 for text, 3:1 for non-text. The a11y e2e (`e2e/a11y.spec.ts`)
runs with no allowlist.

## Typography

Three faces, no fourth: `--font-display` (Space Grotesk) for headings and wordmarks, `--font-body`
(Inter) for prose, `--font-mono` (JetBrains Mono) for kickers, labels and readouts.
Fluid scale tokens: `text-hero`, `text-h2`, `text-metric` (clamp-based, 375px to 1920px).
Kickers and labels are mono, uppercase, wide tracking (0.16em, see `src/index.css` near line 4176). Wordmarks are Space Grotesk 600, never 700. Ink world uses Rozha One for display.

## Layout

Mobile first, verified at 375 / 768 / 1024 / 1440 / 1920. Section rhythm is `--space-section-y`
(fluid), not a fixed 80px. Custom variants `short` and `compact` (top of `src/index.css`) handle
phone landscape, where width alone lies. Content is dense and composed, not a uniform stack of
bordered cards. Routes are registered once; see `docs/route-systemisation.md`.

## Elevation & Depth

Glass panels use `--color-glass` with `--color-glass-border` and backdrop blur (windows, dock,
palette). Shadows are `--shadow-elevation-1` to `-3`; stack higher for higher z. Glow gradients
(`--gradient-glow-signal`, `--gradient-glow-depth`) carry literal rgba and do not follow a token
swap, so edit them by hand. Prefer tonal grounds and 1px lines to more shadow.

## Shapes

Hairline `--stroke-hair` (1px) for idle borders and dividers, `--stroke-rule` (1.5px) for a rule
that carries meaning. No third weight. Brand marks use a 48 grid with two stroke weights (4 and 2),
one filled dot, and a "ghost step" repeat one unit off; the rules are in the brand system, not
restated here. Corner radii: TBD (see `src/index.css`; no radius token is declared in `@theme`).

## Components

No shared component library; components sit directly in `src/` (for example `src/AnimatedMetric.tsx`)
and in per-room folders. Reuse before inventing: `AnimatedMetric`, `CommandPalette`, `CiStrip`, `AnomalyRail`.
Per-project pages are driven by data (`project.theme` becomes CSS vars), so a project reskins
through data, not a one-off stylesheet. The labs (`src/labs/ThemeLab.tsx`) show the theme live.

## Motion

Define once, apply to prominent interactions: `--ease-out-expo` (reveals), `--ease-out-quart`
(hover and press), `--ease-spring` (rare overshoot); `--dur-fast`, `--dur-base`, `--dur-slow`.
No bespoke durations. Reduced motion always wins globally, and 3D has a static fallback.

## Do's and Don'ts

- Do read scene colours with `readColor()` / `readToken()`; r3f props and canvas take resolved strings.
- Do use semantic tokens and `text-muted`; a theme swap must reach every surface.
- Do keep amber for the measured value and cyan for its baseline, and nothing else.
- Do give a new colour a token with a usage count comment, or reuse one. `--lab-gold` shows the bar.
- Don't hardcode `#3ddc84` or `#5ee6ff` in a scene; that is why theme swaps once missed them.
- Don't add gradients to marks, mascots, sparkles, swooshes, or stock gradient heroes.
- Don't gate content behind a click or a boot sequence.
- Don't hand-type test or route counts; generated files (`npm run gen:*`) are regenerated, not edited.
- Don't let cyan or glow become mood lighting.

## Agent notes

- Brand and marks: the brand system plan lives in the private AgentHarness repo; the visual rules
  that matter here are summarised in Shapes above. Do not paste private plan text into this repo.
- Gate for UI changes: see README `## Gates` (`npm test`, `npm run lint`, `npm run test:e2e`,
  `npm run sentinel`). The unit gate proves the build, not that the page looks right; look at it.
- Known gaps: radius scale (TBD), a light theme for the main site (only resume print and ink
  world are light), and any component catalogue beyond the file listing.

## Changelog

| Date | Change | Why | Source |
|---|---|---|---|
| 2026-10-09 | Initial version, distilled from the code token files and existing design docs | Establish design direction for agents | DESIGN.md rollout |

## Open questions

- TBD: corner radii (no radius token declared in @theme).
- Known gap: a light theme for the main site (only resume print and ink world are light).
- Known gap: any component catalogue beyond the file listing.

## Evolving this file

Agents: when you change UI and find this file wrong or silent, fix it in the same change and add a Changelog row. Code token files win over this file; when they disagree, correct the doc. A user correction of a visual choice with a stated reason becomes a rule here immediately. Lessons that apply beyond this repo go to the LEARNINGS log of the `design-md` skill in AgentHarness.
