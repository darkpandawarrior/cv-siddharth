/**
 * The v1 to v2 carry-over: visitors, ported off `Ghosts.tsx`'s presence
 * feed and re-drawn as floating paper lanterns (master-plan.md#M6;
 * living-ledger-spec.md §10 conflict register C6: "Fireflies = weeb.
 * Visitors = paper lanterns on the water"; `streams.ts`'s own `presence`
 * row — `form: "lantern"`, "paper lanterns per visitor, live 'here now'
 * count" — already describes exactly this file, from an earlier lane).
 *
 * v1's cart-ghost render makes no sense on a river with no road, but the
 * PRESENCE itself is the real, live thing worth carrying over — other open
 * tabs, right now, on the SAME channel `Ghosts.tsx` already publishes to
 * (`GHOST_CHANNEL`, reused verbatim: "count unchanged" is this lane's own
 * task line). Their `x`/`z` are v1's desk-world coordinates, meaningless in
 * the valley's own space (world-v2-spec's "one coordinate spine, scaled" —
 * a v1 driver and a v2 visitor are never on the same map), so this file
 * takes only the COUNT and places that many lanterns at its own
 * deterministic river positions — same posture GpsLens.tsx takes toward
 * `structures`: reuse what transfers honestly, do not fabricate what
 * doesn't.
 */
import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePresence } from "@playhtml/react";
import { Html } from "@react-three/drei";
import { GHOST_CHANNEL, type GhostPresence } from "../../Ghosts.tsx";
import { deviceTier } from "../../deviceTier.ts";
import { worldPalette } from "../../palette.ts";
import { riverX, riverWidthAtZ, valleyZ } from "../valley.ts";
import { hashNoise } from "../hash.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";

export const layer = { id: "lanterns", order: 46 };

/** Matches Ghosts.tsx's own instancing cap — the same "up to 8 other
 *  drivers" budget, now "up to 8 other visitors' lanterns". */
const MAX_LANTERNS = 8;
const LANTERN_Z = valleyZ("2023-06"); // near the Sangam, where visitors gather
const LANTERN_SPACING = 4;
const LANTERN_Y = 0.22;

declare global {
  interface Window {
    /** e2e-only seam (G10: a required gate never hits a live network).
     *  playhtml's presence document is a real shared room; its actual
     *  occupancy during a CI run is nobody's business and never
     *  deterministic — the identical reasoning `presenceGeo.ts`'s own
     *  `__GLOBE_PRESENCE_TEST__` states. `e2e/world-carryover.spec.ts` sets
     *  this before navigating; undefined in production, where the hook
     *  falls through to the real channel. */
    __LANTERN_PRESENCE_TEST__?: Record<string, GhostPresence>;
  }
}

/** Deterministic per-slot placement, floating near the Sangam rather than
 *  tied to any real (and here, meaningless) v1 x/z — never `Math.random`,
 *  so the same slot index always lands in the same spot. */
function slotPosition(index: number): { x: number; z: number } {
  const z = LANTERN_Z + (hashNoise(index * 3.7) * LANTERN_SPACING * MAX_LANTERNS) / 2;
  const x = riverX(z) + hashNoise(index * 5.1) * riverWidthAtZ(z) * 0.4;
  return { x, z };
}

const dummy = new THREE.Object3D();

/** Other visitors right now — same filter Ghosts.tsx applies to its own
 *  presences map (a peer's very first frame, before its own presence has
 *  published, has neither `x` nor `z` nor `heading` yet). Pure and exported
 *  so it is unit-testable without mounting playhtml; exercised end to end
 *  by e2e/world-carryover.spec.ts's own mocked-presence test. */
export function otherPresences(presences: ReadonlyMap<string, Partial<GhostPresence>>): string[] {
  return Array.from(presences.entries())
    .filter(([, p]) => !(p as { isMe?: boolean }).isMe && typeof p.x === "number" && typeof p.z === "number" && typeof p.heading === "number")
    .map(([key]) => key)
    .slice(0, MAX_LANTERNS);
}

export default function Lanterns(): JSX.Element {
  const reducedMotion = useReducedMotion();
  const c = worldPalette();
  const tier = useMemo(() => deviceTier(), []);
  const { presences } = usePresence<GhostPresence>(GHOST_CHANNEL);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const testOverride = typeof window !== "undefined" ? window.__LANTERN_PRESENCE_TEST__ : undefined;
  const keys = useMemo(
    () => (testOverride ? otherPresences(new Map(Object.entries(testOverride))) : otherPresences(presences)),
    [testOverride, presences],
  );

  // streams.ts's presence row: tier 2 drops the lanterns themselves and
  // keeps only the count; tier 3 drops the presence UI outright.
  const drawCount = tier === 3 ? 0 : keys.length;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || tier === 3) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < drawCount; i++) {
      const { x, z } = slotPosition(i);
      const bob = reducedMotion ? 0 : Math.sin(t * 0.7 + i * 1.7) * 0.06;
      dummy.position.set(x, LANTERN_Y + bob, z);
      dummy.rotation.set(0, i * 0.9, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = drawCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="lanterns">
      {tier !== 3 && (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_LANTERNS]} frustumCulled={false}>
          <cylinderGeometry args={[0.22, 0.22, 0.3, 8, 1, true]} />
          <meshStandardMaterial color={c.accent2} emissive={c.accent2} emissiveIntensity={0.7} side={THREE.DoubleSide} transparent opacity={0.85} />
        </instancedMesh>
      )}
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-lanterns={drawCount} data-presence-here={keys.length + 1} />
      </Html>
    </group>
  );
}
