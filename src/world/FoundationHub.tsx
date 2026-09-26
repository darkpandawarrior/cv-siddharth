import { Suspense, useMemo, type JSX } from "react";
import { Box3, Vector3 } from "three";
import { useStudioModel } from "../three/models.ts";
import { deviceTier } from "./deviceTier.ts";
import { CITY } from "./city.ts";
import { projectTowers } from "./districtWest.ts";
import { includeBuildPairs } from "../data/systemGraph.ts";
import { worldPalette } from "./palette.ts";

/**
 * THE FOUNDATION HUB — where the includeBuild roads meet.
 *
 * `includeBuildPairs` (systemGraph.ts, the same measured edges /map draws)
 * names which apps build against kmp-toolkit/kmp-build-logic. Every one of
 * those apps already has a real tower (districtWest.ts's `projectTowers()`),
 * so the hub's position is their centroid — derived off the same registry
 * every other West District structure reads, never a picked point. That is
 * "the intersection of the includeBuild roads": the one spot equidistant
 * (on average) from every tower that actually depends on the foundation.
 *
 * kmp-toolkit/kmp-build-logic/kmp-app-template have no tower of their own
 * (they are the "foundation" stats blurb on the homepage, not a
 * `profile.projects` entry with a shipped surface) — this keystone is their
 * only representation in the drivable world.
 */

const KEYSTONE_TARGET_HEIGHT = 1.8; // comparable to a case-study obelisk (CASE_STUDY_RADIUS-scale), not a tower

function hubPosition(): [number, number, number] {
  const towers = projectTowers();
  const towerBySlug = new Map(towers.map((t) => [t.slug, t] as const));
  // The apps on the "from" side of an includeBuild edge into the foundation
  // — dedup because doori/gaddi/paymentslab-kmp/candidai each carry two
  // edges (kmp-build-logic and kmp-toolkit).
  const appSlugs = new Set(
    includeBuildPairs
      .filter(([, to]) => to === "kmp-build-logic" || to === "kmp-toolkit")
      .map(([from]) => from)
      .filter((slug) => towerBySlug.has(slug)),
  );
  const hubTowers = [...appSlugs].map((slug) => towerBySlug.get(slug)!);
  if (hubTowers.length === 0) return [0, CITY.groundY, 0]; // never happens once systemGraph.test.ts's coverage assertion is green
  const x = hubTowers.reduce((n, t) => n + t.x, 0) / hubTowers.length;
  const z = hubTowers.reduce((n, t) => n + t.z, 0) / hubTowers.length;
  return [x, CITY.groundY, z];
}

/** Brushed-titanium-with-amber-inlay keystone, scaled to a fixed on-screen
 *  height off its own measured bounding box — the asset's authored scale is
 *  Blender-script-internal and not a number this file should assume. */
function GlbKeystone(): JSX.Element {
  const { scene } = useStudioModel("kmp-foundation-keystone");
  const scale = useMemo(() => {
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    const h = size.y || 1;
    return KEYSTONE_TARGET_HEIGHT / h;
  }, [scene]);
  return <primitive object={scene} scale={scale} />;
}

/** deviceTier 3 (throttled) fallback — the same low-poly primitive family
 *  Monuments.tsx's own case-study obelisks use, so a keystone that can't
 *  afford the GLB still reads as "a monument," not as a missing object. */
function PrimitiveKeystone(): JSX.Element {
  const c = worldPalette();
  return (
    <mesh castShadow receiveShadow position={[0, KEYSTONE_TARGET_HEIGHT / 2, 0]}>
      <cylinderGeometry args={[0.3, 0.55, KEYSTONE_TARGET_HEIGHT, 4]} />
      <meshStandardMaterial color={c.surface} emissive={c.accent} emissiveIntensity={0.5} roughness={0.4} metalness={0.3} flatShading />
    </mesh>
  );
}

export function FoundationHub(): JSX.Element {
  const position = useMemo(() => hubPosition(), []);
  const tier = deviceTier();
  return (
    <group position={position}>
      {tier === 3 ? (
        <PrimitiveKeystone />
      ) : (
        <Suspense fallback={<PrimitiveKeystone />}>
          <GlbKeystone />
        </Suspense>
      )}
    </group>
  );
}
