import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CITY } from "./city.ts";
import { timeline } from "../data/timeline.ts";
import { heightAt, laneCenterX, LANE_WIDTH, MONTH_DEPTH } from "./heightfield.ts";
import { worldPalette, type WorldPalette } from "./palette.ts";
import { glslVec3 } from "./Terrain.tsx";
import { deviceTier, tierBudget } from "./deviceTier.ts";

/**
 * NIGHT SURVEY §5 — THE FOUR FIXTURE FAMILIES, and §6 — THE STATIONING RANK.
 *
 * Each family is exactly one `InstancedMesh`, one draw call, and none of
 * them is a `Light` — the scene's two `Light` objects live in World.tsx and
 * nothing here adds a third. Where a family needs to glow, it does so the
 * way Terrain.tsx's ground shader does: an `onBeforeCompile` injection into
 * a plain `MeshStandardMaterial`, never a second material and never a
 * `pointLight`/`spotLight`.
 *
 * Every position below comes from `src/data/timeline.ts` (via
 * heightfield.ts's own lane/month math) or from `city.ts`'s coordinate
 * spine — nothing here invents a placement.
 */

const LANE_KEYS = timeline.lanes.map((l) => l.key);
const WORK = LANE_KEYS.indexOf("work");
const CHESS = LANE_KEYS.indexOf("chess");
const WRITING = LANE_KEYS.indexOf("writing");
const OPENSOURCE = LANE_KEYS.indexOf("opensource");

const MONTHS = timeline.months;

/** World-space Z of a month's centre — same formula as heightfield.ts's own
 *  (private) `monthCenterZ`, re-derived here rather than exported from
 *  there: heightfield.ts is explicitly out of scope for this task (it is
 *  drive.ts's own dependency), so this file reads its PUBLIC surface only. */
function monthZ(index: number): number {
  return CITY.z0 + MONTH_DEPTH * (index + 0.5);
}

const dummy = new THREE.Object3D();

/** A tiny deterministic PRNG (mulberry-ish LCG) — every scattered family
 *  below has to look identical on every load, never reshuffle on reload. */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Stamps a per-vertex `aEmit` gate (0 or 1) onto a geometry before it goes
 *  into `mergeGeometries` — the merged result carries ONE material but only
 *  the vertices stamped `1` (a gantry's top chord, a lamppost's cap, a
 *  stationing post's cap) glow, via `applyEmitGate` below. */
function withEmit<T extends THREE.BufferGeometry>(geo: T, emit: number): T {
  const count = geo.attributes.position.count;
  geo.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(count).fill(emit), 1));
  return geo;
}

/** The static half of the emissive-gate trick: a fixed per-vertex `aEmit`
 *  baked at geometry build time, multiplying a fixed colour/intensity — no
 *  animation, unlike `applyPulseShader` below. Mirrors Terrain.tsx's own
 *  `onBeforeCompile` emissive injection so a merged multi-part fixture can
 *  still be one material, one draw call. */
function applyEmitGate(material: THREE.MeshStandardMaterial, emitHex: string, intensity: number): void {
  const color = glslVec3(emitHex);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aEmit;\nvarying float vEmit;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvEmit = aEmit;`,
    );
    shader.fragmentShader = `varying float vEmit;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit * ${intensity.toFixed(2)} * ${color};`,
    );
  };
  material.customProgramCacheKey = () => `night-survey-emit-${emitHex}-${intensity}`;
}

// ── work — gantry arches (§5) ───────────────────────────────────────────

const GANTRY_HEIGHT = 2.2;
const GANTRY_SPAN = 8;

function buildGantryGeometry(): THREE.BufferGeometry {
  const legT = 0.12;
  const chordT = 0.14;
  return mergeGeometries([
    withEmit(new THREE.BoxGeometry(legT, GANTRY_HEIGHT, legT).translate(-GANTRY_SPAN / 2, GANTRY_HEIGHT / 2, 0), 0),
    withEmit(new THREE.BoxGeometry(legT, GANTRY_HEIGHT, legT).translate(GANTRY_SPAN / 2, GANTRY_HEIGHT / 2, 0), 0),
    withEmit(new THREE.BoxGeometry(GANTRY_SPAN + legT, chordT, chordT).translate(0, GANTRY_HEIGHT, 0), 1),
  ]);
}

/** One per documented work-lane milestone (`timeline.lanes[work].milestones`
 *  — 26 of them, both `role` and `delivered` entries), never a fixed count:
 *  a milestone added to the generator's source shows up here for free. */
function Gantries({ c }: { c: WorldPalette }): JSX.Element {
  const geometry = useMemo(buildGantryGeometry, []);
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: c.line, roughness: 0.5, metalness: 0.6 });
    applyEmitGate(mat, c.signal, 1.4);
    return mat;
  }, [c.line, c.signal]);
  const monthIndices = useMemo(() => {
    const lane = timeline.lanes[WORK];
    return (lane.milestones ?? []).map((m) => MONTHS.indexOf(m.ym)).filter((i) => i >= 0);
  }, []);

  return (
    <instancedMesh
      args={[geometry, material, monthIndices.length]}
      frustumCulled={false}
      ref={(mesh) => {
        if (!mesh) return;
        const x = laneCenterX(WORK);
        for (let i = 0; i < monthIndices.length; i++) {
          const z = monthZ(monthIndices[i]);
          dummy.position.set(x, heightAt(x, z), z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }}
    />
  );
}

// ── chess — pulsing bollards (§5) ───────────────────────────────────────

const BOLLARD_HEIGHT = 0.5;
const BOLLARD_RADIUS = 0.07;

/** One per month on the lane centreline — every month, including the zero
 *  ones: a quiet month is a slow, dim flatline (the formula below never
 *  reaches zero), not an absent bollard, which is the whole point of "a
 *  heartbeat flatlining, no legend." */
function Bollards({ c }: { c: WorldPalette }): JSX.Element {
  const geometry = useMemo(() => new THREE.CylinderGeometry(BOLLARD_RADIUS, BOLLARD_RADIUS * 1.15, BOLLARD_HEIGHT, 10), []);
  const uElapsed = useRef({ value: 0 });
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: c.line, roughness: 0.45, metalness: 0.3 });
    const probeColor = glslVec3(c.probe);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uElapsed = uElapsed.current;
      shader.vertexShader = `attribute float aPeriod;\nattribute float aIntensity;\nuniform float uElapsed;\nvarying float vPulse;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nfloat nsPhase = uElapsed * 6.28318530718 / max(aPeriod, 0.05);\nvPulse = aIntensity * (0.3 + 0.7 * (0.5 + 0.5 * sin(nsPhase)));`,
      );
      shader.fragmentShader = `varying float vPulse;\n${shader.fragmentShader}`.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vPulse * 1.6 * ${probeColor};`,
      );
    };
    mat.customProgramCacheKey = () => "night-survey-bollard";
    return mat;
  }, [c.line, c.probe]);

  useFrame((state) => {
    uElapsed.current.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh
      args={[geometry, material, MONTHS.length]}
      frustumCulled={false}
      ref={(mesh) => {
        if (!mesh) return;
        const x = laneCenterX(CHESS);
        const lane = timeline.lanes[CHESS];
        const peak = lane.peak.v || 1;
        const periods = new Float32Array(MONTHS.length);
        const intensities = new Float32Array(MONTHS.length);
        for (let i = 0; i < MONTHS.length; i++) {
          const g = Math.max(0, lane.months[MONTHS[i]] ?? 0);
          const z = monthZ(i);
          dummy.position.set(x, heightAt(x, z), z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          // §5's own formulas, verbatim: period clamp(0.25 + 2.75*(1-g/peak), 0.25, 3.0)s,
          // intensity 0.15 + 0.85*sqrt(g/peak).
          periods[i] = Math.min(3.0, Math.max(0.25, 0.25 + 2.75 * (1 - g / peak)));
          intensities[i] = 0.15 + 0.85 * Math.sqrt(g / peak);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.geometry.setAttribute("aPeriod", new THREE.InstancedBufferAttribute(periods, 1));
        mesh.geometry.setAttribute("aIntensity", new THREE.InstancedBufferAttribute(intensities, 1));
      }}
    />
  );
}

// ── writing — sodium lampposts (§5) ─────────────────────────────────────

const LAMPPOST_HEIGHT = 3.2;
const POOL_RADIUS = 1.5; // 3m warm pool, per §5

type LampInstance = { x: number; z: number };

/** One lamppost PER PUBLISHED PIECE (24 total — `timeline.lanes[writing].total`),
 *  not one per month: the doc's "lit in exactly the 24 real months" only
 *  works out to 24 when a month with several pieces (2019-06 shipped 7) gets
 *  several lampposts rather than one dimmer one. Every placement falls
 *  inside a month that actually published something, so unlit months are
 *  simply absent fixtures — no binary "lit" flag needed, unlike Bollards. */
function lampInstances(): LampInstance[] {
  const lane = timeline.lanes[WRITING];
  const laneX = laneCenterX(WRITING);
  const halfSpread = LANE_WIDTH * 0.28;
  const rand = makeRand(0xdaad);
  const out: LampInstance[] = [];
  for (let i = 0; i < MONTHS.length; i++) {
    const count = Math.max(0, lane.months[MONTHS[i]] ?? 0);
    if (count <= 0) continue;
    const z = monthZ(i);
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1; // -1..1 across the cluster
      out.push({ x: laneX + t * halfSpread, z: z + (rand() - 0.5) * MONTH_DEPTH * 0.7 });
    }
  }
  return out;
}

function buildLampGeometry(): THREE.BufferGeometry {
  const postT = 0.05;
  return mergeGeometries([
    withEmit(new THREE.CylinderGeometry(postT, postT, LAMPPOST_HEIGHT, 8).translate(0, LAMPPOST_HEIGHT / 2, 0), 0),
    withEmit(new THREE.CylinderGeometry(0.1, 0.07, 0.24, 8).translate(0, LAMPPOST_HEIGHT + 0.12, 0), 1),
  ]);
}

/** A soft radial falloff, baked once — the "3m warm pool decal" under each
 *  lamppost. Plain canvas 2D, synchronous, same discipline as
 *  terrainPlate.ts's own bake. */
function buildPoolTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Lampposts({ c }: { c: WorldPalette }): JSX.Element {
  const instances = useMemo(lampInstances, []);
  const geometry = useMemo(buildLampGeometry, []);
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: c.line, roughness: 0.55, metalness: 0.25 });
    applyEmitGate(mat, c.accent, 1.8);
    return mat;
  }, [c.line, c.accent]);
  const poolTexture = useMemo(buildPoolTexture, []);

  return (
    <>
      <instancedMesh
        args={[geometry, material, instances.length]}
        frustumCulled={false}
        ref={(mesh) => {
          if (!mesh) return;
          for (let i = 0; i < instances.length; i++) {
            const { x, z } = instances[i];
            dummy.position.set(x, heightAt(x, z), z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }}
      />
      <instancedMesh
        args={[undefined, undefined, instances.length]}
        frustumCulled={false}
        ref={(mesh) => {
          if (!mesh) return;
          for (let i = 0; i < instances.length; i++) {
            const { x, z } = instances[i];
            dummy.position.set(x, heightAt(x, z) + 0.02, z);
            dummy.rotation.set(-Math.PI / 2, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }}
      >
        <circleGeometry args={[POOL_RADIUS, 20]} />
        <meshBasicMaterial
          map={poolTexture}
          color={c.accent}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

// ── opensource — static speckle field (§5) ──────────────────────────────

const SPECKLE_SIZE = 0.12;

type SpeckleInstance = { x: number; z: number; rot: number };

/** Density proportional to monthly public contributions, absent before the
 *  same 2025-10 cutoff terrainRelief.ts's own `OPENSOURCE_FLAT_UNTIL_Z`
 *  already draws on the ground (the doc's "absent before 2025-10 then
 *  flooding" — a handful of pre-2025 months carry small nonzero counts in
 *  the raw data, but the lane's own relief treatment already treats them as
 *  noise below the visual threshold, and this field stays consistent with
 *  that rather than contradicting the ground it sits on). */
function speckleInstances(count: number): SpeckleInstance[] {
  const lane = timeline.lanes[OPENSOURCE];
  const startIdx = MONTHS.indexOf("2025-10");
  const eligible = MONTHS.map((ym, i) => ({ i, v: i >= startIdx ? Math.max(0, lane.months[ym] ?? 0) : 0 })).filter(
    (m) => m.v > 0,
  );
  const totalWeight = eligible.reduce((s, m) => s + m.v, 0);
  if (totalWeight <= 0) return [];
  const laneX = laneCenterX(OPENSOURCE);
  const halfSpread = LANE_WIDTH / 2 - 0.6;
  const rand = makeRand(0x0559ed);
  const out: SpeckleInstance[] = [];
  for (const m of eligible) {
    const n = Math.max(1, Math.round((m.v / totalWeight) * count));
    const z0 = monthZ(m.i) - MONTH_DEPTH / 2;
    for (let k = 0; k < n && out.length < count; k++) {
      out.push({ x: laneX + (rand() - 0.5) * halfSpread * 2, z: z0 + rand() * MONTH_DEPTH, rot: rand() * Math.PI });
    }
  }
  return out;
}

function OpensourceSpeckle({ c }: { c: WorldPalette }): JSX.Element {
  // §10's drop 2/3 speckle budget — deviceTier.ts is the one probe every
  // tier-aware piece of this world now reads (see its own doc comment on
  // the duplicate matchMedia checks this replaced).
  const budget = useMemo(() => tierBudget(deviceTier()).speckleCount, []);
  const instances = useMemo(() => speckleInstances(budget), [budget]);

  return (
    <instancedMesh
      args={[undefined, undefined, instances.length]}
      frustumCulled={false}
      ref={(mesh) => {
        if (!mesh) return;
        for (let i = 0; i < instances.length; i++) {
          const { x, z, rot } = instances[i];
          dummy.position.set(x, heightAt(x, z) + 0.03, z);
          dummy.rotation.set(-Math.PI / 2, 0, rot);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }}
    >
      <planeGeometry args={[SPECKLE_SIZE, SPECKLE_SIZE]} />
      <meshStandardMaterial color={c.text} emissive={c.text} emissiveIntensity={1.1} roughness={0.6} toneMapped={false} />
    </instancedMesh>
  );
}

// ── §6 — the stationing rank ─────────────────────────────────────────────

const POST_HEIGHT = 1.4;
/** 2019 Jan .. 2026 Jan — the 8 whole-year boundaries this 92-month corridor
 *  actually contains, each one landing exactly on the ground shader's own
 *  year seam (Terrain.tsx: `nsYearDepth = nsMonthDepth * 12`, seams at
 *  `z0 + k*nsYearDepth`) because both this and that read the same
 *  MONTH_DEPTH*12 spacing off the same z0. */
const YEAR_RANK_COUNT = 8;

function yearRankZ(k: number): number {
  return CITY.z0 + MONTH_DEPTH * 12 * k;
}

function buildPostGeometry(): THREE.BufferGeometry {
  const t = 0.05;
  return mergeGeometries([
    withEmit(new THREE.BoxGeometry(t, POST_HEIGHT, t).translate(0, POST_HEIGHT / 2, 0), 0),
    // Cross-brace: a short diagonal strut through the lower third.
    withEmit(new THREE.BoxGeometry(t * 0.8, t * 0.8, 0.46).rotateX(Math.PI / 4.5).translate(0, POST_HEIGHT * 0.32, 0), 0),
    withEmit(new THREE.BoxGeometry(0.13, 0.13, 0.13).translate(0, POST_HEIGHT + 0.07, 0), 1),
  ]);
}

const yearTextureCache = new Map<number, THREE.CanvasTexture | null>();

/** §6 — the year numeral, baked once. A plain canvas 2D rasterisation
 *  (`fillText`, not an `<img>` decoding an SVG data URI) so the bake is
 *  synchronous at load with no async race before first paint — the same
 *  choice terrainPlate.ts made for its own baked texture. Never a DOM node,
 *  never live, at the doc's own #e8efe9-on-#0a0d0c pairing. */
function bakeYearTexture(year: number): THREE.CanvasTexture | null {
  if (yearTextureCache.has(year)) return yearTextureCache.get(year) ?? null;
  if (typeof document === "undefined") {
    yearTextureCache.set(year, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    yearTextureCache.set(year, null);
    return null;
  }
  ctx.fillStyle = "#0a0d0c";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#e8efe9";
  ctx.font = "700 84px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(year), 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  yearTextureCache.set(year, tex);
  return tex;
}

/** Four posts per year — one at each lane's WEST berm (the lane's own west
 *  boundary x, matching Terrain.tsx's `Berms()` divider lines plus the
 *  corridor's own two outer edges) — firing as one crossing rank, plus the
 *  numeral billboarded on the work-lane post only. */
function StationingRank({ c }: { c: WorldPalette }): JSX.Element {
  const geometry = useMemo(buildPostGeometry, []);
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: c.line, roughness: 0.4, metalness: 0.7 });
    applyEmitGate(mat, c.probe, 1.6);
    return mat;
  }, [c.line, c.probe]);
  const laneBoundaryXs = useMemo(() => [0, 1, 2, 3].map((i) => -CITY.halfWidth + LANE_WIDTH * i), []);
  const total = YEAR_RANK_COUNT * laneBoundaryXs.length;
  const years = useMemo(() => Array.from({ length: YEAR_RANK_COUNT }, (_, k) => 2019 + k), []);
  const numeralTextures = useMemo(() => years.map(bakeYearTexture), [years]);

  return (
    <>
      <instancedMesh
        args={[geometry, material, total]}
        frustumCulled={false}
        ref={(mesh) => {
          if (!mesh) return;
          let idx = 0;
          for (let k = 0; k < YEAR_RANK_COUNT; k++) {
            const z = yearRankZ(k);
            for (const x of laneBoundaryXs) {
              dummy.position.set(x, heightAt(x, z), z);
              dummy.rotation.set(0, 0, 0);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              mesh.setMatrixAt(idx++, dummy.matrix);
            }
          }
          mesh.instanceMatrix.needsUpdate = true;
        }}
      />
      {years.map((year, k) => {
        const tex = numeralTextures[k];
        if (!tex) return null;
        const x = laneBoundaryXs[WORK];
        const z = yearRankZ(k);
        return (
          <Billboard key={year} position={[x, heightAt(x, z) + POST_HEIGHT + 0.55, z]}>
            <mesh>
              <planeGeometry args={[1.4, 0.7]} />
              <meshBasicMaterial map={tex} transparent toneMapped={false} />
            </mesh>
          </Billboard>
        );
      })}
    </>
  );
}

export function Fixtures(): JSX.Element {
  const c = worldPalette();
  return (
    <>
      <Gantries c={c} />
      <Bollards c={c} />
      <Lampposts c={c} />
      <OpensourceSpeckle c={c} />
      <StationingRank c={c} />
    </>
  );
}
