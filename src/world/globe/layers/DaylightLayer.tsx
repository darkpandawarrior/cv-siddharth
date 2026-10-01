import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { DAYLIGHT_FRAG, VERT, daylightUniforms, updateDaylightUniforms } from "./daylight.ts";

/** A thin shell just above the earth/imagery/dots surface (GLOBE_RADIUS +
 *  0.02, well under CloudShell's 1.012x and Atmosphere's 1.1x) painting the
 *  golden-hour band and the waking band from the same subsolar point
 *  layers/sun.ts's terminator uses. No per-frame allocation: the uniforms
 *  object is built once (daylightUniforms) and mutated in place whenever
 *  `now` changes (updateDaylightUniforms), the same discipline sun.ts's
 *  useSunUniforms already established -- this layer follows `now` (the
 *  scrubbed sim time), not the wall clock, so scrubbing moves both bands. */
export default function DaylightLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const uniforms = useMemo(() => daylightUniforms(), []);

  useEffect(() => {
    updateDaylightUniforms(now, uniforms);
  }, [now, uniforms]);

  useEffect(() => {
    useGlobe.getState().setStatus("daylight", { state: "live", detail: "Computed from the subsolar point, not fetched" });
    return () => useGlobe.getState().setStatus("daylight", undefined);
  }, []);

  // Tier 3 still draws the bands (they're the whole point of the layer and
  // cost one draw call), just at the cheapest sphere the other ambient
  // shells already use at that tier.
  const segments = tier === 1 ? 64 : tier === 2 ? 48 : 32;

  return (
    <mesh scale={(GLOBE_RADIUS + 0.02) / GLOBE_RADIUS}>
      <sphereGeometry args={[GLOBE_RADIUS, segments, Math.round(segments * 0.75)]} />
      <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: DAYLIGHT_FRAG, uniforms }]} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
    </mesh>
  );
}
