# The Playground World — design

**Date:** 2026-08-05
**Status:** approved, ready for implementation
**Route affected:** `/playground`

## Summary

`/playground` stops being a grid of cards and becomes a drivable 3D world. One craft that
morphs between wheels, hull and wings; three media (land, water, air); all eight rooms placed
as physical structures you navigate to rather than click. A timed triathlon course threads
all three modes together.

The card grid is not deleted — it is extracted intact and becomes the fallback and the
always-available alternative view.

## Why this shape

Three constraints drove every decision below:

1. **The room registry stays authoritative.** `siteRooms` in `src/data/profile.ts` already
   feeds the hub, `RoomFrame`'s pager, and `gen-system-prompt.mjs`. The world reads `ROOMS`
   too. Nothing gets a second list of rooms.
2. **Navigation must survive without WebGL.** A hub whose only affordance is a physics
   simulation is a hub that breaks for a recruiter on a locked-down laptop.
3. **The failure mode to design against is the soft-lock** — a visitor stuck in the wrong
   craft mode, unable to reach anything. That is why mode selection is a pure, unit-tested
   function rather than physics-by-eyeball.

## Architecture

```
src/Playground.tsx          shell: header, palette, presence, PlayRoom (unchanged responsibilities)
├── src/RoomGrid.tsx        the existing card grid, extracted verbatim
└── src/world/              lazy chunk — nothing else on the site imports this
    ├── World.tsx           default export; Canvas + <Physics> + scene assembly
    ├── Craft.tsx           the rigid body + Rapier vehicle controller
    ├── craftPhysics.ts     PURE — mode state machine + force parameters (no three/R3F imports)
    ├── Terrain.tsx         mainland, atolls, sky islands + their colliders
    ├── Water.tsx           sea surface + buoyancy volume
    ├── Pavilions.tsx       one structure per ROOMS entry + sensor volumes
    ├── Props.tsx           instanced knockable debris (keycaps, pencils, mugs, crates)
    ├── Hud.tsx             room prompt, List toggle, triathlon timer, touch controls
    ├── triathlon.ts        PURE — checkpoint sequencing, timing, best-time persistence
    └── worldData.ts        placements, checkpoints, prop layout — data only
```

**Selection rule** in `Playground.tsx`:

```ts
const wantsWorld = hasWebGL() && !prefersReducedMotion() && !forcedList;
```

`forcedList` is React state toggled by the HUD's **List** button, seeded from
`localStorage["playground:view"]`. When `wantsWorld` is false, `<RoomGrid/>` renders and
`src/world/` is never imported.

**Dependency:** `@react-three/rapier@2.2.0`. Peers already satisfied (react 19.2.8,
three 0.185.1, @react-three/fiber 9.6.1). Loaded only inside the `src/world/` lazy chunk, so
no other route pays for it.

## Module contracts

Implementations must match these signatures exactly — they are the seams between work units.

### `craftPhysics.ts` (pure)

```ts
export type CraftMode = "wheels" | "hull" | "wings";

export type MediumProbe = {
  grounded: boolean;        // any wheel in contact this frame
  submergedDepth: number;   // metres of chassis below sea level; 0 when clear
  airborneMs: number;       // ms since last ground or water contact
  speed: number;            // forward speed, m/s
};

/** The morph state machine. Deterministic, no hysteresis surprises. */
export function nextMode(current: CraftMode, probe: MediumProbe): CraftMode;

/** Upward force from displacement, N. Zero when submergedDepth <= 0. */
export function buoyancyForce(submergedDepth: number): number;

/** Lift from airspeed, N. Zero below STALL_SPEED. */
export function liftForce(speed: number): number;

export const LAUNCH_SPEED: number;   // min speed for wings to deploy
export const STALL_SPEED: number;    // below this, wings generate no lift
export const SEA_LEVEL: number;      // world Y of the water plane
```

Transition rules, in priority order:

| From | Condition | To |
|---|---|---|
| any | `submergedDepth > 0` | `hull` |
| `wheels` | `airborneMs > 300 && speed >= LAUNCH_SPEED` | `wings` |
| `hull` | `submergedDepth <= 0 && grounded` | `wheels` |
| `wings` | `grounded` | `wheels` |
| — | otherwise | unchanged |

**Invariant to test:** no probe input leaves the craft in a mode it cannot exit. Specifically,
`wings` with `speed = 0` must fall back to `wheels` on ground contact, and `hull` on dry land
must return to `wheels`.

### `triathlon.ts` (pure)

```ts
export type Checkpoint = { id: number; position: [number, number, number]; radius: number };

export type RunState = {
  startedAtMs: number | null;
  nextCheckpoint: number;
  finishedMs: number | null;
};

export function beginRun(nowMs: number): RunState;
/** Advances only on the correct next checkpoint; out-of-order passes are ignored. */
export function passCheckpoint(state: RunState, id: number, nowMs: number): RunState;
export function loadBestMs(): number | null;
export function saveBestMs(ms: number): void;   // localStorage, keeps the lower value
```

### `worldData.ts`

```ts
export type Medium = "land" | "water" | "air";

export type Placement = {
  to: string;                          // MUST match a ROOMS[].to
  position: [number, number, number];
  medium: Medium;
  shape: "slab" | "crt" | "board" | "atoll" | "pcb";
};

export const PLACEMENTS: Placement[];
export const CHECKPOINTS: Checkpoint[];
export const THERMALS: { position: [number, number, number]; radius: number; strength: number }[];
```

Room-to-medium assignment:

| Medium | Rooms |
|---|---|
| land | `/compose`, `/lab`, `/forge`, `/terminal` |
| water | `/weeb`, `/chess` (atolls in the Ink sea) |
| air | `/blueprint`, `/map` (sky islands, thermal-gated) |

## Behaviour

### The craft

One dynamic Rapier rigid body throughout. On land it is driven by
`DynamicRayCastVehicleController` (four raycast wheels, real suspension). Only the applied
force model changes per mode:

- **wheels** — engine torque, steering, wheel friction.
- **hull** — buoyancy proportional to submerged depth, raised linear damping, thrust along
  forward; wheel engine force zeroed.
- **wings** — lift proportional to forward speed squared, pitch/roll on the steering axes.

Sustained flight comes from **thermals**, not a throttle: updraft cylinders defined in
`THERMALS`, rising off the sky islands. Enter one, circle, climb.

### Entering a room

Each pavilion carries a Rapier sensor volume. Entering it raises a HUD card showing the room's
label and tint. Navigation fires on confirmation only — a ~1 s dwell inside the volume, or
Enter / tap. Never on contact alone. Confirming calls the same `bump(\`room:${slug}\`)` pulse
event the card grid fires, so the visit counters stay consistent across both views.

### Triathlon

Checkpoints are passed in order; out-of-order passes are ignored. The course is routed so it
cannot be completed in a single mode: mainland sprint → keycap ramp launch → glide to an atoll
→ splashdown → sail the strait → catch a thermal → land on a sky island. Timer in the HUD,
best time in `localStorage`. Nothing server-side.

## Accessibility, input, performance

- **List always reachable.** The HUD carries a permanent **List** button; the choice persists.
- **Skipped entirely** when `hasWebGL()` is false, under `prefers-reduced-motion`, and in
  print (`@media print` hides the canvas, as the anomaly rail and instrument view already do).
- **Screen readers** get the grid, not a described car: the canvas is `aria-hidden`, with
  `RoomGrid` rendered as its alternative in the accessibility tree.
- **Keyboard:** WASD / arrows to drive, Enter to confirm a room, Escape to release control.
  Focus is never trapped in the canvas.
- **Touch:** left thumbstick to steer, right pedal to accelerate.
- **Performance:** DPR capped at 1.5; props instanced; physics stepping paused when the tab is
  hidden or the list is open; renderer and physics world disposed on unmount, preserving the
  site's rule that only one WebGL context is ever live.

## Testing

**vitest (pure logic — no canvas):**

- `nextMode` covers every transition in the table above, plus the no-soft-lock invariant.
- `buoyancyForce` / `liftForce` return zero below their thresholds and rise monotonically above.
- `passCheckpoint` ignores out-of-order and repeat passes; `saveBestMs` keeps the lower value.
- **Registry invariant:** every `ROOMS[].to` has exactly one matching `PLACEMENTS` entry, and
  every `PLACEMENTS[].to` matches a room. This is the test that earns its keep — a room added
  to `profile.ts` without a placement would silently vanish from the world while still
  appearing in the grid.

**playwright e2e:**

- With WebGL unavailable, `/playground` renders the card grid and every room is reachable.
- The HUD **List** toggle switches views and the choice survives a reload.
- Print rendering hides the canvas.

## Phasing

Each phase leaves `main` green and `/playground` usable.

1. **Skeleton** — extract `RoomGrid`, wire fallback + List toggle, Canvas + Rapier + flat
   ground + drivable craft + one pavilion + HUD confirm.
2. **Mainland** — the four land rooms as objects, props, ramps, desk-scale art pass.
3. **Water** — sea surface, buoyancy, hull morph, the two atoll rooms.
4. **Air** — launch, wings, thermals, the two sky islands.
5. **Triathlon** — checkpoints, timer, best time.
6. **Later, optional** — visitor ghost craft over the existing playhtml layer; extra craft
   parked around the map for explorers.

## Explicitly out of scope

- Hand-modelled GLTF assets. Every shape is a three.js primitive; the desk scale is what makes
  that read as intentional rather than as a limitation.
- Server-side leaderboards, accounts, or anything requiring moderation.
- Replacing the landing page or any route other than `/playground`.

---

## Scope correction — 2026-08-06

The world above was built, and then kept growing: four craft modes, orbit and
space, launch pads, thermals, a timed triathlon, sixteen collectibles, six
achievements, a data skyline, a stunt yard, sky gates, orbit debris. That is
several features' worth of surface on a hub whose job is **getting a visitor
into one of eight rooms**.

The cost was not abstract. Three quarters of the defects found by playing it
were states the craft could enter and not leave — capsized in open water with
recovery gated on being near the ground, wedged on an atoll with no rule
describing it, pinned under a sky island by its own updraft — and the screen
was full of things competing for attention rather than pointing at a door.

**What the world is now:**

| Kept | Why |
|---|---|
| Wheels and hull | Two modes reach every room. That is the job. |
| Drive into a room to enter it | The whole mechanic. |
| The compass | Eight rooms on a 100m map are unfindable without it. |
| 16 artifacts, each a real fact from the site's own data | The one progression worth having: exploring the world and reading the CV become the same act. |
| The Mileway GPS lens | Demonstrates the hero project instead of citing it. |
| Sound, List view, reset, print/no-WebGL/screen-reader fallbacks | Polish and non-negotiables. |

**Cut:** flight and wings · orbit and space · thermals · launch pads · the
triathlon and its checkpoints · achievements · the stunt yard · sky gates ·
orbit debris. The two sky-island rooms became atolls, so every room is now
reachable by driving or sailing.

The lesson worth keeping: each addition was individually defensible and the sum
was not, because nothing in the process was asking "does this help someone open
a door". A hub is a means, and this one had started competing with the rooms it
exists to advertise.
