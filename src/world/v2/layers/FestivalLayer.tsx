/**
 * The festival calendar's four ambient forms (live-data-spec.md §2.2 row 15,
 * master-plan.md#M16): rangoli decal (Diwali), mango-leaf toran
 * (Ganeshotsav), paper kites in paper tints — never amber (Makar Sankranti),
 * a gudi (Gudi Padwa). Reads `skyCalendar.ts`'s `activeFestival` (through
 * `nightSky.ts`'s `activeFestivalForm`, this lane's own row-15 mapping) and
 * draws exactly one of the four; nothing at all once the calendar's own
 * `validUntil` has passed, or before/after the active span.
 *
 * `festival-kit.glb` (P2-07b) names these same four nodes as its own look-
 * dev target (G11) — this layer draws primitive geometry at runtime, the
 * SAME posture `kits/architecture.ts`'s own doc comment states for every
 * other named kit ("the Blender kit is the look-dev target, not something
 * the runtime parses today").
 *
 * Separate `InstancedMesh`/mesh groups of its own, never mounted inside — or
 * reading a position from — `LandmarksRecords.tsx`'s deepmal/fleet scene
 * graph: "festival meshes never touch data meshes" (M16), so a Diwali
 * fixture cannot change the deepmal lit count (`data-deepmal-lit`, that
 * file's own attribute, untouched here).
 */
import { useEffect, useMemo, useRef, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useNowModel } from "../useNowModel.ts";
import { deviceTier } from "../../deviceTier.ts";
import { worldPalette } from "../../palette.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { sangamBasin, CENTER, BOUNDS } from "../valley.ts";
import { activeFestivalForm, type FestivalForm } from "../live/nightSky.ts";

export const layer = { id: "festival", order: 43 };

function useCanvasDataAttrs(attrs: Readonly<Record<string, string>>): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v);
  }, [gl, attrs]);
}

// Fixed, deterministic anchors reusing the valley's own layout constants
// (never a hand-placed magic coordinate untethered from the world): the
// Sangam basin doubles as "the ghat landing", `CENTER` as a room chhatri's
// footprint, and the east half of the bounded play area as "the east
// meadow" (kites fly clear of the basin and the boulevard).
// ponytail: these are this lane's own reasonable stand-ins, not a real
// per-chhatri anchor list — retarget to `districtAnchors()`/a real chhatri
// roster the day a lane threads one through.
function ghatLandingAnchor(): THREE.Vector3 {
  const basin = sangamBasin();
  return new THREE.Vector3(basin.x, 0.3, basin.z - basin.r * 0.6);
}
function roomChhatriAnchor(): THREE.Vector3 {
  return new THREE.Vector3(CENTER.x + 18, 7.5, CENTER.z);
}
function eastMeadowAnchor(): THREE.Vector3 {
  return new THREE.Vector3(BOUNDS.xMax * 0.55, 0, CENTER.z - 40);
}

function RangoliDecal(): JSX.Element {
  const c = worldPalette();
  const pos = ghatLandingAnchor();
  const rings: readonly [number, number, string][] = [
    [0, 1.6, c.probe],
    [1.7, 2.6, c.alt],
    [2.7, 3.4, c.signalDim],
  ];
  return (
    <group name="festival-rangoli" position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map(([inner, outer, color], i) => (
        <mesh key={i}>
          <ringGeometry args={[inner, outer, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ToranGarland(): JSX.Element {
  const c = worldPalette();
  const reducedMotion = useReducedMotion();
  const groupRef = useRef<THREE.Group>(null);
  const anchor = roomChhatriAnchor();
  const leafCount = 9;
  const span = 5;

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    g.rotation.z = Math.sin(t * 0.6) * 0.03;
  });

  return (
    <group ref={groupRef} name="festival-toran" position={anchor}>
      {Array.from({ length: leafCount }, (_, i) => {
        const x = (i / (leafCount - 1) - 0.5) * span;
        const droop = Math.cos((x / span) * Math.PI) * -0.35;
        return (
          <mesh key={i} position={[x, droop, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.22, 0.4, 3]} />
            <meshStandardMaterial color={c.signal} roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

function PaperKite(): JSX.Element {
  const reducedMotion = useReducedMotion();
  const groupRef = useRef<THREE.Group>(null);
  const anchor = eastMeadowAnchor();
  const c = worldPalette();
  // Paper tints — never amber (M16): cycles the non-amber palette tokens.
  const tints = [c.probe, c.alt, c.signalDim, c.text];
  const count = 10;
  const kites = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i - count / 2) * 6 + ((i * 37) % 5),
        y: 18 + ((i * 53) % 20),
        z: ((i * 29) % 14) - 7,
        phase: i * 0.9,
        color: tints[i % tints.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    g.children.forEach((child, i) => {
      child.position.y = kites[i].y + Math.sin(t * 0.4 + kites[i].phase) * 1.2;
      child.rotation.z = Math.sin(t * 0.3 + kites[i].phase) * 0.2;
    });
  });

  return (
    <group ref={groupRef} name="festival-kites" position={anchor}>
      {kites.map((k, i) => (
        <mesh key={i} position={[k.x, k.y, k.z]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[1.4, 1.4]} />
          <meshStandardMaterial color={k.color} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Gudi(): JSX.Element {
  const c = worldPalette();
  const anchor = roomChhatriAnchor();
  return (
    <group name="festival-gudi" position={anchor}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 3, 8]} />
        <meshStandardMaterial color={c.card} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.35, 2.8, 0]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshStandardMaterial color={c.probe} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.05, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={c.text} roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

const FORM_COMPONENT: Readonly<Record<FestivalForm["node"], () => JSX.Element>> = {
  RangoliDecal,
  ToranGarland,
  PaperKite,
  Gudi,
};

export default function FestivalLayer(): JSX.Element | null {
  const nowModel = useNowModel(null);
  const tier = deviceTier();
  const at = nowModel?.raw.sky?.now ?? null;

  const form = at ? activeFestivalForm(at) : null;
  // "Tier 3. ... No festival instances." (live-data-spec §2.3).
  const drawn = tier !== 3 ? form : null;

  useCanvasDataAttrs(useMemo(() => ({ "live-festival": form?.slug ?? "none" }), [form?.slug]));

  if (!drawn) return null;
  const Form = FORM_COMPONENT[drawn.node];
  return (
    <group name="festival-layer">
      <Form />
    </group>
  );
}
