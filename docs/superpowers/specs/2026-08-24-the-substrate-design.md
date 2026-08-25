# The Substrate — ground-up redesign of /playground

Status: approved in principle 2026-08-24 (concept, in-world panels, rapier
deletion, data-driven terrain, four playhtml surfaces).

## 1. The problem this solves

The world today is read as a gimmick. Owner, verbatim: *"the path rendering is
so bad no one understands them — when I show them this part they just think
it's a funny quirk."*

That is a **legibility failure, not a polish failure**, and it is already
governed by an existing project law: if the metaphor needs an explanation
paragraph, it has already failed. A visitor sees a green box car in a dark void
with floating labels. Nothing on screen says *this is his record*.

Three defects sit underneath it, all verified against source:

1. **Projects are not destinations.** `src/world/Monuments.tsx` contains zero
   navigation code. Case studies, project towers and employer blocks are solid
   `CuboidCollider`/`CylinderCollider` obstacles. Only the 8 room pavilions have
   sensors. You cannot enter a project because no code path exists.
2. **The car gets launched.** A light dynamic rigid body meeting a tall static
   collider resolves penetration explosively. Structural to the physics choice,
   not tunable away.
3. **Mobile is unplayable.** Measured at 390x844, 4x CPU, Fast 4G: both touch
   sticks stacked bottom-right (x=253 and x=345 on a 390px viewport — the right
   one runs off-screen), the chat FAB rendered on top of them, HUD clipped
   mid-word ("ROOMS OPENED 0 /"), landscape-framed chase camera.

## 2. The form: a 3D ridgeline chart you drive through

Chosen by the dataviz procedure — the data's job is change-over-time plus
identity plus magnitude, which is a ridgeline / small-multiples form.

- **Z = time.** 2019 -> 2026, one continuous corridor. Ground-painted year
  numerals are the axis ticks.
- **X = series.** Parallel lanes, one per strand of the record. Fixed
  categorical hue order, never cycled.
- **Y = magnitude.** Real monthly values. The ridge under your wheels is data.

The visitor sees axis ticks, labelled lanes and ridges of differing height
before they see a vehicle. It reads as a chart first and a world second, which
is exactly the inversion the current build gets wrong.

### The story the terrain already tells

CORRECTED 2026-08-24, and the correction matters more than the original.

The lane was first built from `.chess-cache/lichess-games.json` alone: 14,119
games, peak 2020-12 at 619 (lockdown), collapsing to almost nothing from 2023.
That produced a tidy story — chess mountains in lockdown, then dies as the
career takes over, one life replacing another — and it was FALSE. Lichess ends
in early 2023 because he MOVED PLATFORMS. chess.com holds 2,017 games in 2023,
1,043 in 2024, 590 in 2025 and 1,092 in 2026. src/data/chess.ts knew that the
whole time; the generator never asked it.

The lane reads both platforms now, 18,906 games, and matches
chess.ts's own per-year totals within a handful. The real shape is a lockdown
peak and then a LOWER, CONTINUOUS line running alongside the work ridge rather
than under it — he did not stop, he changed venue and kept going while the
career grew.

That is a better fact and a worse slogan, which is exactly why it needed
checking. A terrain is a claim; the tidiest reading of a dataset is the one to
distrust.

## 3. Data contract

New generator `scripts/gen-timeline.mjs` -> committed output
`src/data/timeline.ts`. Follows the established pattern (source may be a
gitignored cache; the OUTPUT is committed, as with gen-excelsior).

| lane | source | status |
|---|---|---|
| chess | `.chess-cache/lichess-games.json` | verified: 14,119 games, 58 months |
| shipped | `src/data/store.ts` `updated` dates | verified: ~90 apps |
| writing | `writing.ts`, `archiveText.ts`, `excelsior`, `anthology` | 18 ISO dates + edition years |
| code | `api/_lib/github-activity-handler` snapshot | needs a snapshot step |

Rules:
- The generator never fails the build; on fetch/parse error it leaves the
  previous output untouched (matches `gen-*-stats.mjs` behaviour).
- Terrain height is normalised per lane, so one dense lane cannot flatten the
  others.
- Months with no data render as baseline, not as a gap — a gap reads as
  missing geometry, not as zero.

## 4. Physics: kinematic, deterministic, no rapier

`@react-three/rapier` and `@dimforge/rapier3d-compat` are removed. Driving
becomes a pure function of (state, input, dt) in `src/world/drive.ts`.

- Collisions resolve as slide-along-surface. Launch-on-impact becomes
  impossible by construction rather than tuned away.
- Removes 2.18MB decoded / 782KB brotli and the wasm init hitch (measured
  worst frame today: 373ms).
- Testable as pure functions. Per the project's own hard-won rule, assertions
  are **relationships, not values**: a head-on impact never increases speed;
  no frame displaces the car more than `maxSpeed*dt`; a lane is never exited
  without crossing its boundary; every destination is reachable from spawn.

## 5. Destinations: one derived registry

`src/world/destinations.ts` derives every enterable thing from
`src/data/surfaces.ts` + `src/data/profile.ts`. No hand-kept list — that is
the drift class this repo has been bitten by repeatedly, and the audit found
`SiteFooter.tsx` COLUMNS carrying it right now (8 of 17 routes).

Approach + dwell opens an **in-world panel**: the 3D scene keeps running
behind it, the car parks, the panel carries real project content and a link
to the full case study. No route change, no scene teardown.

Each destination sits at its true (time, lane) coordinate. Mileway's die
stands at its actual ship date. The data places the geometry; no aesthetic
placement.

## 6. Mobile-first

Portrait phone is the primary target; desktop is the enhancement.

- **One thumb.** Steer-only on the left half, auto-throttle. Deleting the
  second stick solves the corner collision rather than rearranging it.
- Chat FAB hidden while driving.
- HUD is a single top strip that reflows; every element carries an over-wide
  e2e assertion, because `html{overflow-x:hidden}` means clipping is silent
  and a "no horizontal scrollbar" check can never catch it.
- Camera raises and pulls back in portrait, framed down the corridor.
- Reduced-motion and no-WebGL keep the existing list-view fallback.

## 7. playhtml

- Ghost drivers: other live visitors as moving points of light.
- The lit map is shared and persistent — the collective artifact.
- Then beyond the world: margin notes on The Ink; reactions on
  chess/weeb/anthology; cursors on play routes only, never `/resume`,
  `/hire` or `/project/*`.

## 8. Colour

Categorical, fixed order, drawn from existing SID//OS tokens — no new palette,
no new typeface (project law 3). Lane hues must clear
`scripts/validate_palette.js` for CVD separation before shipping; sequential
single-hue ramp for the lit/unlit state. Lane identity is never colour alone —
each lane carries a ground-painted name.

## 9. Phases

Each phase ends with the world drivable.

1. `gen-timeline.mjs` + `timeline.ts` + terrain from real data.
2. `drive.ts` kinematic vehicle; rapier deleted; unit tests.
3. Destinations registry + in-world panel.
4. Mobile HUD, one-thumb control, camera.
5. playhtml ghosts + shared lit map.
6. The four playhtml surfaces beyond the world.

## 10. Out of scope

Palette or typeface changes. Any copy explaining the metaphor. Replacing the
homepage or any recruiter-facing surface.
