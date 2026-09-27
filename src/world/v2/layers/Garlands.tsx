/**
 * The v1 to v2 carry-over: artifacts become floating marigold garlands
 * (master-plan.md#M6; living-ledger-spec.md §10 conflict register C7:
 * "Artifacts become floating marigold garlands (ambient)" — resolving the
 * three-way diyas clash between commit lamps, fleet niches and this file).
 *
 * v1's `artifacts.ts` (unchanged, read-only here) is the real content: every
 * collectible is a real fact from the site's own data — a shipped project,
 * a production metric, the chess/weeb corpora — never invented flavour
 * text. This lane reuses that array wholesale rather than re-deriving a
 * second list, so the two worlds can never quietly disagree about what the
 * collectibles actually say.
 *
 * AMBIENT, not a gameplay mechanic (C7's own word): v1's pickup used a
 * per-frame distance check against `telemetry.x/z` (`World.tsx`, not owned
 * by this lane) to call `progress.ts`'s `collect(id)`. `WorldV2.tsx`/
 * `Hodi.tsx` (also not owned by this lane — see GpsLens.tsx's own doc
 * comment on why no shared hodi-position singleton exists yet) have no
 * such hook, so this file only READS `progress.ts`'s existing
 * `loadCollected()` (the same localStorage key v1 already writes) to dim
 * whichever facts a visitor has already found elsewhere, exactly as
 * `Artifacts.tsx` (v1) already renders "held" state. New pickups from
 * inside v2 are a follow-up once a lane threads a real hodi-position read
 * through; until then the garlands are honestly decorative, per C7.
 */
import { useMemo, useRef, useState, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { ARTIFACTS, type Artifact } from "../../artifacts.ts";
import { loadCollected } from "../../progress.ts";
import { worldPalette, mix } from "../../palette.ts";
import { hashNoise, stringSeed } from "../hash.ts";
import { riverX, riverWidthAtZ, valleyZ } from "../valley.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";

export const layer = { id: "garlands", order: 45 };

/** v1's boulevard spans roughly 2017 to now (city.ts's own year->z spine);
 *  the valley's is the same span at `VALLEY_SCALE`, so garlands spread the
 *  whole river the same way the boulevard's artifacts spread its whole
 *  length, rather than clustering at one end. */
const SPAN_START = valleyZ("2017-01");
const SPAN_END = valleyZ("2026-09");

type GarlandPlacement = { artifact: Artifact; x: number; z: number; phase: number };

/** Deterministic river placement — never `Math.random`, so a garland is
 *  always in the same place across reloads (the same property v1's own
 *  `place()` guarantees for the boulevard). Scattered within the river's
 *  own width at that z rather than fixed to the centreline, so a string of
 *  them reads as floating on the water rather than as beads on a wire. */
function place(artifact: Artifact, index: number, total: number): GarlandPlacement {
  const frac = total <= 1 ? 0.5 : index / (total - 1);
  const z = SPAN_START + frac * (SPAN_END - SPAN_START);
  const jitter = hashNoise(stringSeed(artifact.id));
  const x = riverX(z) + jitter * riverWidthAtZ(z) * 0.35;
  return { artifact, x, z, phase: (index * 2.39996) % (Math.PI * 2) };
}

const GARLAND_Y = 0.18; // just proud of the water surface (Hodi.tsx's own WATER_Y = 0)
const dummy = new THREE.Object3D();

export default function Garlands(): JSX.Element {
  const reducedMotion = useReducedMotion();
  const c = worldPalette();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => ARTIFACTS.map((a, i, all) => place(a, i, all.length)), []);

  // Read once per mount, not polled — a visitor's own held set only changes
  // via v1, and this world doesn't need to notice that mid-session.
  const [collected] = useState<ReadonlySet<string>>(() => new Set(loadCollected()));

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const color = new THREE.Color();
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const held = collected.has(p.artifact.id);
      const bob = reducedMotion ? 0 : Math.sin(t * (held ? 0.5 : 0.9) + p.phase) * (held ? 0.05 : 0.12);
      dummy.position.set(p.x, GARLAND_Y + bob, p.z);
      dummy.rotation.set(0, held ? p.phase : t * 0.3 + p.phase, 0);
      dummy.scale.setScalar(held ? 0.7 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(held ? mix(c.accent, c.void, 0.55) : c.accent);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (placements.length === 0) return <></>;

  return (
    <group name="garlands">
      <instancedMesh ref={meshRef} args={[undefined, undefined, placements.length]} frustumCulled={false}>
        <torusGeometry args={[0.35, 0.09, 8, 16]} />
        <meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={0.6} roughness={0.4} transparent opacity={0.92} />
      </instancedMesh>

      {/* Fact strings, accessibly — the same "hidden a11y summary" shape
          Fireflies.tsx's own hidden count div uses, one line per garland so
          a screen reader gets every fact this world's decoration otherwise
          only shows visually. */}
      <Html style={{ display: "none" }}>
        <ul aria-hidden="true" data-garlands={placements.length}>
          {placements.map((p) => (
            <li key={p.artifact.id}>
              {p.artifact.label}: {p.artifact.detail}
            </li>
          ))}
        </ul>
      </Html>
    </group>
  );
}
