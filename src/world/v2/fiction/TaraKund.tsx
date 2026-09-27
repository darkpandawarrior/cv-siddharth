/**
 * Tara Kund, the Morkinstar observatory, fenced (this lane's own task
 * list; world-v2-spec.md#5 row 19; world-v2-spec.md §5.19; idea-atlas
 * FENCE-1; living-ledger-spec.md §5.3's "Fence"). Sits in its own gorge
 * behind the east ridge, "seen from the Sangam only as a pale spire", the
 * structure itself is built here; `ObservatorySensor.tsx` is the one door
 * in (a hard-coded room sensor to `/anthology`), and `Observatory.tsx`
 * (`src/world/v2/layers/`) is what actually mounts this subtree into the
 * canvas.
 *
 * Palette: moon-white (`worldPalette().text`) and deep ground
 * (`worldPalette().void`/`.ink`) ONLY, never amber, cyan or green, because
 * those three carry a claim in this world (§0 rule 3) and fiction makes
 * none. `worldPalette()` itself is not on `fictionFence.test.ts`'s
 * forbidden list (only `data/profile`, `destinations.ts`, `storyMap.ts`,
 * `lib/sky.ts`, `lib/stars.ts` and `public/sky` are), so reusing the site's
 * own colour tokens here is safe.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { fictionStars, TIER_COUNT } from "./fictionSky.ts";
import { useReveal } from "../reveal.ts";
import { worldPalette } from "../../palette.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { anthology } from "../../../data/anthology.ts";

const TIER_BASE_RADIUS = 6;
const TIER_HEIGHT = 2.4;
const STAR_GEOMETRY = new THREE.SphereGeometry(0.05, 5, 5);
const dummy = new THREE.Object3D();

/** One stacked ring per season, `TIER_COUNT` (`anthology.seasons.length`),
 *  radius shrinking toward the top so it reads as a spire, not a stack of
 *  identical drums. */
function Tiers({ moonWhite, ground }: { moonWhite: string; ground: string }) {
  const tiers = useMemo(
    () => Array.from({ length: TIER_COUNT }, (_, i) => ({ i, radius: TIER_BASE_RADIUS * (1 - i / (TIER_COUNT + 1)), y: i * TIER_HEIGHT })),
    [],
  );
  return (
    <group name="tara-kund-tiers">
      {/* The plinth: deep ground, the same "unlit until it means something"
          base every other landmark in this world sits on. */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <cylinderGeometry args={[TIER_BASE_RADIUS + 1, TIER_BASE_RADIUS + 1.4, 1, 24]} />
        <meshStandardMaterial color={ground} roughness={0.9} />
      </mesh>
      {tiers.map((t) => (
        <mesh key={t.i} position={[0, t.y, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[t.radius, t.radius + 0.4, TIER_HEIGHT * 0.94, 24]} />
          <meshStandardMaterial color={moonWhite} roughness={0.5} />
        </mesh>
      ))}
      {/* The spire tip above the last tier. */}
      <mesh position={[0, TIER_COUNT * TIER_HEIGHT + 0.6, 0]} castShadow>
        <coneGeometry args={[TIER_BASE_RADIUS * 0.15, 1.4, 12]} />
        <meshStandardMaterial color={moonWhite} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** The gorge's own fictional starfield (`fictionSky.ts`), never the real
 *  Pune sky (`Stars.tsx`/`lib/stars.ts`), each point moon-white, dimmed for
 *  a world the Directory records as `ruin`. */
function FictionStars({ moonWhite, opacity }: { moonWhite: string; opacity: number }) {
  const stars = useMemo(() => fictionStars(), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => STAR_GEOMETRY.clone(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: moonWhite, transparent: true, toneMapped: false }),
    [moonWhite],
  );
  useEffect(() => () => material.dispose(), [material]);
  material.opacity = opacity;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    stars.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.setScalar(s.lit ? 1 : 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [stars]);

  if (stars.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, stars.length]} frustumCulled={false} />;
}

export function TaraKund() {
  const palette = worldPalette();
  const reducedMotion = useReducedMotion();
  const [opacity, setOpacity] = useState(0);
  useReveal(true, reducedMotion, setOpacity);

  return (
    <group name="tara-kund-observatory">
      <Tiers moonWhite={palette.text} ground={palette.void} />
      <FictionStars moonWhite={palette.text} opacity={opacity} />
      {/* A three.js Object3D carries no DOM attributes of its own
          (GrammarInstances.tsx's own doc comment states the same reason for
          ITS DOM mirror), this hidden span is what e2e/world-fiction.spec.ts
          reads instead of a WebGL pixel. */}
      <Html style={{ display: "none" }}>
        <span aria-hidden="true" data-observatory="tara-kund" data-tiers={TIER_COUNT} data-title={anthology.slug} />
      </Html>
    </group>
  );
}

export default TaraKund;
