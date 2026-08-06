import { useMemo, type JSX } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import { projectStats } from "../data/projectStats.ts";
import { TERRAIN } from "./worldData.ts";
import { worldPalette } from "./palette.ts";

/**
 * The skyline IS the data.
 *
 * One tower per repo in projectStats.ts, and its height is that repo's module
 * count — Mileway's 36 modules genuinely stand more than twice as tall as
 * Kursi's 13, because the number IS the geometry. Stack depth is drawn as
 * stacked segments, one per module, so a visitor can count them if they want
 * to, and the width comes from the screenshot count.
 *
 * This is the difference between a 3D portfolio and a portfolio-shaped 3D
 * scene. Nothing here is authored: `npm run gen:stats` re-reads each app's
 * settings.gradle.kts and Room schema over the network, and the next time this
 * page loads, the skyline is different. The world is a rendering of the work,
 * so it cannot drift from it — the failure mode where the pretty version and
 * the true version disagree is designed out rather than policed.
 *
 * Solid colliders, so they are also the only obstacles on the mainland worth
 * driving around.
 */

// 0.26, down from 0.55. Height still IS the module count — that is the whole
// point of these — but at 0.55 Mileway's 36 modules made a 20m tower next to a
// 1.9m car, which from the driver's seat is a featureless wall filling the
// screen rather than a landmark. Halved, the tallest is ~9m: readable as a
// skyline from across the map, passable without the world disappearing.
const SEGMENT_HEIGHT = 0.26;

/** Shared scratch for writing instance matrices — never rendered itself. */
const dummy = new THREE.Object3D();


type Tower = {
  slug: string;
  modules: number;
  screenshots: number;
  tint: string;
  x: number;
  z: number;
};

// Tints come from the theme, resolved when the component renders — a
// module-scope TINTS array would freeze the boot palette (see palette.ts).
function towers(tints: string[]): Tower[] {
  const entries = Object.entries(projectStats);
  return entries.map(([slug, stat], i) => {
    const modules = "modules" in stat ? stat.modules : 8;
    const screenshots = "screenshots" in stat ? stat.screenshots : 20;
    // FLANKING the drive south, alternating sides — not lined up along the
    // north edge, which is where they were first put and which is directly
    // BEHIND the camera at spawn (the craft faces +Z, and the whole course
    // runs south). A skyline you have to turn around to notice is a skyline
    // nobody sees.
    const side = i % 2 === 0 ? -1 : 1;
    const depth = TERRAIN.mainland.z1 - TERRAIN.mainland.z0;
    return {
      slug,
      modules,
      screenshots,
      tint: tints[i % tints.length],
      x: side * (TERRAIN.mainland.halfWidth - 4.5),
      // Staggered down the length of the mainland so they pass by as you drive
      // rather than arriving all at once.
      z: TERRAIN.mainland.z0 + depth * (0.3 + Math.floor(i / 2) * 0.28),
    };
  });
}

function Tower({ tower }: { tower: Tower }) {
  const c = worldPalette();
  const segments = useMemo(
    () => Array.from({ length: tower.modules }, (_, i) => i),
    [tower.modules],
  );
  // Screenshot count sets the footprint. Clamped: paymentslab's 26 and
  // mileway's 159 would otherwise differ by 6x and one tower would swallow the
  // map, so the mapping is deliberately compressive rather than linear.
  const width = 1.1 + Math.min(1.6, tower.screenshots / 110);
  const height = tower.modules * SEGMENT_HEIGHT;

  return (
    <RigidBody type="fixed" colliders="cuboid" position={[tower.x, TERRAIN.mainland.groundY, tower.z]}>
      {/* The shaft is ONE instanced mesh, not one mesh per module. Mileway has
          36 modules and three towers came to 64 separate meshes, each with its
          own geometry and material — a measurable slice of the ~2s this scene
          added to first paint. The count is still literally the module count;
          it is just drawn in a single call. */}
      <instancedMesh
        ref={(mesh) => {
          if (!mesh) return;
          for (let i = 0; i < segments.length; i++) {
            dummy.position.set(0, i * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2, 0);
            dummy.scale.set(width, SEGMENT_HEIGHT * 0.82, width);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }}
        args={[undefined, undefined, segments.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={c.surface} emissive={tower.tint} emissiveIntensity={0.4} roughness={0.5} metalness={0.2} />
      </instancedMesh>
      {/* The lit crown, as one small separate box — this is what bloom picks
          up, and keeping it separate is why the shaft can stay a single
          uniform instanced material. */}
      <mesh position={[0, height + 0.3, 0]} castShadow>
        <boxGeometry args={[width * 1.15, 0.5, width * 1.15]} />
        <meshStandardMaterial color={c.surface} emissive={tower.tint} emissiveIntensity={1.8} roughness={0.4} />
      </mesh>
      {/* <Html>, not drei's <Text>. Text renders through troika, which builds
          an SDF font atlas on first use — a visible chunk of the world's
          startup cost for three labels, and Pavilions already pays for the
          <Html> path anyway. Same reasoning as that file's label comment. */}
      <Html center position={[0, height + 1.1, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <span
          className="whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest backdrop-blur"
          style={{ borderColor: `${tower.tint}55`, color: tower.tint, background: "rgba(10,13,12,0.65)" }}
        >
          {`${tower.slug} · ${tower.modules} modules`}
        </span>
      </Html>
    </RigidBody>
  );
}

export function Monuments(): JSX.Element {
  const c = worldPalette();
  const all = useMemo(() => towers([c.signal, c.probe, c.alt, c.warn]), [c.signal, c.probe, c.alt, c.warn]);
  return (
    <>
      {all.map((t) => (
        <Tower key={t.slug} tower={t} />
      ))}
    </>
  );
}
