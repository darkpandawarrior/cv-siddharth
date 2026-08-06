import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { SPACE_ALTITUDE } from "./craftPhysics.ts";
import { SPACE_LIFTS, THERMALS } from "./worldData.ts";
import { weeb } from "../data/weeb.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette } from "./palette.ts";

/**
 * Everything above the water line: the thermal columns, and the sky that turns
 * into space when you climb high enough.
 *
 * The thermals are the important half. They were pure physics with no
 * representation at all — invisible cylinders of upward force sitting over open
 * water. A visitor had no way to know they existed, let alone where, so the
 * entire air leg of the design was unreachable in practice even once the
 * geometry was right. A force you cannot see is not a mechanic, it is a
 * surprise.
 */

const THERMAL_RINGS = 9;

/** One updraft column, drawn as a stack of rings that rise and recycle. */
function ThermalColumn({
  position,
  radius,
  ceilingY,
}: {
  position: [number, number, number];
  radius: number;
  ceilingY: number;
}) {
  const c = worldPalette();
  const group = useRef<THREE.Group>(null);
  const offsets = useMemo(
    () => Array.from({ length: THERMAL_RINGS }, (_, i) => i / THERMAL_RINGS),
    [],
  );

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    for (let i = 0; i < g.children.length; i++) {
      const ring = g.children[i];
      // Rise, then wrap back to the base. The motion is the whole point: a
      // static stack of rings reads as decoration, a rising one reads as a
      // thing that will carry you.
      ring.position.y += delta * 7;
      if (ring.position.y > ceilingY) ring.position.y = 0;
      const t = ring.position.y / ceilingY;
      // Fade in off the water and out again near the ceiling, so the column
      // shows where its lift actually stops.
      const material = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = Math.sin(t * Math.PI) * 0.5;
      ring.scale.setScalar(0.75 + t * 0.35);
    }
  });

  return (
    <group ref={group} position={position}>
      {offsets.map((o, i) => (
        <mesh key={i} position={[0, o * ceilingY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 0.8, 0.09, 6, 28]} />
          <meshBasicMaterial color={c.probe} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Stars, faded in by altitude.
 *
 * Tied to the craft's height rather than simply always-on: at ground level this
 * world is a lit desk and a starfield would just be noise behind the skyline,
 * but the transition into it as you climb is the entire signal that somewhere
 * above the sky islands the rules change. It is the only warning a visitor gets
 * that orbit exists, so it starts well before SPACE_ALTITUDE.
 */
export function SpaceSky(): JSX.Element {
  const ref = useRef<THREE.Group>(null);
  const materials = useRef<THREE.PointsMaterial[]>([]);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min(1, Math.max(0, (telemetry.y - SPACE_ALTITUDE * 0.35) / (SPACE_ALTITUDE * 0.65)));
    if (materials.current.length === 0) {
      g.traverse((o) => {
        const m = (o as THREE.Points).material as THREE.PointsMaterial | undefined;
        if (m && "opacity" in m) materials.current.push(m);
      });
    }
    for (const m of materials.current) {
      m.transparent = true;
      m.opacity = t;
    }
    g.visible = t > 0.01;
  });

  return (
    <group ref={ref}>
      {/* One star per title in the anime log, times six. Absurd on its
          face and completely real underneath: `npm run gen:weeb` regenerates
          that number and the sky changes with it. The archive is literally
          what you are looking at up here. */}
      <Stars
        radius={220}
        depth={90}
        count={weeb.anime.total * 6}
        factor={5}
        saturation={0}
        fade
        speed={0.6}
      />
    </group>
  );
}

/**
 * The launch pad, drawn as a pulsing ring on the island's surface with a beam
 * above it. Has to look like a thing you would deliberately drive onto: the pad
 * is the only signpost that orbit exists at all, and a visitor who lands on a
 * sky island and sees nothing has reached the end of the world.
 */
function LaunchPad({ position, radius }: { position: [number, number, number]; radius: number }) {
  const c = worldPalette();
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2.4) * 0.5;
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 + pulse * 0.45;
      ring.current.scale.setScalar(1 + pulse * 0.06);
    }
    if (beam.current) {
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.05 + pulse * 0.12;
    }
  });
  return (
    <group position={[position[0], position[1] + 0.06, position[2]]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.16, 8, 40]} />
        <meshBasicMaterial color={c.alt} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={beam} position={[0, 22, 0]}>
        <cylinderGeometry args={[radius * 0.85, radius, 44, 20, 1, true]} />
        <meshBasicMaterial color={c.alt} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function LaunchPads(): JSX.Element {
  return (
    <>
      {SPACE_LIFTS.map((l, i) => (
        <LaunchPad key={i} position={l.position} radius={l.radius} />
      ))}
    </>
  );
}

export function Thermals(): JSX.Element {
  return (
    <>
      {THERMALS.map((t, i) => (
        // Anchored at SEA LEVEL, not at THERMALS[].position[1]. That y (17) is
        // documented in worldData.ts as a cosmetic "roughly the midpoint"
        // value that the physics ignores — the column itself runs from the
        // water up to ceilingY, so drawing it from y=17 would put the visible
        // rings 17m above the lift they represent.
        <ThermalColumn
          key={i}
          position={[t.position[0], 0, t.position[2]]}
          radius={t.radius}
          ceilingY={t.ceilingY}
        />
      ))}
    </>
  );
}
