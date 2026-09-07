import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { readToken } from "./themeColor.ts";

/**
 * Split out of blueprintShared.tsx on purpose: this is the only half that
 * imports `three`/`@react-three/fiber`, and importProtection denies both from
 * the SSR bundle. blueprintShared.tsx is imported by BlueprintRoom.tsx (for
 * hasWebGL/hasTldrawLicense alone) which is reached from /blueprint's SSR
 * build, so one shared file dragged three.js into the server graph regardless
 * of which export a caller actually used. Import this module only from code
 * that is already client-only (Blueprint3D.tsx, SketchBoard.tsx).
 */

/* Hand-written fresnel rim-light shader for the hologram's outer shell — a
 * plain ShaderMaterial (not drei's shaderMaterial/extend) so no JSX intrinsic
 * needs declaring. Glows brightest at grazing angles, like a soft-sci-fi force
 * field, and pulses gently via a uTime uniform driven from useFrame. */
function useFresnelShellMaterial(color: string) {
  return useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-mvPosition.xyz);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          void main() {
            float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 2.4);
            float pulse = 0.75 + 0.25 * sin(uTime * 1.6);
            gl_FragColor = vec4(uColor * fresnel * pulse, fresnel * 0.85);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [color],
  );
}

export function HoloCore() {
  const knot = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);
  const fresnelMaterial = useFresnelShellMaterial("#5ee6ff");
  useFrame((_, delta) => {
    if (knot.current) {
      knot.current.rotation.x += delta * 0.5;
      knot.current.rotation.y += delta * 0.7;
    }
    if (shell.current) shell.current.rotation.y -= delta * 0.25;
    fresnelMaterial.uniforms.uTime.value += delta;
  });
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={10} color={readToken("--color-signal", "#3ddc84")} />
      <pointLight position={[-3, -2, 2]} intensity={8} color={readToken("--color-probe", "#5ee6ff")} />
      <mesh ref={knot}>
        <torusKnotGeometry args={[0.85, 0.26, 110, 16]} />
        <meshStandardMaterial color="#0b0f0d" emissive={readToken("--color-signal", "#3ddc84")} emissiveIntensity={0.32} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh ref={shell} material={fresnelMaterial}>
        <icosahedronGeometry args={[1.7, 1]} />
      </mesh>
    </>
  );
}
