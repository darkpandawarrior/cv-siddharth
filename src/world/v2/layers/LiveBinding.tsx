/**
 * The zero-render live writer (live-data-spec.md §2.2/§4 WL): reads the
 * SAME shared `useNowModel()` bus every other v2 layer already calls (no
 * second fetch, no second clock — M53), runs it through
 * `../live/liveBinding.ts`'s pure transfer functions, and:
 *
 *  - drives the sky dome's uniforms (including `uSunDir`, the true-compass
 *    direction, M4) and the scene's one key `DirectionalLight`'s colour and
 *    intensity (row 1's own words: "key DirectionalLight colour/intensity")
 *    — found by scene traversal, since `WorldV2.tsx` (unowned) mounts both
 *    with no shared-uniforms prop wired yet (`SkyDome.tsx`/`Env.tsx`'s own
 *    doc comments name this exact lane as the one that closes that gap
 *    without either file changing). The key light's POSITION stays exactly
 *    as `WorldV2.tsx` authored it: it is a `castShadow` light with three's
 *    default (tiny, uncustomized) shadow-camera frustum, calibrated for
 *    that one fixed position — moving it to track the sun's real, often
 *    near-horizon direction pushes that frustum off the visible scene and
 *    reads back as "everything in shadow" (measured: a fully black canvas
 *    at 18:30 IST, sun altitude -1°, before this was reverted). Row 1 never
 *    asked for a repositioned light, only its colour/intensity — the safer
 *    reading was also the smaller diff;
 *  - mirrors every row this lane owns onto the canvas DOM element as
 *    `data-live-*` attributes, the same `useCanvasDataAttrs` idiom
 *    `LandmarksApps.tsx` (P3-01a) already uses, so e2e reads them off
 *    `page.locator("[data-world='v2'] canvas")` with no second DOM node.
 *
 * Never touches `valley.ts`'s counts or widths (a live value binds an
 * existing uniform/attribute, never a GRAMMAR/worldModel count —
 * living-ledger-spec §5's own invariant, `valley.test.ts` unchanged).
 *
 * Sky writes ride `useNowModel`'s own `sky` object, which itself only
 * changes at most once a minute (`useNow()`'s minute-boundary tick,
 * `src/lib/useSky.ts`) — so this component's effects already run at most
 * once a minute for the sky, never per frame, with no extra throttle code
 * needed here.
 *
 * ponytail: uFogK/uMist/uFlowSpeed/uFoam/uGrassWet/uVolStrength are computed
 * (pure, tested in liveBinding.test.ts) but not yet wired into
 * atmosphere.ts/Water.tsx/terrainMaterial.ts's own materials — those files
 * are owned by earlier, already-merged P2 lanes, and no acceptance item
 * here asserts their visual effect. Wire them in place (same scene-traversal
 * idiom this file already uses for the sky dome) the day a lane needs the
 * fog/water/grass to visibly respond too.
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useNowModel } from "../useNowModel.ts";
import { ledger } from "../ledger.ts";
import { deviceTier } from "../../deviceTier.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { rainMode } from "../../Rain.tsx";
import { siteCiGlow } from "../../realityRows.ts";
import {
  sunBinding,
  rainBinding,
  chessLampBinding,
  collarState,
  keystoneLampLit,
  kiteAltitudeBinding,
  KITE_FLOOR_M,
  cloudShadeMultiplier,
} from "../live/liveBinding.ts";
import { LIVE_CONTRACT } from "../liveContract.ts";
import type { SkyUniformName } from "../skyChunk.glsl.ts";

export const layer = { id: "live-binding", order: 5 };

// The three stream-collar repos with a real, public CI (row 18) — Candidai
// and kmp-app-template stay "unmeasured" by construction (they carry no
// entry in `SignalsResponse["ci"]` at all).
const COLLAR_REPOS = ["doori", "gaddi", "paymentslab-kmp"] as const;

const CLOUD_SHADE_DESIGN = LIVE_CONTRACT.find((r) => r.name === "uCloudShade")!.design as readonly [number, number, number];

function findSkyDomeMaterial(scene: THREE.Scene): THREE.ShaderMaterial | null {
  let found: THREE.ShaderMaterial | null = null;
  scene.traverse((obj) => {
    if (found) return;
    const mat = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms && "uSkyZen" in mat.uniforms) found = mat;
  });
  return found;
}

function findKeyLight(scene: THREE.Scene): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null;
  scene.traverse((obj) => {
    if (!found && (obj as THREE.DirectionalLight).isDirectionalLight) found = obj as THREE.DirectionalLight;
  });
  return found;
}

function setUniform(mat: THREE.ShaderMaterial, name: SkyUniformName, value: readonly number[] | number): void {
  const u = mat.uniforms[name];
  if (!u) return;
  u.value = Array.isArray(value) ? new THREE.Vector3(value[0], value[1], value[2]) : value;
}

/** `field -> string`, mirrored onto the actual `<canvas>` DOM element — the
 *  same idiom `LandmarksApps.tsx` (P3-01a) already uses, so no second DOM
 *  node is needed for e2e to read this lane's rows. */
function useCanvasDataAttrs(attrs: Readonly<Record<string, string>>): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v);
  }, [gl, attrs]);
}

export default function LiveBinding() {
  const { scene } = useThree();
  const nowModel = useNowModel(null);
  const reducedMotion = useReducedMotion();
  const tier = deviceTier();

  const sky = nowModel?.raw.sky ?? null;
  const weather = sky?.weather ?? null;
  const signals = nowModel?.raw.signals ?? null;

  // ── Row 1: the sky dome + key DirectionalLight, at most once a minute ────
  useEffect(() => {
    if (!sky) return;
    const b = sunBinding(sky.sun.altitudeDeg, sky.sun.azimuthDeg, weather?.cloudPct ?? null);
    const dome = findSkyDomeMaterial(scene);
    if (dome) {
      setUniform(dome, "uSkyZen", b.sky.uSkyZen);
      setUniform(dome, "uSkyUp", b.sky.uSkyUp);
      setUniform(dome, "uHorizonGlow", b.sky.uHorizonGlow);
      setUniform(dome, "uHaze", b.sky.uHaze);
      setUniform(dome, "uSunCol", b.sky.uSunCol);
      setUniform(dome, "uSunDir", b.uSunDir);
      const shadeMul = cloudShadeMultiplier(weather?.code ?? null);
      setUniform(dome, "uCloudShade", CLOUD_SHADE_DESIGN.map((c) => c * shadeMul));
    }
    // Colour/intensity only (row 1) — position/direction stays WorldV2.tsx's
    // own fixed authoring (see this file's module doc: a moved castShadow
    // light outruns its own default shadow frustum).
    const key = findKeyLight(scene);
    if (key) {
      key.color.setRGB(b.sky.uSunCol[0], b.sky.uSunCol[1], b.sky.uSunCol[2]);
      key.intensity = b.sunI;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sky?.now.getTime(), sky?.sun.altitudeDeg, sky?.sun.azimuthDeg, weather?.cloudPct, weather?.code]);

  // ── Rows 5/16/18/19 + row 17's summary: data-live-* on the canvas ────────
  const rain = rainBinding(weather?.precipMmH ?? null, tier);
  const mode = rainMode(weather?.precipMmH ?? 0, reducedMotion, tier);
  const chessLamp = chessLampBinding(signals?.lichess ?? null);
  const keystoneLit = keystoneLampLit(signals?.ci ?? null);
  // Row 20: the site's own two workflows (M2) — the SAME classifier the v1
  // ledger/Monuments.tsx already use, so the twin-chhatri inlay can never
  // disagree with what "the portfolio's own CI" means elsewhere on the site.
  const opsLit = siteCiGlow(nowModel?.raw.ops ?? null) === "ok";

  const kiteAltitudes = ledger.writing.lessons.map((l) => kiteAltitudeBinding(signals?.devto ?? null, l.links.devto ?? null).altitudeM);
  const kiteMin = kiteAltitudes.length > 0 ? Math.min(...kiteAltitudes) : KITE_FLOOR_M;
  const kiteMax = kiteAltitudes.length > 0 ? Math.max(...kiteAltitudes) : KITE_FLOOR_M;

  useCanvasDataAttrs(
    useMemo(
      () => ({
        "live-rain-count": String(rain.count),
        "live-rain": mode,
        "live-chess-lamp": String(chessLamp),
        "live-keystone": keystoneLit ? "lit" : "unlit",
        "live-twin-chhatri": opsLit ? "lit" : "unlit",
        "live-kite-min-altitude": String(kiteMin),
        "live-kite-max-altitude": String(kiteMax),
        ...Object.fromEntries(COLLAR_REPOS.map((slug) => [`live-collar-${slug}`, collarState(slug, signals?.ci ?? null)])),
      }),
      [rain.count, mode, chessLamp, keystoneLit, opsLit, kiteMin, kiteMax, signals],
    ),
  );

  return null;
}
