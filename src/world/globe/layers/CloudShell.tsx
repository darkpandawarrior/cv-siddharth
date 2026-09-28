import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { CLOUD_HEIGHT } from "./cloudMask.ts";
import { CLOUD_FRAG } from "./cloudShader.ts";
import { VERT, sunDirection } from "./sun.ts";

/** T1: 128x96, T2: 96x64, T3: absent. No new textures or drift: reduced
 * motion is respected without a second clock. EarthImagery owns/disposes
 * the borrowed textures, including its progressive resolution swap.
 * Height exaggerated to ~76 km so parallax reads at the overview scale.
 * Deliberately NOT clickable: the shell wraps the whole globe just above
 * the surface, so any pointer handler here would take every click meant
 * for a quake, a marker, a country or "what's here" underneath it. */
export default function CloudShell({ now, tier, earthRef }: { now: Date; tier: 1 | 2 | 3; earthRef?: RefObject<THREE.Mesh> }) {
  const mesh = useRef<THREE.Mesh>(null);
  // e2e seam as a plain detached-from-React DOM node (the L2 pattern):
  // drei's <Html> here would pull its shared chunk into the eager Globe
  // shell for a test attribute.
  const probe = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.dataset.cloudShell = "waiting";
    el.hidden = true;
    document.body.appendChild(el);
    probe.current = el;
    return () => {
      el.remove();
      probe.current = null;
    };
  }, []);
  const uniforms = useMemo(() => ({
    uDay: { value: null as THREE.Texture | null },
    uBase: { value: null as THREE.Texture | null },
    uSun: { value: new THREE.Vector3() },
    uReady: { value: 0 },
  }), []);
  useEffect(() => { sunDirection(now, uniforms.uSun.value); }, [now, uniforms]);
  useFrame(() => {
    const material = earthRef?.current?.material;
    const ground = material instanceof THREE.ShaderMaterial ? material.uniforms : undefined;
    const ready = tier !== 3 && ground?.uCloudReady?.value === 1;
    if (mesh.current) mesh.current.visible = ready;
    const state = ready ? "ready" : "waiting";
    const el = probe.current;
    if (el && el.dataset.cloudShell !== state) el.dataset.cloudShell = state;
    const shell = mesh.current?.material;
    if (!(shell instanceof THREE.ShaderMaterial)) return;
    shell.uniforms.uReady.value = ready ? 1 : 0;
    if (!ready || !ground) return;
    shell.uniforms.uDay.value = ground.uDay.value;
    shell.uniforms.uBase.value = ground.uBase.value;
  });
  if (tier === 3) return null;
  return (
    <mesh ref={mesh} visible={false}>
      <sphereGeometry args={[GLOBE_RADIUS * (1 + CLOUD_HEIGHT), tier === 1 ? 128 : 96, tier === 1 ? 96 : 64]} />
      <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: CLOUD_FRAG, uniforms }]} transparent depthWrite={false} />
    </mesh>
  );
}
