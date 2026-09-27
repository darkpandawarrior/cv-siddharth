/**
 * Commit diyas (living-ledger-spec.md §5.5 S11; live-data-spec.md §2.2 row
 * 21): one floating diya per public push in the last 24h (capped at the
 * last 20 events, `realityRows.ts`'s own `recentPushes` filter — the same
 * window the v1 world's Lamps.tsx and the ledger's Pushes row already use,
 * M53). Set afloat "at the mouth of that repo's tributary" — near
 * `valley.ts`'s own `to` end of that stream — "or at the basin for repos
 * without a stream" (row 21's own fallback), drifting slowly downstream.
 *
 * Distinct from `valley.ts`'s `diyasLit`/`diyasDark` (the fleet-stats niche
 * count `GrammarInstances.tsx` already draws) — this lane never touches
 * that count (living-ledger-spec §5's own invariant, `valley.test.ts`
 * unchanged).
 */
import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useNowModel } from "../useNowModel.ts";
import { ledger } from "../ledger.ts";
import { sangamBasin, tributaries } from "../valley.ts";
import { recentPushes } from "../../realityRows.ts";
import { repoSlugFromFullName } from "../live/liveBinding.ts";
import { hashNoise, stringSeed } from "../hash.ts";

export const layer = { id: "commit-diyas", order: 42 };

const MOUTH_T = 0.9; // 90% of the way from the tributary's source to the basin — "at the mouth"
const FLOAT_Y = 0.15;
const JITTER_M = 2.5;
const DRIFT_MPS = 0.35; // v1 Rain.tsx-style plausible drift; matched to river.ts's own design flowSpeed floor

interface DiyaInstance {
  id: string;
  x: number;
  z: number;
  seed: number;
}

function mouthFor(slug: string, basin: { x: number; z: number }, streams: readonly ReturnType<typeof tributaries>[number][]): { x: number; z: number } {
  const stream = streams.find((s) => s.id === slug);
  if (!stream) return basin;
  return { x: stream.from.x + (stream.to.x - stream.from.x) * MOUTH_T, z: stream.from.z + (stream.to.z - stream.from.z) * MOUTH_T };
}

const dummy = new THREE.Object3D();

export default function CommitDiyas(): JSX.Element | null {
  const nowModel = useNowModel(null);
  const activity = nowModel?.raw.activity ?? null;
  const nowMs = nowModel?.raw.sky?.now.getTime() ?? null;
  const basin = useMemo(() => sangamBasin(ledger), []);
  const streams = useMemo(() => tributaries(ledger), []);

  const diyas = useMemo<DiyaInstance[]>(() => {
    if (!activity || nowMs == null) return [];
    return recentPushes(activity.items, nowMs).map((item, i) => {
      const slug = repoSlugFromFullName(item.repo);
      const mouth = mouthFor(slug, basin, streams);
      const seed = hashNoise(stringSeed(item.url || `${slug}:${i}`));
      return {
        id: item.url || `${slug}:${item.at}:${i}`,
        x: mouth.x + (seed - 0.5) * JITTER_M,
        z: mouth.z + (seed - 0.5) * JITTER_M,
        seed,
      };
    });
  }, [activity, basin, streams, nowMs]);

  const geometry = useMemo(() => new THREE.SphereGeometry(0.16, 8, 6), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2a13d", emissive: "#f2a13d", emissiveIntensity: 1.1, roughness: 0.5 }), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || diyas.length === 0) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < diyas.length; i++) {
      const d = diyas[i];
      const bob = Math.sin(t * 1.2 + d.seed * 6) * 0.03;
      dummy.position.set(d.x, FLOAT_Y + bob, d.z + (t * DRIFT_MPS) % 6 - 3);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (diyas.length === 0) return null;

  return (
    <group name="commit-diyas">
      <instancedMesh ref={meshRef} args={[geometry, material, diyas.length]} frustumCulled={false} />
    </group>
  );
}
