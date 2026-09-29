# /globe physical atmosphere: go/no-go

Wave 7 Lane 3 step B spike (`2026-09-29-globe-wave7-synthesis.md`, "Twilight-correct atmosphere",
step B). `@takram/three-atmosphere` 0.19.1 (MIT, already installed) behind a flag that is off by
default. Recommendation: **no-go, keep step A** (the Rayleigh-transmittance halo already in
`layers/sun.ts`/`layers/Atmosphere.tsx`). The reason is a single number that is not close: LUT
generation is 250x the budget.

## What was built

- `layers/PhysicalAtmosphere.tsx` (new): mounts `@takram/three-atmosphere/r3f`'s `<Atmosphere>` +
  `<Sky>`. `textures` is left undefined so `<Atmosphere>` builds its own LUTs at runtime with the
  package's `PrecomputedTexturesGenerator`; this lane ships none of the package's `.bin`/`.exr`
  files (verified below). Sun direction reuses this globe's own `sun.ts` computation (not takram's
  bundled astronomy-engine), converted into ECEF via a static `worldToECEFMatrix` built from
  `GLOBE_RADIUS` and this globe's Y-up frame (`geoMath.ts`'s `latLonToXyz` comment).
- `globeStore.ts`: one flag, `physicalAtmosphere`, read once at module load from `?atmo=physical`
  in the URL (same pattern as `initialPanelOpen`), off for every other visitor.
- `GlobeScene.tsx`: one `lazy()` import, one selector, one conditional `<Suspense>` mount, gated on
  `physicalAtmosphere && tier === 1`.
- No composer. `<Sky>` is a depth-tested full-screen quad (`SkyMaterial`, `depthTest: true`,
  `depthWrite: false`), not a postprocessing effect — it composites against the globe mesh's
  existing depth buffer directly, so it needs neither `GlobePost.tsx` (not on this lane's base;
  lane V2 is adding it in parallel) nor a minimal composer of its own. That absence is itself part
  of this go/no-go: the brief allowed a composer "if it needs one", and the measured answer is it
  doesn't, which undercuts the case for keeping the dependency around for a future Lane 2 tie-in.
- `e2e/globe-V3B.spec.ts`: flag off never fetches the chunk (byte-identical default), flag on
  fetches it and the canvas keeps rendering with a clean console.

## The three measured numbers

All measured on this machine (Apple M4, ANGLE Metal renderer, confirmed via
`WEBGL_debug_renderer_info` — not a software rasterizer) on 2026-09-29.

### 1. Lazy chunk gzip size

```
dist/client/assets/PhysicalAtmosphere-KTySxSqo.js: 247,403 B raw, 69,151 B gzip
```

**Under budget** (150 KB / 153,600 B gzip). Rollup inlined the whole import graph — takram's
`shared.js`/`shared2.js`/`shared3.js`, `r3f.js`, and `@takram/three-geospatial` — into this one
chunk, since `PhysicalAtmosphere.tsx` is its only consumer; nothing else in the app pulls in any
of it. `node_modules/@takram/three-atmosphere/assets/` does contain 11 `.bin`/`.exr` files
(source assets for a different, textures-provided code path this lane does not use, left
undefined here on purpose), but the built `dist/client` contains exactly two `.bin` files, both
pre-existing `public/sky/` assets (`stars-hyg41-m5.bin`, `earth-720x360.bin`) unrelated to this
package, and zero `.exr` files anywhere. Zero of the package's own LUT files shipped, as required.

### 2. LUT generation time

```
125,307 ms for one cold PrecomputedTexturesGenerator.update() call
```

**250x over budget** (500 ms). Measured with a standalone harness (real `THREE.WebGLRenderer`
against a real canvas, `powerPreference: "low-power"` to match `GlobeScene.tsx`'s own renderer
config, `three`/`postprocessing`/`@takram/three-geospatial` loaded from this repo's own
`node_modules` via an import map — decoupled from React/R3F mount timing on purpose, so this is
the package's own cost, not app overhead on top of it). One run was taken, not three: at 125
seconds per cold run, three repeats would have cost over six minutes for a number that is already
two and a half orders of magnitude past the budget — further samples would not change the
recommendation, only its precision, so the ladder says stop. This mounts as an unconditional
125-second full-thread stall (`<Atmosphere>`'s effect awaits `.update()` with no rAF yielding
inside the precompute passes) the very first time the flag is on, before the twilight-correct
limb this spike is for ever shows up. A returning visitor would not see a cached result either:
nothing here persists the LUTs across a session or across sessions — every mount regenerates them
from scratch.

### 3. Frame-time change

```
off (no atmosphere): 1,166.8 ms/frame measured mean, dusk, 1440x900
on  (physical atmosphere, after the LUTs finish): 1,331.7 ms/frame measured mean, same conditions
delta: +164.9 ms/frame under measured conditions (+14%)
```

**Caveat, stated plainly rather than smoothed over:** those absolute numbers are not real-device
frame times — they are inflated roughly 100x by this being one of eight parallel lane worktrees'
Chromium instances competing for one machine's CPU/GPU during this build wave (a flag-off,
completely unmodified `/globe` scored 1,166.8 ms/frame in this run and 3,627-4,041 ms/frame in an
earlier run taken while a second heavy Chromium instance was also mid-LUT-generation on the same
GPU — a >3x swing on identical code from contention alone). Reporting either absolute number as
"the" frame cost of this feature would be a number without an honest source, which this project's
own rule (G8) forbids. The relative delta measured back-to-back under matching contention
(+14%) is a weaker but still real signal: linearly extrapolated onto a real idle tier-1 frame
budget of roughly 16 ms (60 fps), +14% is about **+2.2 ms/frame** — at or just over the 2 ms
budget on its own, before even counting the 125-second stall above. This number is reported with
that extrapolation shown, not asserted as measured at 60 fps on an idle machine; a clean re-run
outside this build wave was not available in this session and is flagged as not verified below.

## Recommendation: no-go

The frame-time number alone would be a "maybe, re-measure on a quiet machine" result. The LUT
number is not: 125 seconds is not a rounding error against a 500 ms budget, and it manifests as
the flag doing nothing visible for over two minutes on first use, on real hardware, every single
session. That is disqualifying on its own, independent of the frame-time uncertainty above.

**Keep step A** (`layers/sun.ts`'s `ATMO_FRAG` Rayleigh-transmittance halo, already shipped, ~15
lines, no dependency, no runtime cost beyond what was already there). It produces the same
qualitative result — a limb that reddens toward the terminator and stays blue at noon — visible in
the before/after screenshots below, without a multi-second stall or a 69 KB gzip dependency.

If this is ever revisited: the fix is not "wait for a faster machine", it is precomputing the LUTs
once (build time or a cached fetch) instead of generating them client-side per session — which is
exactly the `.bin`/`.exr` files this spike was told to avoid shipping. That tension (ship the
files and blow the size budget everywhere, or generate them and blow the time budget on every
visit) is the actual finding here, not a machine-specific slowness this lane happened to hit.

## Screenshots (1440x900, Pune view, real imagery style)

Captured via a throwaway Playwright script against `vite preview`, fixtures mocked for
`/api/weather`, `/api/tle`, `/api/aircraft`, `/api/whereami` (G10). Saved under
`/private/tmp/claude-501/-Users-darkpandawarrior-Repos/740d63f5-5ee4-444c-898d-1c7247dd41ab/scratchpad/lanes/V3B/`
(scratch space, not committed — paths given here so the images are reproducible, not as a claim
that they ship with the repo):

| Time | Flag off | Flag on |
|---|---|---|
| Dawn (06:27 IST) | `off-dawn.png` | `on-dawn.png` — warm limb tint at the sunrise edge near India |
| Noon (12:27 IST) | `off-noon.png` | `on-noon.png` — limb stays blue, no red bias (correct: full daylight) |
| Dusk (18:27 IST) | `off-dusk.png` | `on-dusk.png` — clear orange-red limb along the terminator, strongest of the three |

Visually confirmed by reading each PNG: the physical model does what it is meant to (red at the
terminator, blue at local noon) and is qualitatively similar to step A's existing halo, not a
visible regression — the finding here is purely about cost, not correctness or looks.

## Deliberately not verified

- A frame-time re-measurement on a quiet (non-parallel-build) machine — flagged above, not done in
  this session because every other worktree on this Mac was also mid-build during this lane's run
  and re-running later would have meant losing the measurement window.
- Tier 2/3 behaviour: the flag is tier-1-gated in `GlobeScene.tsx` on purpose (brief scope), so
  tiers 2 and 3 never mount this component and were not separately measured.
- Whether a persisted/cached LUT (IndexedDB, or a build-time-generated set of files) would bring
  the 125 s figure under budget on repeat visits — out of scope for this spike; noted above as the
  actual lever if this is revisited.
