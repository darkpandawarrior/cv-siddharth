# Lab Bench revamp — design spec

Date: 2026-07-24
Status: approved, implementing

## Problem

The Lab Bench (`src/LabBench.tsx` + `src/SignalLab.tsx`) ships 4 live-in-browser
simulations, all illustrating Dice.tech metrics with hand-tuned synthetic data:
Signal Lab (GPS 50%→95%), Crash Triage (-80%), Recomposition (92% Compose),
White-label (80% faster). The animation/interaction quality is good but the
content is thin: it only covers one employer, some sims don't actually land on
the numbers they claim to prove, and none of it draws on the much richer real
data already sitting in `src/data/profile.ts` for Mileway (46 modules, 5
platforms, real location engine), PaymentsLab (66 gateways, 5 money rails),
Kursi (ISMCTS AI, 10 personas), HireSignal (62 providers, zero-token scan),
and Deadlock (deterministic replay, 0-tolerance gate).

## Goals

- Every instrument's live numbers should actually converge on the claim its
  copy makes, not just gesture at it.
- Expand from 4 to 9 instruments, each grounded in data that already exists
  in `profile.ts` / `projectStats.ts` — no invented numbers, no new content
  files.
- Keep the existing interaction language (toggle a switch/slider, watch a
  canvas react, read a live counter, "the full story →" link out).
- Extract the repeated canvas/RAF/resize boilerplate now that it will exist
  in 7+ files instead of 2.

## Architecture

**File split.** `LabBench.tsx` today inlines 3 labs + imports `SignalLab.tsx`
(419 lines). Splitting every lab into its own file, `LabBench.tsx` becomes
pure tab-shell orchestration (the `TABS` array, `openLab()`/`pendingLab`
plumbing, tab-row rendering):

```
src/labs/
  useCanvasLoop.ts     — shared resize/DPR/RAF/reduced-motion hook
  SignalLab.tsx         (moved, then rewritten — see below)
  CrashLab.tsx          (extracted, recalibrated)
  RecomposeLab.tsx      (extracted, stat added)
  ThemeLab.tsx           (extracted, rewritten — see below)
  MilewayLab.tsx        (new)
  PaymentsLabLab.tsx    (new)
  KursiLab.tsx          (new)
  HireSignalLab.tsx     (new)
  DeadlockLab.tsx       (new)
```

`useCanvasLoop(draw, step, opts)` hook: takes a `step(dtMs)` + `draw()` pair,
owns the canvas ref, ResizeObserver/DPR setup, the RAF loop, and the
`prefers-reduced-motion` fast-forward-then-single-frame path — currently
duplicated near-verbatim between `CrashLab` and `SignalLabPane`, about to be
duplicated 5 more times. Returns `{ canvasRef, width, height }`. This is the
only shared abstraction added; each lab's simulation logic (state, physics,
draw calls) stays local to its own file — there's no shared "engine" beyond
the loop plumbing, because the 9 sims don't share enough drawing logic to
justify one.

## The 9 instruments

### Existing 4 — recalibrated, not just moved

1. **Crash Triage** — `CAUSES` distribution currently puts the top-2 cluster
   share at ~57-68%, but the copy says "that's how -80% actually happened."
   Recalibrate probabilities so top-2 converges near 80% (e.g.
   main-thread I/O 52% / coroutine race 28% / lifecycle leak 12% /
   bitmap OOM 6% / OEM quirk 2%).

2. **Recomposition** — add a derived "avg screen touched" stat
   (`naive 100% vs optimized 2.5%`) next to the existing wasted/needed
   render counters — same data, legible as a percentage.

3. **Signal Lab → full journey simulation** (near-total rewrite). Replace
   the single repeating figure-eight + one tunnel with a longer looping
   route with five labeled zones, each modeling a documented Mileway
   location-engine challenge: open road (clean) → urban canyon (multipath
   spikes) → tunnel (total dropout) → highway on-ramp (high speed, sparse
   sampling) → parking structure (intermittent weak signal).

   Independently toggleable pipeline stages (checkboxes, not one combined
   switch):
   - Jitter suppression
   - Spike rejection (existing logic: reject samples that jump further than
     physically plausible from the predicted position)
   - IMU/accelerometer fusion (existing logic: dead-reckon through gaps)
   - Device-tier adaptive sampling (toggle flagship/budget — changes sample
     cadence, shows fusion compensating for sparser data)

   New live readout: a **four-bucket distance accumulator** (named after
   Mileway's real one) — running trip distance split into
   confirmed / reckoned / rejected buckets vs. ground-truth distance, with a
   live accuracy % so toggling stages visibly moves the number the way spike
   rejection actually moved 50%→95% in production. Footer links to both the
   Dice.tech case study and `/#project/mileway`, credited to both.

4. **White-label → real theme tokens + layout engine** (near-total rewrite).
   Replace the 5 fictional brand colors (mint/ocean/grape/ember/rose) with
   the 6 real per-project theme tokens already defined in `profile.ts`:
   site default green, Kursi's teak/gold (+ its `Rozha One` display font —
   swap font, not just color), Mileway's cyan, PaymentsLab's violet,
   HireSignal's blue, Deadlock's rose. Add a **layout-engine toggle**
   (Card / Hero — two template archetypes, same tokens) so the demo proves
   the token layer drives more than color. Keep the 4 detailed client cards
   + add a compressed ~16-swatch strip beneath them (real number is 20+
   clients) that retints in the same tap, plus a static "3 weeks → 3 days"
   delivery-time bar.

### New 5 — one new visual metaphor each, all reusing `useCanvasLoop`

| Lab | Metaphor | Live stat | Links to |
|---|---|---|---|
| **Mileway** | Radial module graph; toggle "isolate features" between a tangled all-to-all blob and the real 13-feature-module star meeting only at `:app` | "cross-feature dependencies: N → 0" | `/#project/mileway` |
| **PaymentsLab** | Particles from "checkout" bounce off with a red ✕ (no shared contract) or funnel through one `PaymentGateway` hub into 4 category bins (native/hosted/mobile-money/stub) — bin motif reused from Crash Triage, inverted | "66 gateways reachable · 0 gateway-specific code" | `/#project/paymentslab` |
| **Kursi** | Difficulty slider (Easy→Grandmaster) drives a live-growing Monte Carlo search tree, iteration count climbing 1.5k→16k, ending in a bot's bluff/fold call | "iterations: N · persona: X" | `/#project/kursi` |
| **HireSignal** | One query fans out to a ring of 62 provider dots; toggle SimHash de-dup on/off, watch duplicate listings collapse or pile up | "62 providers · N duplicates collapsed · 0 tokens spent" | `/#project/hiresignal` |
| **Deadlock** | Two replays of the same recorded input path overlap exactly (drift 0.000000); a "perturb" button edits one frame, paths visibly diverge, gate flips to BLOCKED | "drift: 0.000000 · gate: PASS" → "BLOCKED" | `/#project/deadlock` |

No new content/data files — every number above already exists in
`profile.ts` / `projectStats.ts`.

## Wiring & UI

- `LAB_OF`-equivalent maps extended in `App.tsx` (case studies) and
  `ProjectDetail.tsx` (project pages) so Mileway/Kursi/PaymentsLab/
  HireSignal/Deadlock cards get an "Open in Lab Bench →" button, mirroring
  the existing 4-case-study pattern. The Mileway featured card (currently
  link-only) gets one too.
- Tab row in `LabBench.tsx` groups into two labeled rows — **Dice.tech
  (production)** vs **Personal builds** — instead of 9 undifferentiated
  pills.
- Copy updates: `Playground.tsx` ROOMS blurb ("Four experiments" → reflects
  9), `App.tsx` RoomFrame tagline ("four instruments" → updated),
  `LabBench.tsx` intro paragraph.

## Non-goals

- No new npm dependencies (no map/graph libraries — everything stays plain
  canvas/SVG, matching the existing labs).
- No changes to `profile.ts` / `projectStats.ts` content — this is a new UI
  layer over existing data.
- No changes to the AI chat assistant's system-prompt generation
  (`gen-system-prompt.mjs`) — out of scope, it already draws from the same
  `profile.ts`.

## Verification

`npm run lint` and `npm run build` (`tsc -b && vite build`) must pass.
Visual spot-check of all 9 tabs in the dev server (toggles/sliders respond,
canvases render, reduced-motion fallback still single-frames, no console
errors) before calling this done.
