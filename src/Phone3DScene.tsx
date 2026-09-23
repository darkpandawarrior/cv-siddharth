import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SceneActivity } from "./SceneActivity.tsx";
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { TextureLoader, SRGBColorSpace, MathUtils } from "three";
import type { Group, Texture } from "three";
import { readToken } from "./themeColor";

export interface PhoneShot { src: string; label: string }
function asSRGB(texture: Texture) { texture.colorSpace = SRGBColorSpace; return texture; }

function Screen({ src }: { src: string }) {
  const texture = useLoader(TextureLoader, src);
  const map = useMemo(() => asSRGB(texture), [texture]);
  return <mesh position={[0, 0, .147]}>
    <planeGeometry args={[1.62, 3.42]} />
    <meshBasicMaterial map={map} toneMapped={false} />
  </mesh>;
}

function Orbit() {
  const { scene } = useLoader(GLTFLoader, "/models/studio-orbit.glb");
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += Math.min(delta, .05) * .065;
  });
  return <group ref={group} position={[0, 0, -1.5]} rotation={[.15, 0, .3]} scale={.94}>
    <primitive object={scene} />
  </group>;
}

function Device({ shot }: { shot: PhoneShot }) {
  const group = useRef<Group>(null);
  useFrame(({ pointer, clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = MathUtils.damp(g.rotation.y, pointer.x * .28 - .25, 4, delta);
    g.rotation.x = MathUtils.damp(g.rotation.x, -pointer.y * .15 + .08, 4, delta);
    g.rotation.z = -.07 + Math.sin(t * .35) * .018;
    g.position.y = Math.sin(t * .65) * .07;
  });
  return <group ref={group}>
    <RoundedBox args={[1.83, 3.71, .23]} radius={.105} smoothness={6}>
      <meshStandardMaterial color="#76827e" metalness={.9} roughness={.25} />
    </RoundedBox>
    <RoundedBox args={[1.76, 3.64, .07]} radius={.1} smoothness={6} position={[0, 0, .102]}>
      <meshPhysicalMaterial color="#080e0d" metalness={.25} roughness={.12} clearcoat={1} />
    </RoundedBox>
    <Suspense fallback={null}><Screen src={shot.src} /></Suspense>
    <mesh position={[0, 1.58, .15]}>
      <circleGeometry args={[.037, 32]} /><meshBasicMaterial color="#030706" />
    </mesh>
    <RoundedBox args={[.055, .38, .07]} radius={.018} smoothness={3} position={[.923, .6, 0]}>
      <meshStandardMaterial color="#b7c4bd" metalness={.85} roughness={.2} />
    </RoundedBox>
    <RoundedBox args={[.055, .57, .07]} radius={.018} smoothness={3} position={[-.923, .72, 0]}>
      <meshStandardMaterial color="#b7c4bd" metalness={.85} roughness={.2} />
    </RoundedBox>
  </group>;
}

export default function Phone3DScene({ shot, onContextLost }: { shot: PhoneShot; onContextLost?: () => void }) {
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, .05, 7.5], fov: 40 }}
    gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    style={{ position: "absolute", inset: 0 }}
    onCreated={({ gl }) => {
      gl.domElement.addEventListener("webglcontextlost", () => onContextLost?.(), { once: true });
    }}>
    <SceneActivity />
    <hemisphereLight args={["#d8f4e7", "#162b23", 1.5]} />
    <directionalLight position={[3, 4, 5]} intensity={2.4} color="#fff2df" />
    <pointLight position={[-3, 0, 2]} intensity={9} color={readToken("--color-signal", "#3ddc84")} />
    <Environment resolution={128}>
      <Lightformer intensity={3} position={[-3, 2, 4]} scale={[2, 5, 1]} />
      <Lightformer intensity={2} position={[3, 1, 2]} scale={[1, 4, 1]} color="#f2a13d" />
      <Lightformer intensity={2} position={[0, 4, -2]} scale={[5, 1, 1]} color="#bdebdc" />
    </Environment>
    <Suspense fallback={null}><Orbit /></Suspense>
    <Device shot={shot} />
  </Canvas>;
}
