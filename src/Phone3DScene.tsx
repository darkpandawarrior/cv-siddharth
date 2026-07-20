import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { TextureLoader, SRGBColorSpace, MathUtils } from "three";
import type { Group, Mesh, MeshBasicMaterial, Texture } from "three";

/**
 * Real 3D hero phone: rounded device body + emissive screen cycling through
 * actual app screenshots. Pointer tilt + idle float. Loaded lazily (own
 * chunk) with the CSS TiltPhone as the non-WebGL / reduced-motion fallback.
 */

// Portrait screenshots shown on the 3D screen, one per flagship project.
// Overridable via props so App.tsx owns the curation, not this scene.
export interface PhoneShot {
  src: string;
  label: string;
}

const SCREEN_W = 1.62;
const SCREEN_H = 3.42;
const HOLD_S = 3.6; // seconds each shot stays before crossfading
const FADE_S = 0.8;

function Screen({ textures }: { textures: Texture[] }) {
  const [index, setIndex] = useState(0);
  const clock = useRef(0);
  const topMat = useRef<MeshBasicMaterial>(null);
  const next = (index + 1) % textures.length;

  useFrame((_, delta) => {
    clock.current += delta;
    const t = clock.current;
    if (!topMat.current) return;
    if (t < HOLD_S) {
      topMat.current.opacity = 1;
    } else if (t < HOLD_S + FADE_S) {
      topMat.current.opacity = 1 - (t - HOLD_S) / FADE_S;
    } else {
      clock.current = 0;
      topMat.current.opacity = 1;
      setIndex(next);
    }
  });

  return (
    // Sits just proud of the body's front face (half-depth 0.06) — anything
    // below that z is swallowed inside the RoundedBox.
    <group position={[0, 0, 0.065]}>
      {/* incoming shot sits behind; current shot fades out above it */}
      <mesh>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={textures[next]} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial ref={topMat} map={textures[index]} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Device({ shots }: { shots: PhoneShot[] }) {
  const group = useRef<Group>(null);
  const glare = useRef<Mesh>(null);
  const textures = useLoader(TextureLoader, shots.map((s) => s.src));
  useMemo(() => {
    for (const t of textures) t.colorSpace = SRGBColorSpace;
  }, [textures]);

  useFrame(({ pointer, clock }, delta) => {
    const g = group.current;
    if (!g) return;
    // Idle float + pointer-led tilt, eased so it never snaps.
    const t = clock.elapsedTime;
    const targetY = pointer.x * 0.45 - 0.35 + Math.sin(t * 0.6) * 0.05;
    const targetX = -pointer.y * 0.3 + 0.12 + Math.cos(t * 0.8) * 0.03;
    g.rotation.y = MathUtils.damp(g.rotation.y, targetY, 4, delta);
    g.rotation.x = MathUtils.damp(g.rotation.x, targetX, 4, delta);
    g.position.y = Math.sin(t * 0.9) * 0.06;
  });

  return (
    <group ref={group}>
      {/* body */}
      <RoundedBox args={[1.8, 3.68, 0.12]} radius={0.11} smoothness={4}>
        <meshStandardMaterial color="#171e1a" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      {/* screen bezel inset */}
      <mesh position={[0, 0, 0.062]}>
        <planeGeometry args={[1.68, 3.52]} />
        <meshBasicMaterial color="#05070a" />
      </mesh>
      <Screen textures={textures} />
      {/* punch-hole camera */}
      <mesh position={[0, 1.58, 0.07]}>
        <circleGeometry args={[0.035, 24]} />
        <meshBasicMaterial color="#05070a" />
      </mesh>
      {/* moving glare strip */}
      <mesh ref={glare} position={[0.3, 0.6, 0.075]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[0.35, 4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.045} />
      </mesh>
    </group>
  );
}

export default function Phone3DScene({ shots, onContextLost }: { shots: PhoneShot[]; onContextLost?: () => void }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6.1], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        // GPU evicted us (too many contexts / driver reset) → hand the hero
        // back to the CSS phone instead of showing a dead white canvas.
        gl.domElement.addEventListener("webglcontextlost", () => onContextLost?.(), { once: true });
      }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      {/* Android-green rim light off the left edge */}
      <pointLight position={[-3, 0, 2]} intensity={6} color="#3ddc84" />
      {/* Texture loading suspends INSIDE the canvas — if it suspended at the
          outer boundary the whole Canvas would unmount, three would
          force-lose the context, and the context-lost fallback would
          permanently kick us back to the CSS phone. */}
      <Suspense fallback={null}>
        <Device shots={shots} />
      </Suspense>
    </Canvas>
  );
}
