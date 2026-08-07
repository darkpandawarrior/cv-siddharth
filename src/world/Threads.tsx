import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import { facetThreads, THREAD_MARKER_HEIGHT, type FacetThread } from "./threads.ts";
import { CITY } from "./city.ts";
import { InstancedFamily } from "./Corpus.tsx";
import { cellKey, triggerTimeOf, RESOLVE_DURATION } from "./resolve.ts";
import { worldPalette } from "./palette.ts";

/**
 * THE AUTHORED/DISCOVERED THREADS, drawn.
 *
 * Every one of the 8 facets gets a pillar (accent, the past channel) and a
 * ring (probe, the now channel) at x=0 — directly over the boulevard. For
 * the 6 with `authored === discovered` those two sit on top of each other:
 * "nothing was recovered, so nothing else is drawn," per the design doc.
 * For the 2 with a real gap (`excelsior`, `board`) a lit tube arcs between
 * them, reaching an apex tall enough that `board` — the biggest gap in the
 * data — is the tallest single thing in the city.
 *
 * Draw calls: 1 InstancedMesh for all 8 pillars, 1 for all 8 rings, 1 mesh
 * per arc (2) = 4 total, comfortably under the design doc's "threads <= 6".
 *
 * The pillars sit ON the boulevard by the design's own explicit instruction
 * ("x = 0 — directly over the boulevard... the only overhead geometry above
 * the road") — which is why, unlike every solid thing Monuments.tsx and
 * Corpus.tsx put a RigidBody around, these get NO collider. A physics wall
 * planted in the one lane every visitor has to drive down would violate the
 * boulevard's own "nothing solid is ever built here" rule two files over;
 * these are the one deliberate exception to "solid", not to "empty".
 */

const PILLAR_BOX = <boxGeometry args={[1, 1, 1]} />;
const RING_TORUS = <torusGeometry args={[0.55, 0.12, 8, 20]} />;

function ThreadPillars(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => facetThreads(), []);
  return (
    <InstancedFamily
      items={items}
      position={(t) => [0, THREAD_MARKER_HEIGHT / 2 + CITY.groundY, t.authoredZ] as const}
      scale={() => [0.5, THREAD_MARKER_HEIGHT, 0.5] as const}
      color={() => c.accent}
      geometry={PILLAR_BOX}
      materialColor={c.surface}
      emissive={c.accent}
      emissiveIntensity={0.55}
    />
  );
}

function ThreadRings(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => facetThreads(), []);
  return (
    <InstancedFamily
      items={items}
      position={(t) => [0, THREAD_MARKER_HEIGHT * 0.8 + CITY.groundY, t.discoveredZ] as const}
      scale={() => [1, 1, 1] as const}
      color={() => c.probe}
      geometry={RING_TORUS}
      materialColor={c.surface}
      emissive={c.probe}
      emissiveIntensity={0.75}
    />
  );
}

/**
 * One tube per arced facet — never instanced (each has its own unique
 * curve), so this can't go through resolve.ts's InstancedBufferAttribute
 * pipeline the way every other family in this world does. It gets the same
 * OUTCOME (invisible until the visitor has driven near it, then eases in)
 * through a simpler, non-instanced route: read `triggerTimeOf` for the cell
 * under the arc's own midpoint directly, and fade the mesh's opacity over
 * the same RESOLVE_DURATION every other family uses. This is a deliberately
 * smaller mechanism than the shared shader, not a second copy of it — the
 * two-mesh scale here doesn't justify building a whole
 * InstancedBufferGeometry-of-one just to reuse the exact same code path.
 */
function ThreadArcTube({ thread }: { thread: FacetThread }): JSX.Element {
  const c = worldPalette();
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const cell = useMemo(() => cellKey(0, (thread.authoredZ + thread.discoveredZ) / 2), [thread]);

  // Colour ramps accent -> probe along the tube's own path fraction —
  // TubeGeometry already writes that fraction into `uv.x` per vertex, so
  // this reads it back rather than re-deriving arc length by hand.
  const geometry = useMemo(() => {
    const mid = (thread.authoredZ + thread.discoveredZ) / 2;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, THREAD_MARKER_HEIGHT, thread.authoredZ),
      new THREE.Vector3(0, thread.apexY, mid),
      new THREE.Vector3(0, THREAD_MARKER_HEIGHT, thread.discoveredZ),
    );
    const geo = new THREE.TubeGeometry(curve, 64, 0.35, 8, false);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    const colors = new Float32Array(uv.count * 3);
    const from = new THREE.Color(c.accent);
    const to = new THREE.Color(c.probe);
    const mixed = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      mixed.copy(from).lerp(to, uv.getX(i));
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- c.accent/c.probe are read once at geometry build time, not tracked reactively (same call-time-resolution contract as every other worldPalette() read in this world)
  }, [thread]);

  useFrame((state) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const triggeredAt = triggerTimeOf(cell);
    const prog = triggeredAt < 0 ? 0 : Math.min(1, (state.clock.elapsedTime - triggeredAt) / RESOLVE_DURATION);
    mesh.visible = prog > 0;
    mat.opacity = prog;
    // A slow emissive pulse standing in for the design doc's animated
    // map-offset dash texture: the same "the flow reads as alive" goal for a
    // fraction of the code — a moving stripe texture needs a canvas asset
    // generated at runtime, wrapped and offset every frame, for an effect
    // that's barely legible on a 0.35-radius tube from driving height.
    mat.emissiveIntensity = 0.55 + Math.sin(state.clock.elapsedTime * 1.4 + thread.authoredZ) * 0.15;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} visible={false} castShadow>
      <meshStandardMaterial ref={matRef} vertexColors transparent opacity={0} emissive={c.probe} emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
    </mesh>
  );
}

export function Threads(): JSX.Element {
  const arcs = useMemo(() => facetThreads().filter((t) => t.hasArc), []);
  return (
    <>
      <ThreadPillars />
      <ThreadRings />
      {arcs.map((thread) => (
        <ThreadArcTube key={thread.id} thread={thread} />
      ))}
    </>
  );
}
