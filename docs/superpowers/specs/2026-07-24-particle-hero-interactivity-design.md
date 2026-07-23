# Particle Hero Interactivity — Design

Date: 2026-07-24 · Repo: cv-siddharth · Deploys: Vercel (push to main) → cv-siddharth.vercel.app

## Diagnosis

`ParticleHero`/`ParticleHeroScene` (the landing hero's morphing point-cloud sphere) is the only
"hero art" scene on the site with zero pointer interaction — its host div is explicitly
`pointer-events-none`, and the R3F scene has no `onPointer*` handlers at all. Every sibling scene
already has some form of it: `SkillsOrbitScene`/`FoundationGraphScene`/`StoryMapScene` all share
one identical drag-to-spin-with-inertia pattern (`onPointerDown/Move/Up/Leave` on a group,
horizontal-velocity decay in `useFrame`); `ParticleWordmark` has click-to-scatter repel physics;
`Phone3DScene` has passive cursor-tilt. `AmbientBackground` is the one other non-interactive scene,
but it's deliberately full-viewport fixed wallpaper — out of scope, should stay passive.

## Goal

Bring `ParticleHero` in line with the rest of the site's established interaction idiom, reusing
existing patterns rather than inventing new ones. Desktop gets drag-to-spin + idle parallax;
mobile gets a tap-kick instead of continuous drag, to avoid hijacking the first scroll gesture in
the hero's top ~350px zone (thumb-landing territory).

## Design

### Desktop (`pointer: fine` + `min-width: 1024px`, matches `CursorAura`'s existing gate)
- **Idle parallax:** sphere group rotation gets a small damped offset toward pointer position,
  same `MathUtils.damp`-toward-target technique `Phone3DScene` already uses for its tilt.
- **Drag-to-spin:** exact `onPointerDown/Move/Up/Leave` + velocity-decay pattern already live in
  `SkillsOrbitScene`/`FoundationGraphScene` — copied, not reinvented. Horizontal drag imparts
  angular velocity to `pts.rotation.y`, decaying each frame.
- Host div drops `pointer-events-none` only when this flag is true.

### Touch (anything else, motion-safe)
- **Tap-to-kick:** a stationary `pointerdown`→`pointerup` (no movement — so it never competes
  with a scroll swipe) applies a brief outward radial impulse to points near the tap, adapted from
  `ParticleWordmark`'s repel-on-click math. Implemented as an *additive* offset buffer layered on
  top of the existing morph-lerp `positions` array (never mutates the base formation data), decaying
  over ~1s back to zero. The 5-shape auto-morph cycle underneath is untouched.
- No continuous drag-to-spin on touch — protects the first-scroll gesture.

### Reduced motion
No interactivity at all — matches the existing site-wide convention (`CursorAura`, current hero
already gate on `prefers-reduced-motion`).

### Affordance
Small "drag to spin" hint label, desktop-only, same wording/placement convention as
`SkillsOrbit`'s existing "drag to spin · click a skill to filter" hint — one consistent idiom
site-wide, not a new one-off string.

## Explicitly out of scope
- `AmbientBackground` — stays passive full-page wallpaper, not made draggable.
- No changes to `SkillsOrbit`/`FoundationGraph`/`StoryMap`/`ParticleWordmark`/`Phone3D` — they
  already have this.
- Broader "revamp UI/UX everywhere" — tracked as an open backlog, tackled as separate scoped
  follow-ups rather than one spec.

## Files touched
`src/ParticleHeroScene.tsx` (drag/parallax/kick logic), `src/ParticleHero.tsx` (interactive flag,
conditional `pointer-events-none`, hint label).
