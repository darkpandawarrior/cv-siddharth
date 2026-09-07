import { useEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import * as THREE from "three";
import { Color } from "three";
import { useFrame } from "@react-three/fiber";
import {
  employerBlocks,
  caseStudyMonuments,
  projectTowers,
  type EmployerBlock,
  type CaseStudyMonument,
  type ProjectTower,
} from "./districtWest.ts";
import { CITY } from "./city.ts";
import { resolveAttributes, applyResolveShader, triggerTimeOf } from "./resolve.ts";
import { worldPalette, dim , laneColors} from "./palette.ts";

/**
 * WEST DISTRICT'S GEOMETRY — "what he was paid for," built.
 *
 * Every number here is read off districtWest.ts, never invented in this
 * file: a taller employer block is a longer bullet list, a taller case-study
 * obelisk is a longer approach write-up, a taller project tower is a bigger
 * module count. This file's only job is turning those numbers into instanced
 * meshes, one draw call per family, and wiring each family through
 * resolve.ts's "rise" shader so nothing here exists until the visitor has
 * driven near enough to resolve it.
 *
 * Render and physics are decoupled the other way now: every family renders
 * as ONE InstancedMesh (the render-budget line — see the design doc's "west
 * flank total <= 9 draw calls"), and there is no per-structure collider here
 * at all any more. obstacles.ts derives an axis-aligned footprint for every
 * employer block, case-study monument and project tower straight off the
 * same `employerBlocks()`/`caseStudyMonuments()`/`projectTowers()` calls this
 * file renders from, and drive.ts's kinematic model collides against that
 * list directly — a collider per structure would just be a second,
 * hand-synced copy of the same footprint.
 */

const dummy = new THREE.Object3D();
const SEGMENT_HEIGHT = 0.55; // = height / modules, always — see districtWest.ts's height formula

/** Flattens a list of world-space points into the Float32Array resolve.ts's
 *  functions want. */
function flatten(points: readonly (readonly [number, number, number])[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  });
  return out;
}

/**
 * Wires one family's InstancedMesh into the shared resolve ratchet and keeps
 * it live for the rest of the session.
 *
 * `resolveAttributes()` seeds `aTriggerTime` once, from whatever's already
 * resolved at construction time (a restored session, or nothing on a first
 * visit — see resolve.ts's own comment on why `loadResolved()` has to run
 * before this). That leaves one gap: a cell that resolves WHILE this
 * component is mounted, because the visitor just drove into range, needs its
 * instances' `aTriggerTime` written after the fact.
 *
 * resolve.ts's own `updateTriggers` assumes every cell in one call shares a
 * single timestamp, because ResolveField.tsx calls it once per frame with
 * exactly the cells `stamp()` touched THAT frame. A poller like this one has
 * no such guarantee — a cell it notices on frame 40 may have actually
 * resolved on frame 12 — so it writes each instance's own `triggerTimeOf`
 * value directly rather than borrowing that helper. It only ever iterates
 * this family's own distinct cells (a handful, never the instance count),
 * and switches itself off for good once every one of them has resolved.
 */
function useRiseResolve(meshRef: RefObject<THREE.InstancedMesh | null>, cellsRef: RefObject<Int32Array | null>) {
  const settled = useRef(false);
  useFrame(() => {
    if (settled.current) return;
    const mesh = meshRef.current;
    const cells = cellsRef.current;
    if (!mesh || !cells || cells.length === 0) return;
    const attr = mesh.geometry.getAttribute("aTriggerTime") as THREE.InstancedBufferAttribute | undefined;
    if (!attr) return;

    let allResolved = true;
    let touched = false;
    const seenCells = new Set<number>();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (seenCells.has(cell)) continue;
      seenCells.add(cell);
      const t = triggerTimeOf(cell);
      if (t < 0) {
        allResolved = false;
        continue;
      }
      for (let j = 0; j < cells.length; j++) {
        if (cells[j] === cell && attr.getX(j) < 0) {
          attr.setX(j, t);
          attr.addUpdateRange(j, 1);
          touched = true;
        }
      }
    }
    if (touched) attr.needsUpdate = true;
    if (allResolved) settled.current = true;
  });
}

/** Attaches resolve.ts's three per-instance attributes to a mesh and applies
 *  the "rise" shader to its material, from nothing but the family's world
 *  positions — the one path every rise-mode family in this file goes
 *  through. */
function useRiseGeometry(meshRef: RefObject<THREE.InstancedMesh | null>, matRef: RefObject<THREE.MeshStandardMaterial | null>, targets: Float32Array) {
  const cellsRef = useRef<Int32Array | null>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const attrs = resolveAttributes(targets);
    mesh.geometry.setAttribute("aScatter", attrs.aScatter);
    mesh.geometry.setAttribute("aTarget", attrs.aTarget);
    mesh.geometry.setAttribute("aTriggerTime", attrs.aTriggerTime);
    cellsRef.current = attrs.cells;
    if (matRef.current) applyResolveShader(matRef.current, "rise");
  }, [targets, meshRef, matRef]);
  useRiseResolve(meshRef, cellsRef);
}

// ── employer blocks ─────────────────────────────────────────────────────

function EmployerShells({ blocks }: { blocks: EmployerBlock[] }): JSX.Element {
  const c = worldPalette();
  const tints = useMemo(() => laneColors(c), [c]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const targets = useMemo(
    () => flatten(blocks.map((b) => [b.x, b.height / 2 + CITY.groundY, b.zMid] as const)),
    [blocks],
  );
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < blocks.length; i++) {
      dummy.position.set(blocks[i].x, blocks[i].height / 2 + CITY.groundY, blocks[i].zMid);
      dummy.scale.set(blocks[i].width, blocks[i].height, blocks[i].span);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(tints[i % tints.length]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blocks, tints]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={matRef} color={c.surface} emissive={c.signal} emissiveIntensity={0.28} roughness={0.6} metalness={0.15} />
    </instancedMesh>
  );
}

function EmployerFloors({ blocks }: { blocks: EmployerBlock[] }): JSX.Element {
  const c = worldPalette();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const flat = useMemo(() => blocks.flatMap((b) => b.floors.map((f) => ({ b, f }))), [blocks]);
  const targets = useMemo(() => flatten(flat.map(({ b, f }) => [b.x, f.y, b.zMid] as const)), [flat]);
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < flat.length; i++) {
      const { b, f } = flat[i];
      dummy.position.set(b.x, f.y, b.zMid);
      dummy.scale.set(b.width * 0.82, FLOOR_HEIGHT * 0.7, b.span * 0.85);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // tier:1 bright, tier:2 mid, untiered dim — the résumé's own emphasis
      // levels, carried straight into the floor's light.
      const tone = f.tier === 1 ? c.signal : f.tier === 2 ? c.probe : dim(c.signal, 0.55);
      color.set(tone);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [flat, c.signal, c.probe]);

  if (flat.length === 0) return <></>;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, flat.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={matRef} color={c.card} emissiveIntensity={0.6} roughness={0.5} />
    </instancedMesh>
  );
}

const FLOOR_HEIGHT = 1.6; // districtWest.ts's own FLOOR_HEIGHT — kept in step by districtWest.test.ts

// ── case studies ────────────────────────────────────────────────────────

function CaseStudyObelisks({ monuments }: { monuments: CaseStudyMonument[] }): JSX.Element {
  const c = worldPalette();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const targets = useMemo(
    () => flatten(monuments.map((m) => [m.x, m.height / 2 + CITY.groundY, m.z] as const)),
    [monuments],
  );
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < monuments.length; i++) {
      const m = monuments[i];
      dummy.position.set(m.x, m.height / 2 + CITY.groundY, m.z);
      dummy.scale.set(1, m.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [monuments]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, monuments.length]} castShadow receiveShadow>
      {/* radiusTop < radiusBottom = a tapered obelisk, low-poly (4 sides) to
          match the desk-scale primitives the rest of this world uses. */}
      <cylinderGeometry args={[0.35, 1, 1, 4]} />
      <meshStandardMaterial ref={matRef} color={c.surface} emissive={c.accent} emissiveIntensity={0.5} roughness={0.4} metalness={0.25} flatShading />
    </instancedMesh>
  );
}

// ── project towers ──────────────────────────────────────────────────────

function ProjectTowerShafts({ towers }: { towers: ProjectTower[] }): JSX.Element {
  const c = worldPalette();
  const tints = useMemo(() => laneColors(c), [c]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const segments = useMemo(
    () => towers.flatMap((t, ti) => Array.from({ length: t.modules }, (_, si) => ({ t, ti, si }))),
    [towers],
  );
  const targets = useMemo(
    () => flatten(segments.map(({ t, si }) => [t.x, si * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2 + CITY.groundY, t.z] as const)),
    [segments],
  );
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < segments.length; i++) {
      const { t, ti, si } = segments[i];
      dummy.position.set(t.x, si * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2 + CITY.groundY, t.z);
      dummy.scale.set(t.width, SEGMENT_HEIGHT * 0.82, t.width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // An undated tower (stutter-class — see districtWest.ts) sits on a
      // dim, uncoloured plinth: the rendering of "the data has no date for
      // this," not a guess dressed up in the same bright tints as the rest.
      color.set(t.dated ? tints[ti % tints.length] : dim(c.textDim, 0.6));
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [segments, tints, c.textDim]);

  if (segments.length === 0) return <></>;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, segments.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={matRef} color={c.surface} emissiveIntensity={0.4} roughness={0.5} metalness={0.2} />
    </instancedMesh>
  );
}

function ProjectTowerCrowns({ towers }: { towers: ProjectTower[] }): JSX.Element {
  const c = worldPalette();
  const tints = useMemo(() => laneColors(c), [c]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const targets = useMemo(
    () => flatten(towers.map((t) => [t.x, t.height + 0.3 + CITY.groundY, t.z] as const)),
    [towers],
  );
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      dummy.position.set(t.x, t.height + 0.3 + CITY.groundY, t.z);
      dummy.scale.set(t.width * 1.15, 0.5, t.width * 1.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(t.dated ? tints[i % tints.length] : dim(c.textDim, 0.6));
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [towers, tints, c.textDim]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, towers.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={matRef} color={c.surface} emissiveIntensity={1.6} roughness={0.4} />
    </instancedMesh>
  );
}

/*
 * ProjectTowerLabels lived here — one drei <Html> portal per tower, always on
 * and always the same screen size, which is how "MILEWAY · 36 MODULES" (Mileway,
 * now Doori) ended up printed across the horizon from forty metres away. The names now come
 * from the world's single label layer (labels.ts), which ranges them to the
 * district you have to drive into to read them and drops any that would
 * collide with a room name.
 */

export function Monuments(): JSX.Element {
  const blocks = useMemo(() => employerBlocks(), []);
  const monuments = useMemo(() => caseStudyMonuments(), []);
  const towers = useMemo(() => projectTowers(), []);
  return (
    <>
      <EmployerShells blocks={blocks} />
      <EmployerFloors blocks={blocks} />
      <CaseStudyObelisks monuments={monuments} />
      <ProjectTowerShafts towers={towers} />
      <ProjectTowerCrowns towers={towers} />
    </>
  );
}
