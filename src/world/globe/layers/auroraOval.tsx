import { AURORA_RGB } from "./layerKeys.ts";
// LANE L7 (live earth events), task 4: NOAA SWPC's OVATION aurora
// probability grid as a soft glowing band, masked to the night side by the
// real subsolar point (layers/sun.ts, this app's own sun math — no
// duplicate). A shell just above the surface, sampling a DataTexture built
// from the grid; the fragment shader derives lat/lon from the object-space
// normal directly (geoMath.ts's own convention), not the sphere's built-in
// uv, so the texture the parser built (aurora.ts's auroraGridIndex) and the
// texture the shader samples agree on what texel is what lat/lon without a
// second copy of that rule.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { VERT, sunDirection } from "./sun.ts";
import type { AuroraGrid } from "./aurora.ts";

const SHELL_SCALE = 1.02;

// Natural-phenomenon colour (real auroras read green-to-violet), not this
// app's brand tokens — same "ambient never in brand colours" call as
// eonetGlyphs.tsx's ember/volcano hues.
const FRAG = `
uniform vec3 uSun;
uniform sampler2D uAurora;
uniform float uTime;
uniform float uShimmer;
varying vec3 vW;
void main() {
  float lat = degrees(asin(clamp(vW.y, -1.0, 1.0)));
  float lon = degrees(atan(-vW.z, vW.x));
  vec2 uv = vec2(mod(lon + 360.0, 360.0) / 360.0, (lat + 90.0) / 180.0);
  float prob = texture2D(uAurora, uv).r;
  // 1 well past the terminator into night, 0 on the lit side, soft between.
  // Ascending edges (GLSL's smoothstep is undefined when edge0 > edge1, and
  // at least one real driver actually took that "undefined" literally and
  // returned 0 everywhere) then inverted, not smoothstep(0.05,-0.15,x).
  float night = 1.0 - smoothstep(-0.15, 0.05, dot(normalize(vW), uSun));
  float shimmer = 1.0 + uShimmer * 0.15 * sin(uTime * 0.6 + lon * 0.05);
  vec3 color = vec3(${AURORA_RGB.join(",")});
  float a = prob * night * shimmer;
  gl_FragColor = vec4(color * a, a * 0.9);
}`;

// A plain setter, not an inline `uniform.value = x` in the component body —
// react-hooks' immutability rule flags a direct assignment onto a useMemo
// result even though three's own contract *requires* mutating a
// ShaderMaterial's uniforms in place (sun.ts's useSunUniforms does the same
// thing via its own sunDirection(now, out) call). Routing every write
// through a function, same as sun.ts already does, keeps that requirement
// without the warning.
function setUniform<T>(uniform: { value: T }, value: T): void {
  uniform.value = value;
}

function buildTexture(grid: AuroraGrid): THREE.DataTexture {
  const tex = new THREE.DataTexture(grid.data, grid.width, grid.height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping; // longitude wraps
  tex.wrapT = THREE.ClampToEdgeWrapping; // latitude does not
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // THREE.Texture defaults flipY to true (an image-loading convention); a
  // raw DataTexture built row-major from aurora.ts's own y=0-at-lat--90
  // rule needs it off, or WebGL's UNPACK_FLIP_Y_WEBGL (which applies to a
  // plain TypedArray upload too, not just images) uploads this grid upside
  // down — the northern and southern ovals would sample each other's data.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// A real (blank) 1x1 texture, never `null`, for the sampler's FIRST compile.
// Three's WebGLUniforms binds a sampler2D uniform's texture unit against
// whatever `.value` holds when the program first compiles; starting that
// value at `null` (this component's first render always beats its own
// texture-building effect to the first paint) left the sampler permanently
// unbound even after the effect later set a real texture — measured on this
// lane's own build, not a hypothetical. Swapping `.value` to another REAL
// texture afterward is the well-supported path, so this placeholder is only
// ever needed for the sliver of time before the first real grid loads.
function buildPlaceholderTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

/** `grid` is `null` while the OVATION feed hasn't loaded or has failed —
 *  this draws nothing then (the house "absent, not faked" rule): a probable
 *  aurora oval with no real numbers behind it would be exactly the kind of
 *  stale-dressed-as-live value the spec forbids. */
export function AuroraOval({ grid, now, reducedMotion }: { grid: AuroraGrid | null; now: Date; reducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  // ONE stable uniforms object, mutated in place (sun.ts's own useSunUniforms
  // doc comment: three binds a ShaderMaterial's uniforms at compile, so a
  // replaced object never reaches the GPU — every field here lives on this
  // one object for that reason, never spread into a fresh one per render).
  const uniforms = useMemo(
    () => ({
      uSun: { value: new THREE.Vector3() },
      uAurora: { value: buildPlaceholderTexture() as THREE.DataTexture },
      uTime: { value: 0 },
      uShimmer: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    sunDirection(now, uniforms.uSun.value);
  }, [now, uniforms]);

  // Exactly one live texture at a time (the placeholder, until the first
  // real grid arrives, then each grid update in turn) — tracked in a ref so
  // ONE unmount cleanup can dispose whichever one is current, instead of
  // two disposal paths that could double-free the same texture (task 8:
  // "dispose GPU resources").
  const currentTexRef = useRef(uniforms.uAurora.value);
  useEffect(() => {
    if (!grid) return;
    const tex = buildTexture(grid);
    const previous = currentTexRef.current;
    setUniform(uniforms.uAurora, tex);
    currentTexRef.current = tex;
    previous.dispose();
  }, [grid, uniforms]);
  useEffect(() => () => currentTexRef.current.dispose(), []);

  useEffect(() => {
    setUniform(uniforms.uShimmer, reducedMotion ? 0 : 1);
  }, [reducedMotion, uniforms]);

  useFrame(({ clock }) => {
    if (!reducedMotion) setUniform(uniforms.uTime, clock.elapsedTime);
  });

  if (!grid) return null;

  return (
    <mesh ref={meshRef} scale={SHELL_SCALE}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 48]} />
      {/* `args`, not a bare `uniforms` prop: r3f applies a plain prop by
          rewrapping each `{ value }` entry onto the material's OWN uniforms
          object once at mount, which severs the reference this component
          mutates afterward — every later `setUniform` call (uAurora's
          texture swap, uSun's per-tick direction) then writes to an object
          the material never reads from again. Passing the whole
          `{ vertexShader, fragmentShader, uniforms }` bundle as a
          constructor argument makes `material.uniforms` the exact object
          this component holds, so mutating it in place actually reaches
          the GPU. Measured on this lane's own build: the aurora rendered
          nothing, ever, until this changed — same bug the orchestrator
          had already found and fixed the same way in EarthImagery/skyMoon. */}
      <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: FRAG, uniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}
