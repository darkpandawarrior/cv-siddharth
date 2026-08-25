import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { readToken } from "./themeColor";

/* Bits shared between the 2D tldraw sketch board (BlueprintRoom.tsx) and the
 * 3D fly-through scene (Blueprint3D.tsx): the WebGL probe, the count-up
 * number animation, the spinning hologram mesh, and a small crash boundary.
 * Kept in their own module so neither view has to import from the other. */

/* Cheap one-shot WebGL capability probe. Three.js content only mounts a
 * <Canvas> when this passes — otherwise callers show a static fallback, so a
 * machine without WebGL (or one that's exhausted its context budget after
 * repeated visits) never blanks the whole page. */
let webglOK: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglOK !== null) return webglOK;
  try {
    const c = document.createElement("canvas");
    webglOK = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglOK = false;
  }
  return webglOK;
}

/* The sketch board's equivalent of the WebGL probe: can tldraw actually run on
 * this host? Since v4.0.0 tldraw hard-gates production use — with no license
 * key its LicenseProvider renders the editor for exactly 5 seconds and then
 * swaps the whole thing for a hidden <div data-testid="tl-license-expired">.
 * That is the "sketch canvas goes blank after a few seconds" report: not a
 * camera drift, not a lost context, a licence gate. localhost is exempt (same
 * host check tldraw's own LicenseManager uses), which is why dev, preview and
 * CI never saw it. So we only offer Sketch where it will survive; drop a key
 * in VITE_TLDRAW_LICENSE_KEY and the mode comes back everywhere. */
/**
 * The expiry baked into a tldraw key, or null if the string is not one.
 *
 * Keys look like `tldraw-YYYY-MM-DD/payload.signature`, and that date is the
 * whole point: an EXPIRED key is worse than no key at all. With no key,
 * hasTldrawLicense() returns false on an https host and Sketch mode is never
 * offered, so a visitor sees Fly and ASCII and nothing is broken. With an
 * expired key the gate below used to return true on the mere presence of a
 * string, so the site advertised a mode that tldraw's own LicenseManager then
 * refused: the editor rendered for about five seconds and vanished.
 *
 * Verified against the live site on 2026-08-24 — the key in play expired
 * 2026-08-12, and /blueprint's Sketch mode mounted at 2.5s and was gone by
 * 6.5s. Presence is not validity.
 */
export function tldrawKeyExpiry(key: string | undefined): Date | null {
  const m = /^tldraw-(\d{4})-(\d{2})-(\d{2})\//.exec(key ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hasTldrawLicense(now: Date = new Date()): boolean {
  const key = import.meta.env.VITE_TLDRAW_LICENSE_KEY;
  if (key) {
    const expiry = tldrawKeyExpiry(key);
    // An unrecognised shape is trusted: tldraw may change its format, and
    // refusing a key we simply cannot parse would disable a mode that would
    // have worked. Only a key we can read AND that has passed is rejected.
    if (expiry === null || expiry.getTime() >= now.getTime()) return true;
  }
  if (typeof location === "undefined") return false;
  // Mirrors LicenseManager.getIsDevelopment(): tldraw exempts anything not
  // served over https as well as the loopback hosts, so a plain-http preview
  // on a LAN address is "development" to it and runs unlicensed. Matching its
  // rule rather than guessing at it keeps this from disabling a mode tldraw
  // would happily have run. Note the corollary — an http origin can never
  // prove the licence works, because tldraw never checks it there.
  const host = location.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  return isLoopback || location.protocol !== "https:";
}

/* Local boundary so a crash *inside* a piece of three.js content (e.g. a lost
 * WebGL context) can't propagate up and take a whole page down. */
export class ShapeBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CountUp({ value }: { value: string }) {
  const [text, setText] = useState("0");
  useEffect(() => {
    const m = /^(-?)(\d+)(.*)$/.exec(value);
    if (!m) {
      setText(value);
      return;
    }
    const [, sign, digits, suffix] = m;
    const target = parseInt(digits, 10);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1200, 1);
      const eased = 1 - (1 - t) ** 3;
      setText(`${sign}${Math.round(target * eased)}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{text}</>;
}

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
