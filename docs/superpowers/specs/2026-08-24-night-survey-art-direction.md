<!-- Produced by a 9-agent council: 5 independent art directions from
     different lenses (instrumentation, landscape, architecture, print, cinema),
     scored by 3 blind panels (legibility / beauty / feasibility), then
     synthesised. Night Shift won on all three axes (8/8/8); this document is
     that spine with the best of the other four grafted in.
     Council run 2026-08-24. Companion to 2026-08-24-the-substrate-design.md,
     which owns the concept and the data contract; this owns the look. -->

# NIGHT SURVEY

**A surveyed corridor read in the dark: nothing emits light except the record itself, and your vehicle drags a full-width read-line across all four channels at once.**

Spine is *Night Shift* (fixtures-as-data, emissive-not-lights, silhouette-through-darkness). Grafted in: *Survey Deck*'s infrastructure signage grammar and inspection-vehicle car (kills the "toy" read before terrain is even parsed), *CAL-1*'s decaying-trace path and single-baked-texture discipline and full-width year sweep rank, *Basin Light*'s worn-track specular glint and its build-time-baked static fallback, *Survey Plate*'s achromatic fourth lane. Discarded: CAL-1's violet (`--color-alt` exists but is not in this world's palette — law 2), Survey Plate's hatch/stipple linework (dies at 390px), Basin Light's shadow cascade and triplanar, Survey Deck's mast lights and the car SpotLight (real light count stays at 2).

The one thing that makes it not an "atmospheric night level": **the light is signage, not mood.** Every emitter is a station marker, a fixture whose count/rhythm is a data value, or the read-line. Bloom is off by default even on desktop.

---

## 1. World coordinates (fixed, everything below assumes these)

| | |
|---|---|
| Z | `-84` (2019-01) → `+84` (2026-08), 92 months, **1.83 m/month** |
| X | `-28` → `+28`, four 14 m lanes. Centres: work `-21`, chess `-7`, writing `+7`, opensource `+21` |
| Y | terrain 0 → 2.5 m (capped, from generator) |
| Ground mesh | one `PlaneGeometry(56, 168, 28, 184)` — 5,152 quads, displaced **once** at load. No runtime displacement, ever. |

## 2. Palette (all sampled from `src/index.css`, no new hue)

```
ink        #0a0d0c   ground base
void       #060807   fog + zenith
line       #262e2b   seams, unlit trim
signal     #3ddc84   work
probe      #5ee6ff   chess
accent     #f2a13d   writing
text       #e8efe9   opensource (achromatic — the fourth "hue" is no hue)
readhead   #d8fbe6   the cursor only (signal mixed to white)
horizon    #0d1a1c   sky band (accent2 crushed to 6% value)
```

## 3. Ground surface

One `MeshStandardMaterial` (`color #0a0d0c`, `roughness 0.78`, `metalness 0.04`) extended via `onBeforeCompile` — we keep three.js PBR lighting for free and inject five things into one fragment shader. **No second material, no post-process, no procedural noise per fragment.**

Injected, in order:

1. **Baked plate texture** (`uPlate`) — one 2048×2048 canvas built once at load in an `OffscreenCanvas`: fine concrete grain, the four lane surface treatments, lane monogram glyphs at the south apron, and the two 14 m-tall SVG-baked numerals `2019` / `2026` lying flat on the aprons at each corridor end in `#1c2422` (decorative, baked to canvas — never DOM text). Tiled 4× along Z.
2. **Month seams** — `float m = fract((vWorldZ + 84.0) / 1.83);` a 12 mm recessed dark line (`#060807`) with an 8 mm lane-tinted bright edge at `emissive 0.12`. 92 of them, zero geometry, zero draw calls.
3. **Year seams** — same expression at `/21.96`; brightness → `0.5`, width → 40 mm, colour `#e8efe9`. Runs the full 56 m across all four lanes as **one crossing rank**.
4. **Lit map** (`uLit`, `DataTexture` R8, 128×384 = 0.4375 m/texel, `LinearFilter`) — the shared playhtml record. `float w = texture(uLit, vLitUv).r;` adds `pow(w, 0.6) * 0.10` emissive in the lane colour **and** drops roughness: `roughness = mix(0.78, 0.42, w)`. That second line is the whole trick — the worn track catches the raking key as a real specular glint, so history reads by material, not by glow.
5. **Read-line** (`uHeadZ`, `uGhostZ[4]`, `uGhostCount`) — see §7.

Lane surface treatment (baked into the plate, plus a per-lane `metalness`/`roughness` override via a vertex-colour lane index):

- work — **stepped terrace.** Displacement is snapped to 0.25 m risers, so the rise 2021→2026 reads as ten visible stairs in silhouette. Broom-finish concrete.
- chess — **smoothed massif.** Heights gaussian-smoothed over ±2 months: one mountain, not a comb. Exposed-aggregate grain.
- writing — **narrow crest.** Relief confined to a 6 m band inside the 14 m lane; the other 8 m is flat apron. A memory, not a mountain.
- opensource — **steel plate.** `metalness 0.55`, `roughness 0.35`, flat until 2025-10. The only reflective lane; it *sheets* the key light instead of diffusing it.

Between lanes: a 4 cm brushed-aluminium angle-iron berm (`metalness 0.9`, `roughness 0.3`), one extruded strip, 3 instances. Lane identity survives in silhouette and in a greyscale screenshot.

## 4. Sky, fog, light rig, camera

**Sky** — inverted icosphere, radius 300, 2-stop gradient shader (~20 lines GLSL, no texture): zenith `#050806` → horizon `#0d1a1c`, mix exponent 2.6 so the glow hugs the horizon line. No stars, no moon, no aurora, no animation. It reads as light pollution off a distant plant — a built universe with no sun in it.

**Fog** — `THREE.Fog('#060807', 18, 130)` desktop / `(12, 70)` mobile. Linear, not Exp2: it is also the LOD cliff, and a hard number is testable.

**Lights — exactly two `Light` objects in the entire scene. Nothing else is a light.**

```js
key  = DirectionalLight('#bfe8e0', 1.15)  // pos (-122, 28, 18) → target (0,0,0): 13° elevation,
                                          // azimuth ACROSS the corridor so relief throws long shading
fill = HemisphereLight('#0a1416', '#0f1a14', 0.35)
```

**Zero shadow maps.** Relief legibility comes from the 13° key's n·l falloff plus the emissive fixture rhythm. The car gets a 4×3 m radial-gradient decal plane at `y = 0.02`, multiply-blended, for contact.

**Camera** — chase, `fov 55`, near `0.5`, far `260`, height `3.2 m`, `9 m` behind, look-at `6 m` ahead of the car, positional damping `0.12`.

**Spawn (the five-second read).** Camera starts static at `(0, 14, -96)`, `fov 45`, looking north down the corridor for 1.5 s: four ridge profiles line up in rank — writing peaking early and dying, chess mountaining in 2020 and collapsing, work stepping up and never stopping, opensource flat until it isn't — before the viewer has touched a key. Then a 1.2 s ease into chase. Reduced motion skips the fly-in and starts in chase.

## 5. Lane identity — colour + second channel

| Lane | Colour | Non-colour channel (load-bearing) |
|---|---|---|
| **work** | signal `#3ddc84` | **Gantry arches.** 26 of them, one per documented milestone, 2.2 m tall spanning 8 m of the lane, green emissive strip on the top chord. Tallest furniture in the world. Plus the 0.25 m terrace risers. |
| **chess** | probe `#5ee6ff` | **Pulsing bollards**, one per month on the lane centreline, 0.5 m. Period `clamp(0.25 + 2.75 * (1 - g/619), 0.25, 3.0)` s and intensity `0.15 + 0.85 * sqrt(g/619)`. 2020-12 flickers at 4 Hz; 2023 is a 3 s dying blink. A heartbeat flatlining, no legend. |
| **writing** | accent `#f2a13d` | **Sodium lampposts**, 3.2 m, lit in exactly the 24 real months and nowhere else, each with a baked 3 m warm pool decal. The loneliest fixture on the field. |
| **opensource** | achromatic `#e8efe9` | **Static speckle field** — 480 desktop / 140 mobile 0.12 m emissive quads, density ∝ monthly contributions, absent before 2025-10 then flooding. No rhythm at all, which is what separates it from chess before colour does. |

Pulse phase is one uniform driven off `elapsed`, not per-instance JS. Every family is **one `InstancedMesh`, one draw call**, and none of them is a `Light`.

## 6. Month and year on the ground

- **Every month (1.83 m):** the shader seam from §3.2. Full 56 m width. You feel a beat pass every 1.83 m at speed without reading anything.
- **Every year (21.96 m):** the seam brightens and widens, **and** four real stationing posts appear — one at each lane's west berm, 1.4 m, steel, cross-braced, with a `#5ee6ff` emissive cap. All four fire in a single rank across the corridor. That crossing rank *is* the year.
- **The numeral:** a billboarded plane on the work-lane post carrying the year in JetBrains Mono, rendered as **inline SVG `<text>` baked to a 256×128 canvas** at load — `#e8efe9` on `#0a0d0c`, 15.8:1. Never DOM, never live, never low contrast. 8 numerals total.

## 7. The driven path — the read-line (this is the fix)

The complaint is that the path was unreadable. The answer is that the path is not a line you left behind; it is **a cursor you are pushing**, and the cursor crosses the whole chart, not just your lane.

**Layer A — the read-line (the cursor).** In the terrain fragment shader:

```glsl
float head = 1.0 - smoothstep(0.0, 0.13, abs(vWorldZ - uHeadZ));
float lateral = mix(1.0, 0.35, abs(vWorldX) / 28.0);  // hottest in your lane, still visible at the rim
emissive += head * lateral * READHEAD;                 // #d8fbe6
```

A 0.26 m bright bar locked to the car's Z, spanning the full 56 m, hugging the relief exactly because it is computed from world position. It rides up the chess massif and down the far side. One uniform per frame, zero geometry, zero overdraw. Two 0.9 m emissive blade posts ride the corridor edges at `x = ±28` at the same Z — the cursor's handles, so the line has ends. This single device does more work than everything else in the document: a transverse line crossing four parallel channels at a moving position is the universal grammar of a playhead on a chart, and it lands before anyone parses what the channels are.

**Layer B — the wake (seconds).** A ground-hugging additive ribbon at `y = +0.04`, 0.9 m wide, fixed-length **240-sample ring buffer** updated in place, never growing. Per-vertex alpha `exp(-age / 2.5)` — bright at the car, gone by ~45 m back. Colour is the current lane's. At the car sits a 1.4 Hz pulsing additive ring, `#d8fbe6`, always the hottest pixel on screen, so "where am I now" is never ambiguous.

**Layer C — the record (permanent, shared).** Driving writes into the `uLit` `DataTexture` with a 3-texel brush, accumulating (`v = min(1, v + 0.35)`), uploaded at 10 Hz. This array *is* the playhtml shared state. It renders as §3.4: a dim emissive groove plus the roughness drop that makes the raking key glint off worn track. Heavily driven stretches look physically polished. **Your live wake decays and pulses; the shared record does neither** — so "the needle right now" and "everywhere everyone has been" are two different visual languages, not two opacities of the same ribbon.

## 8. A live remote visitor

- The same inspection cart mesh, `InstancedMesh`, cap 8. Matte `#0a0d0c`, **no** hazard trim, **no** wake ribbon, one dim `#5ee6ff` tail strip at `emissive 0.4`.
- A **ghost read-line** at their Z: `uGhostZ[4]` + `uGhostCount`, same shader expression at `0.3` intensity in `#5ee6ff` instead of `#d8fbe6`. Visitors beyond the first four get the cart only.
- A 6-character JetBrains Mono id on a 1.1 m billboard sprite above the roll bar, baked from SVG at join.

Two other people reading the chart at 2021 and 2026 while you sit at 2019 is the entire collective-artifact thesis, delivered as three cursors on one instrument. No copy required.

## 9. The car

Site-inspection cart, ~2.4 m × 1.5 m, **~900 tris**. Boxy cab, exposed roll bar, oversized tread, whip antenna, roof light bar. Body `#0d100f`, `roughness 0.45`, `metalness 0.5` — it picks up rim light off the fixtures it passes instead of reading as flat geometry. `#3ddc84` corner-guard hazard trim on all four verticals — the livery real inspection equipment wears — and that is the *only* saturated paint. A 0.6 m `#d8fbe6` emissive bar across the front (the "lamp") and a `#3ddc84` tail strip that is literally the wake ribbon's emit point.

**The lamp is not a light.** It is an emissive bar plus a small additive sprite. The ground ahead is lit by the read-line shader band, which is crisper, free, and keeps the real light count at two. No chrome, no gloss, no racing cues.

## 10. Mobile ladder

One-time device tier at load: `matchMedia('(max-width: 820px)')` + a single `renderer.getContext().getParameter(MAX_TEXTURE_SIZE)` probe. **No runtime FPS watchdog** — untestable, and it flickers quality mid-drive.

**Dropped first (tier: any phone, and desktop by default):** the `EffectComposer` entirely — bloom and vignette. Emissive materials plus ACES tone-mapping carry the glow. Also drops: ghost read-lines from 4 → 2, `pixelRatio` clamped to 2.

**Dropped second (tier: phone):** instance counts halve — opensource speckle 480 → 140, chess bollards render only within 60 m of the car (index-window on the instanced draw, not per-frame culling), stationing posts keep all 8 years. Lit map 128×384 → 64×192, uploaded at 5 Hz. Fog pulled to `(12, 70)` so the far 100 m of corridor is void.

**Dropped third (tier: 4× throttle detected via a 500 ms load-time `performance.now()` bake benchmark exceeding 180 ms):** all fixture `InstancedMesh`es except the 26 gantries are removed — lane identity falls back to the baked plate texture, the shader seams, the terrace/steel/crest relief and the read-line, all of which are free. Ground segments drop to `PlaneGeometry(56, 168, 14, 92)`. Car contact decal off.

Even at tier 3 the five-second read survives, because it never depended on fixtures: it depends on four ridge silhouettes, a seam cadence, and a transverse cursor.

## 11. Reduced motion / no WebGL

**No WebGL, or `prefers-reduced-motion` with an explicit opt-out unclicked:** serve `public/p/world/corridor.png` — a top-down orthographic bake of the same terrain under the same 13° key, produced at **build time** by `scripts/gen-world-plate.mjs` from the identical generator data (no runtime cost, no drift), with the shared lit map burned in as a static overlay and the 8 year rules and lane monograms drawn as **inline SVG on top** of it in the DOM. It reads as "a surveyed corridor with a track worn into it" while completely frozen, because the landform carries the story, not the driving. Alt text names the four strands and the date range — that is description, not metaphor exposition.

**`prefers-reduced-motion` with WebGL accepted:** full scene renders, but the fly-in is skipped, the chess bollard pulse is frozen at its intensity value (rate → 0), the wake ribbon's decay is frozen (it becomes a static 45 m trail), the read-line stops at 2026-08, and the car only moves on explicit input — never idle-drifts.

## 12. Build order

1. **The terrain material.** `PlaneGeometry(56,168,28,184)` + load-time displacement from the generator + `onBeforeCompile` carrying the baked plate texture, the month/year seams, and the lane roughness/metalness split. Ship it grey with no fixtures — if the four ridges and the seam cadence don't already say "record" from the spawn camera, nothing later fixes it.
2. **The read-line and the lit map.** `uHeadZ` band, the 240-sample wake ring buffer, the pulsing head ring, and the R8 `DataTexture` with the roughness-drop wear channel wired to playhtml. This is the named failure; it gets built second and validated on a real 390 px phone at 4× throttle *before anything else is added*.
3. **The four fixture families.** One `InstancedMesh` each: gantries, pulsing bollards, lampposts, speckle field. Pulse phase from one uniform.
4. **The stationing rank.** Year posts × 4 lanes × 8 years, SVG-baked numerals, milestone gantry placement, the apron end-numerals.
5. **The ladder and the fallback.** Device tier at load, the three drop steps, and `scripts/gen-world-plate.mjs` producing the static bake + its SVG overlay in CI.
