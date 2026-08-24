import { useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CITY } from "./city.ts";
import { LANE_WIDTH, MONTH_DEPTH } from "./heightfield.ts";
import { visualHeightAt } from "./terrainRelief.ts";
import { buildPlateTexture, PLATE_TILES_Z } from "./terrainPlate.ts";
import { createLitMapTexture, stampLitMap } from "./litMap.ts";
import { telemetry } from "./telemetry.ts";
import { laneColors, mix, READHEAD_HEX, worldPalette, type WorldPalette } from "./palette.ts";

/**
 * NIGHT SURVEY — THE GROUND. Art-direction doc §3 (the material) and §7
 * Layers A and C (the read-line and the record — both live in this same
 * fragment shader because both are about where a fragment sits relative to
 * the car, which the terrain shader already has to know). Layer B (the
 * wake ribbon) is a separate mesh — see Wake.tsx — because it is its own
 * geometry, not a property of the ground fragment.
 *
 * One `PlaneGeometry(56, 168, 28, 184)`, displaced ONCE at load from
 * `terrainRelief.ts` (itself built on `heightfield.ts`'s `heightAt` — the
 * same function the car drives on). One `MeshStandardMaterial`, extended via
 * `onBeforeCompile` — no second material, no post-process, no per-fragment
 * procedural noise; everything below is either baked once (the plate
 * texture, the vertex displacement) or a single small uniform written once a
 * frame (`uHeadZ`) or throttled to 10Hz (`uLit`'s upload).
 */

const dummy = new THREE.Object3D();

/** A CSS-token hex as a GLSL `vec3(...)` literal, baked into the shader
 *  source at material-build time — this world's colours are resolved once
 *  per mount (see resolve.ts's own `uVoid`), never per frame, so there is no
 *  reason to spend a uniform (and a per-frame write) on a value that never
 *  changes after the material compiles. */
export function glslVec3(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

type TerrainAssets = {
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshStandardMaterial;
  litTexture: THREE.DataTexture;
  litData: Uint8Array;
  uHeadZ: { value: number };
};

function buildGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(CITY.halfWidth * 2, CITY.z1 - CITY.z0, 28, 184);
  geo.rotateX(-Math.PI / 2);
  // The plane is built centred at its own local origin (z spanning
  // +/-(CITY.z1-CITY.z0)/2); CITY's own span is NOT centred on zero
  // (z0=-80, z1=88), so this shifts it to land exactly on CITY's real
  // range rather than the art-direction doc's rounded +/-84 — the
  // difference is the same 4m the doc's own numbers round away, and
  // `heightAt` (already built and tested) is the ground truth here.
  geo.translate(0, 0, (CITY.z0 + CITY.z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, visualHeightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildMaterial(c: WorldPalette, plateTexture: THREE.CanvasTexture | null, litTexture: THREE.DataTexture, uHeadZ: { value: number }): THREE.MeshStandardMaterial {
  // `color` is white, not `ink`: the baked plate texture below carries the
  // ground's actual base tone (§3.1) via `diffuseColor.rgb *= nsPlate` in
  // the fragment shader. Setting `color` to `ink` too would multiply two
  // near-black values together (ink * ink), crushing the terrain to near
  // pure black regardless of the light rig — that bug, not the light rig,
  // was the real cause of "too dark right now".
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.04 });

  const laneColorLiterals = laneColors(c).map(glslVec3);
  const lineColor = glslVec3(c.line);
  const textColor = glslVec3(c.text);
  const readColor = glslVec3(READHEAD_HEX);

  // §3: shared setup every injected block below reads — plate UV (tiled 4x
  // along Z per §3.1), the fragment's lane index, the month/year seam
  // distances, the lit-map sample, and the read-line's own two numbers
  // (§7 Layer A). Computed once at the `map_fragment` slot (the earliest
  // safe injection point — `USE_MAP` is never defined on this material, so
  // the include itself expands to nothing) and read again, unchanged, from
  // the later roughness/metalness/emissive slots — one `void main()`, one
  // set of locals, no redeclaration.
  const mainBlock = /* glsl */ `
float nsHalfWidth = ${CITY.halfWidth.toFixed(2)};
float nsZ0 = ${CITY.z0.toFixed(2)};
float nsZ1 = ${CITY.z1.toFixed(2)};
float nsLaneWidth = ${LANE_WIDTH.toFixed(4)};
float nsMonthDepth = ${MONTH_DEPTH.toFixed(6)};
float nsYearDepth = nsMonthDepth * 12.0;

vec2 nsPlateUv = vec2(
  (vWorldPos.x + nsHalfWidth) / (nsHalfWidth * 2.0),
  (vWorldPos.z - nsZ0) / (nsZ1 - nsZ0) * ${PLATE_TILES_Z.toFixed(1)}
);
vec3 nsPlate = texture2D(uPlate, nsPlateUv).rgb;
diffuseColor.rgb *= nsPlate;

float nsLaneF = clamp((vWorldPos.x + nsHalfWidth) / nsLaneWidth, 0.0, 3.999);
int nsLane = int(floor(nsLaneF));
vec3 nsLaneColor = nsLane == 0 ? ${laneColorLiterals[0]} : nsLane == 1 ? ${laneColorLiterals[1]} : nsLane == 2 ? ${laneColorLiterals[2]} : ${laneColorLiterals[3]};

// month seams — §3.2: a 12mm recessed dark line, an 8mm lane-tinted bright edge.
float nsM = fract((vWorldPos.z - nsZ0) / nsMonthDepth);
float nsMonthDist = min(nsM, 1.0 - nsM) * nsMonthDepth;
float nsMonthDark = 1.0 - smoothstep(0.0, 0.006, nsMonthDist);
float nsMonthEdge = smoothstep(0.0, 0.006, nsMonthDist) * (1.0 - smoothstep(0.006, 0.014, nsMonthDist));
diffuseColor.rgb = mix(diffuseColor.rgb, ${lineColor}, nsMonthDark * 0.85);

// year seams — §3.3: brighter, wider, the full-width crossing rank.
float nsY = fract((vWorldPos.z - nsZ0) / nsYearDepth);
float nsYearDist = min(nsY, 1.0 - nsY) * nsYearDepth;
float nsYearLine = 1.0 - smoothstep(0.0, 0.02, nsYearDist);
diffuseColor.rgb = mix(diffuseColor.rgb, ${textColor}, nsYearLine * 0.55);

// §7 Layer C — the record. R8 lit map: emissive groove (below) and a
// roughness drop (next block) so worn track glints under the key light.
vec2 nsLitUv = vec2((vWorldPos.x + nsHalfWidth) / (nsHalfWidth * 2.0), (vWorldPos.z - nsZ0) / (nsZ1 - nsZ0));
float nsLitW = texture2D(uLit, nsLitUv).r;

// §7 Layer A — the read-line. A 0.26m bright bar locked to the car's Z,
// hottest in its own lane, still visible at the rim.
float nsHeadDist = abs(vWorldPos.z - uHeadZ);
float nsHead = 1.0 - smoothstep(0.0, 0.13, nsHeadDist);
float nsLateral = mix(1.0, 0.35, clamp(abs(vWorldPos.x) / nsHalfWidth, 0.0, 1.0));
`;

  const roughnessBlock = /* glsl */ `
if (nsLane == 3) { roughnessFactor = 0.35; } // opensource — steel plate
roughnessFactor = mix(roughnessFactor, 0.42, nsLitW); // worn-track glint
`;

  const metalnessBlock = /* glsl */ `
if (nsLane == 3) { metalnessFactor = 0.55; } // opensource — steel plate
`;

  const emissiveBlock = /* glsl */ `
totalEmissiveRadiance += nsLaneColor * nsMonthEdge * 0.12;
totalEmissiveRadiance += ${textColor} * nsYearLine * 0.5;
totalEmissiveRadiance += nsLaneColor * pow(nsLitW, 0.6) * 0.10;
totalEmissiveRadiance += nsHead * nsLateral * ${readColor};
`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlate = { value: plateTexture };
    shader.uniforms.uLit = { value: litTexture };
    shader.uniforms.uHeadZ = uHeadZ;

    shader.vertexShader = `
varying vec3 vWorldPos;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = `
varying vec3 vWorldPos;
uniform sampler2D uPlate;
uniform sampler2D uLit;
uniform float uHeadZ;
${shader.fragmentShader}`
      .replace("#include <map_fragment>", `#include <map_fragment>\n${mainBlock}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${roughnessBlock}`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n${metalnessBlock}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${emissiveBlock}`);
  };
  // One custom program per material shape — see resolve.ts's own comment on
  // why this matters: without it, three's program cache would key this
  // compiled shader off the same signature a plain MeshStandardMaterial
  // uses, and the SECOND one built would silently reuse the first's program.
  material.customProgramCacheKey = () => "night-survey-terrain";

  return material;
}

function buildAssets(c: WorldPalette): TerrainAssets {
  const geometry = buildGeometry();
  const litTexture = createLitMapTexture();
  const litData = litTexture.image.data as Uint8Array;
  const uHeadZ = { value: -9999 };
  // Owner refinement (blue-hour pass): a slightly higher base albedo than
  // raw `ink`, lifted neutrally toward `text` — same 0.12 lift the old
  // Mainland ground used for the same reason (see its own comment: lifted
  // toward text, never toward an accent, or unlit terrain reads as a hole
  // rather than a dark surface) — so the ground still separates from the
  // sky at the horizon even with zero fixtures lit.
  const plateBase = mix(c.ink, c.text, 0.12);
  const plateTexture = buildPlateTexture(plateBase);
  const material = buildMaterial(c, plateTexture, litTexture, uHeadZ);
  return { geometry, material, litTexture, litData, uHeadZ };
}

/** Between-lane dividers — §3's "brushed-aluminium angle-iron berm", one
 *  extruded strip, 3 instances. Placed exactly at the three lane
 *  boundaries (x = +/-14, 0): `heightAt`'s own cross-lane blend
 *  (heightfield.ts's `laneProfile`) eases to zero at every lane's half-width
 *  edge, so the ground is flat baseline at every boundary for the whole
 *  168m — a straight, unbent strip is already exactly where the terrain is
 *  flat, not an approximation of it. */
function Berms() {
  const c = worldPalette();
  const depth = CITY.z1 - CITY.z0 - 1;
  const zc = (CITY.z0 + CITY.z1) / 2;
  const width = 0.08;
  const height = 0.1;
  const xs = [1, 2, 3].map((i) => -CITY.halfWidth + LANE_WIDTH * i);
  return (
    <instancedMesh
      ref={(mesh) => {
        if (!mesh) return;
        for (let i = 0; i < xs.length; i++) {
          dummy.position.set(xs[i], CITY.groundY + height / 2, zc);
          dummy.scale.set(width, height, depth);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }}
      args={[undefined, undefined, xs.length]}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={c.text} metalness={0.9} roughness={0.3} />
    </instancedMesh>
  );
}

export function Terrain(): JSX.Element {
  // Lazy ref: built exactly once, the same "resolve the theme at mount,
  // never re-derive it" contract every other material in this world keeps
  // (resolve.ts, Sky.tsx) — and the ONLY safe way to build a geometry that
  // must be displaced once and never again.
  const assetsRef = useRef<TerrainAssets | null>(null);
  if (assetsRef.current === null) assetsRef.current = buildAssets(worldPalette());
  const assets = assetsRef.current;

  const uploadClock = useRef(0);

  useFrame((_, delta) => {
    // §7 Layer A — one uniform write per frame, zero geometry.
    assets.uHeadZ.value = telemetry.z;

    // §7 Layer C — stamp every frame (the car can cross more than one texel
    // between 10Hz uploads at speed), upload throttled to 10Hz.
    stampLitMap(assets.litData, telemetry.x, telemetry.z);
    uploadClock.current += delta;
    if (uploadClock.current >= 0.1) {
      uploadClock.current = 0;
      assets.litTexture.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh geometry={assets.geometry} material={assets.material} />
      <Berms />
    </>
  );
}
