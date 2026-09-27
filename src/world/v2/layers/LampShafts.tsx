/**
 * L3 (visual-catalogue.md "Additive cone-mesh light shafts", master-plan.md
 * #M67): "an open cone with additive blending that fades from apex to
 * base, with `depthWrite=false`. Use at most 12 cones, on the brightest
 * emitters only." Gated by `tiers.ts`'s `showsLampShafts` — T2/T3 always,
 * T1 only at night (world-v2-spec §7/§8: on T1 the raymarched volumetric
 * pass, `Volumetric.ts`, already draws the sun's own god rays in daylight;
 * lamp shafts take over once there is no sun to raymarch against).
 *
 * "on the brightest emitters (brightest diyas, bow lantern, bridge lamps)"
 * names three emitter kinds; only one of them is a real, positioned
 * GRAMMAR feature at the time this lane lands (`deepmal-niche`, form
 * `"niche-lamp"` — the "88 lit niches" visual-catalogue.md#L2 already
 * cites). "diya" and "deck-lamp" exist today only as `streams.ts` metadata
 * (no GRAMMAR rule places them in 3D yet — that lands with P3-02a's
 * `CommitDiyas.tsx` and the bridge kits), and the boat's own "bow lantern"
 * belongs to `Hodi.tsx` (P2-06b, outside this lane's `owns`). `LAMP_FORMS`
 * below is the extension point: once a later lane's GRAMMAR rule gives
 * `diya`/`deck-lamp` a real `pos`, `landOf(ledger)` starts yielding them
 * here with no change to this file.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { landOf, type Feature } from "../worldModel.ts";
import { ledger } from "../ledger.ts";
import { showsLampShafts } from "../tiers.ts";
import { useReveal } from "../reveal.ts";
import { deviceTier } from "../../deviceTier.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useSky } from "../../../lib/useSky.ts";

export const layer = { id: "lamp-shafts", order: 44 };

const LAMP_FORMS: readonly string[] = ["diya", "deck-lamp", "niche-lamp"];
const MAX_CONES = 12;

// Art-direction constants (the spec gives the shape — "an open cone…apex to
// base" and the count cap — but no numeric size for it, the same position
// Grade.ts's own GOLDEN_LOOK baseline is in). Tuned once by eye, not derived.
const CONE_HEIGHT = 6;
const CONE_TOP_RADIUS = 1.1;
const CONE_RADIAL_SEGMENTS = 10;
const APEX_COLOR = new THREE.Color(1.0, 0.78, 0.42); // warm amber, matches the site's palette family
const BASE_COLOR = new THREE.Color(0, 0, 0);

/** An open cone, apex at the local origin (where the lamp sits) widening
 *  upward to `CONE_HEIGHT`, with vertex colours already baked from
 *  `APEX_COLOR` (full) to `BASE_COLOR` (black) — additive blending then
 *  does the "fades from apex to base" the spec asks for with no separate
 *  alpha channel, the same way a black contribution already adds nothing. */
function buildConeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(CONE_TOP_RADIUS, 0, CONE_HEIGHT, CONE_RADIAL_SEGMENTS, 1, true);
  geo.translate(0, CONE_HEIGHT / 2, 0); // apex (radiusBottom=0) moves from -h/2 to local y=0
  const position = geo.getAttribute("position");
  const color = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const localY = position.getY(i);
    const t = THREE.MathUtils.clamp(localY / CONE_HEIGHT, 0, 1);
    const c = APEX_COLOR.clone().lerp(BASE_COLOR, t);
    color.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  return geo;
}

function brightestLampFeatures(): Feature[] {
  const out: Feature[] = [];
  for (const f of landOf(ledger)) {
    if (f.state !== "lit" || !LAMP_FORMS.includes(f.form)) continue;
    out.push(f);
    // No numeric "brightness" scalar exists on these features yet (the
    // GRAMMAR rules behind them don't set one) — first-12-in-ledger-order
    // is the honest, deterministic stand-in until one does.
    if (out.length >= MAX_CONES) break;
  }
  return out;
}

const dummy = new THREE.Object3D();

export default function LampShafts() {
  const tier = deviceTier();
  const sky = useSky();
  const reducedMotion = useReducedMotion();
  const [opacity, setOpacity] = useState(0);
  useReveal(true, reducedMotion, setOpacity);

  const visible = showsLampShafts(tier, sky?.daypart === "night");
  const lamps = useMemo(() => brightestLampFeatures(), []);

  const geometry = useMemo(() => buildConeGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  material.opacity = opacity;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < lamps.length; i++) {
      const f = lamps[i];
      dummy.position.set(f.pos[0], f.pos[1], f.pos[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [lamps]);

  if (lamps.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, lamps.length]} visible={visible} frustumCulled={false} />
  );
}
