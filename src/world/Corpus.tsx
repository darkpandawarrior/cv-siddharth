import { useEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import * as THREE from "three";
import { Color } from "three";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import {
  chessRidge,
  activityPlates,
  repertoirePillars,
  weebField,
  writingLessons,
  writingArchive,
  excelsiorEditionBlocks,
  excelsiorMarkMarkers,
  boardProfileMarkers,
  EDITION_FOOTPRINT,
} from "./corpusData.ts";
import { CITY } from "./city.ts";
import { resolveAttributes, applyResolveShader, triggerTimeOf } from "./resolve.ts";
import { worldPalette, dim } from "./palette.ts";

/**
 * EAST DISTRICT'S GEOMETRY — "what he made anyway," built.
 *
 * Seven families, seven InstancedMeshes, seven draw calls (the design doc's
 * own "East <= 7 draw calls" bar) — chess ridge, activity plates,
 * repertoire, weeb field, writing lessons, writing archive, and old town
 * (its three sub-families — editions, marks, profiles — share ONE mesh,
 * which is what keeps the count at 7 rather than 9).
 *
 * `InstancedFamily` below is the one abstraction in this file: every family
 * needs the exact same three steps (wire resolve.ts's "rise" attributes,
 * write a per-instance matrix, write a per-instance colour), and writing
 * that block out seven times — the way Monuments.tsx does for its three
 * families — would be six copies of the same 25 lines with different field
 * names. This earns its own generic component; a one-off family would not.
 */

const dummy = new THREE.Object3D();

function flatten(points: readonly (readonly [number, number, number])[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  });
  return out;
}

/** Identical to Monuments.tsx's own `useRiseResolve` — reimplemented rather
 *  than imported, same "no cross-import between WS3 and WS4" discipline the
 *  design doc's import-direction contract calls for. See that file's own
 *  doc comment for why this can't just reuse `updateTriggers`: a poller has
 *  no guarantee every cell it notices this frame resolved this frame. */
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

/**
 * One InstancedMesh, wired through resolve.ts's "rise" shader, from nothing
 * but a list of items and three pure functions telling it where each one
 * goes, how big, and what colour. `position`/`scale`/`color` are called once
 * per item inside an effect keyed on `items` — cheap even for 473 chess-ridge
 * instances, and never in the render loop.
 */
export function InstancedFamily<T>({
  items,
  position,
  scale,
  color,
  geometry,
  materialColor,
  emissive,
  emissiveIntensity = 0.5,
}: {
  items: readonly T[];
  position: (item: T) => readonly [number, number, number];
  scale: (item: T) => readonly [number, number, number];
  color: (item: T) => string;
  geometry: JSX.Element;
  materialColor: string;
  emissive?: string;
  emissiveIntensity?: number;
}): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const targets = useMemo(() => flatten(items.map(position)), [items, position]);
  useRiseGeometry(meshRef, matRef, targets);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const col = new Color();
    items.forEach((item, i) => {
      const [x, y, z] = position(item);
      const [sx, sy, sz] = scale(item);
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(color(item));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, position, scale, color]);

  if (items.length === 0) return <></>;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      {geometry}
      <meshStandardMaterial ref={matRef} color={materialColor} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}

const BOX = <boxGeometry args={[1, 1, 1]} />;

// ── chess ridge ──────────────────────────────────────────────────────────
// Six lanes, six tints — the design doc's own "the only structure spanning
// every year," so it gets the widest colour spread of any family here.

function ChessRidge(): JSX.Element {
  const c = worldPalette();
  const tints = useMemo(() => [c.signal, c.probe, c.alt, c.warn, c.accent, c.accent2], [c.signal, c.probe, c.alt, c.warn, c.accent, c.accent2]);
  const items = useMemo(() => chessRidge(), []);
  return (
    <InstancedFamily
      items={items}
      position={(p) => [p.x, p.y, p.z] as const}
      scale={() => [0.4, 0.4, 0.4] as const}
      color={(p) => tints[p.seriesIdx % tints.length]}
      geometry={BOX}
      materialColor={c.surface}
      emissiveIntensity={0.6}
    />
  );
}

// ── activity plates ─────────────────────────────────────────────────────

function ActivityPlates(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => activityPlates(), []);
  return (
    <InstancedFamily
      items={items}
      position={(p) => [p.x, p.height / 2 + CITY.groundY, p.z] as const}
      scale={(p) => [3, p.height, 8] as const}
      color={() => c.probe}
      geometry={BOX}
      materialColor={c.surface}
      emissive={c.probe}
      emissiveIntensity={0.4}
    />
  );
}

// ── repertoire ───────────────────────────────────────────────────────────

function Repertoire(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => repertoirePillars(), []);
  return (
    <InstancedFamily
      items={items}
      position={(p) => [p.x, p.height / 2 + CITY.groundY, p.z] as const}
      scale={(p) => [0.4, p.height, 0.4] as const}
      color={() => c.accent2}
      geometry={BOX}
      materialColor={c.surface}
      emissive={c.accent2}
      emissiveIntensity={0.5}
    />
  );
}

// ── weeb field ───────────────────────────────────────────────────────────

function WeebField(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => weebField(), []);
  const litColor = useMemo(() => c.alt, [c.alt]);
  const unlitColor = useMemo(() => dim(c.alt, 0.7), [c.alt]);
  return (
    <InstancedFamily
      items={items}
      position={(p) => [p.x, p.height / 2 + CITY.groundY, p.z] as const}
      scale={(p) => [0.35, p.height, 0.35] as const}
      color={(p) => (p.lit ? litColor : unlitColor)}
      geometry={BOX}
      materialColor={c.surface}
      emissive={litColor}
      emissiveIntensity={0.35}
    />
  );
}

// ── writing: lessons ─────────────────────────────────────────────────────

function WritingLessons(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => writingLessons(), []);
  return (
    <InstancedFamily
      items={items}
      position={(l) => [l.x, l.height / 2 + CITY.groundY, l.z] as const}
      scale={(l) => [0.4, l.height, 0.4] as const}
      color={() => c.signal}
      geometry={BOX}
      materialColor={c.surface}
      emissive={c.signal}
      emissiveIntensity={0.8}
    />
  );
}

// ── writing: archive ─────────────────────────────────────────────────────

function WritingArchive(): JSX.Element {
  const c = worldPalette();
  const dimText = useMemo(() => dim(c.textDim, 0.55), [c.textDim]);
  const items = useMemo(() => writingArchive(), []);
  return (
    <InstancedFamily
      items={items}
      position={(a) => [a.x, a.height / 2 + CITY.groundY, a.z] as const}
      scale={(a) => [1.4, a.height, 1.4] as const}
      // Uncertain-era blocks sit dim and uncoloured — the rendering of "the
      // data has no date for this," the same treatment Monuments.tsx gives
      // an undated project tower.
      color={(a) => (a.dated ? c.probe : dimText)}
      geometry={BOX}
      materialColor={c.surface}
      emissive={c.probe}
      emissiveIntensity={0.35}
    />
  );
}

// ── old town ─────────────────────────────────────────────────────────────
// Three sub-families sharing one mesh — the one deliberate exception to
// "one function per family" in this file, because splitting them would push
// the district past its 7-draw-call budget for no visual gain: they are all
// small blocks in the same 2019-2021 corner of the map.

type OldTownItem =
  | { kind: "edition"; x: number; y: number; z: number; sx: number; sy: number; sz: number }
  | { kind: "mark"; markKind: "wrote" | "about" | "credit"; x: number; y: number; z: number; sx: number; sy: number; sz: number }
  | { kind: "profile"; x: number; y: number; z: number; sx: number; sy: number; sz: number };

function oldTownItems(): OldTownItem[] {
  const editions = excelsiorEditionBlocks().map(
    (e): OldTownItem => ({ kind: "edition", x: e.x, y: e.height / 2 + CITY.groundY, z: e.z, sx: EDITION_FOOTPRINT, sy: e.height, sz: EDITION_FOOTPRINT }),
  );
  const marks = excelsiorMarkMarkers().map(
    (m): OldTownItem => ({ kind: "mark", markKind: m.kind, x: m.x, y: m.height / 2 + CITY.groundY, z: m.z, sx: 0.5, sy: m.height, sz: 0.5 }),
  );
  const profiles = boardProfileMarkers().map(
    (p): OldTownItem => ({ kind: "profile", x: p.x, y: p.height / 2 + CITY.groundY, z: p.z, sx: 0.5, sy: p.height, sz: 0.5 }),
  );
  return [...editions, ...marks, ...profiles];
}

function OldTown(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => oldTownItems(), []);
  const colorOf = useMemo(() => {
    const markKindColor: Record<"wrote" | "about" | "credit", string> = { wrote: c.signal, about: c.probe, credit: c.warn };
    return (item: OldTownItem): string => {
      if (item.kind === "edition") return c.accent2;
      if (item.kind === "profile") return c.alt;
      return markKindColor[item.markKind];
    };
  }, [c.signal, c.probe, c.warn, c.accent2, c.alt]);

  return (
    <InstancedFamily
      items={items}
      position={(i) => [i.x, i.y, i.z] as const}
      scale={(i) => [i.sx, i.sy, i.sz] as const}
      color={colorOf}
      geometry={BOX}
      materialColor={c.surface}
      emissive={c.accent2}
      emissiveIntensity={0.5}
    />
  );
}

/** Fixed colliders for old town's three editions only — the one east-flank
 *  family tall and box-shaped enough (7.75-9m) that driving straight through
 *  it would read as a bug, the same bar Monuments.tsx's shells/obelisks/
 *  towers clear and its many small floor slabs don't. Everything else here
 *  is small, thin or too numerous (176 weeb markers, 473 ridge cubes) for a
 *  per-instance collider to be worth its physics cost. */
function OldTownColliders(): JSX.Element {
  const editions = useMemo(() => excelsiorEditionBlocks(), []);
  return (
    <>
      {editions.map((e) => (
        <RigidBody key={e.year} type="fixed" colliders={false} position={[e.x, 0, e.z]}>
          <CuboidCollider args={[EDITION_FOOTPRINT / 2, e.height / 2, EDITION_FOOTPRINT / 2]} position={[0, e.height / 2 + CITY.groundY, 0]} />
        </RigidBody>
      ))}
    </>
  );
}

export function Corpus(): JSX.Element {
  return (
    <>
      <OldTownColliders />
      <ChessRidge />
      <ActivityPlates />
      <Repertoire />
      <WeebField />
      <WritingLessons />
      <WritingArchive />
      <OldTown />
    </>
  );
}
