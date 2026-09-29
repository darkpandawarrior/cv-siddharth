// WAVE 7 LANE V3B: the "physical atmosphere" spike from
// 2026-09-29-globe-wave7-synthesis.md's Lane 3 step B. Flag-gated (off for
// every visitor by default -- see globeStore.ts's `physicalAtmosphere` and
// GlobeScene.tsx's mount) and tier 1 only. The written go/no-go this spike
// produced, with its three measured numbers against budget, is
// docs/globe-physical-atmosphere-spike.md; read that before promoting or
// deleting this file.
//
// @takram/three-atmosphere 0.19.1 (MIT,
// github.com/takram-design-engineering/three-geospatial). `textures` is
// left undefined on purpose: <Atmosphere> then builds its own
// transmittance/scattering/irradiance LUTs at runtime with the package's
// own PrecomputedTexturesGenerator, so this lane ships none of the
// package's ~33 MB of precomputed .bin/.exr tables. The package's own
// node_modules DOES contain those files (they exist as source assets for a
// different, textures-provided code path this lane does not use); what was
// verified is that the built dist/ this spike measured contains none of
// them -- see the spike doc's chunk-size section.
//
// No composer here: <Sky> is a depth-tested full-screen quad (SkyMaterial,
// depthTest true / depthWrite false), not a postprocessing effect, so it
// composites against the existing depth buffer without one. The lane brief
// allowed a minimal composer "if it needs one" -- it doesn't, which is
// itself part of the go/no-go (a composer is Lane 2's AerialPerspective
// scope, not this spike's).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Atmosphere, Sky, type AtmosphereApi } from "@takram/three-atmosphere/r3f";
import { sunDirection } from "./sun.ts";
import { GLOBE_RADIUS } from "../geoMath.ts";

// Real Earth equatorial radius (metres, WGS84) over this globe's
// render-space radius -- the same "1 unit = X km" relationship every other
// layer already trades on (geoMath.ts's own header comment).
const ECEF_METRES_PER_UNIT = 6378137 / GLOBE_RADIUS;

// This globe's frame (geoMath.ts's latLonToXyz) is Y-up: +X toward (0,0),
// +Y toward the north pole, -Z toward (0,90E). ECEF is Z-up: +X toward
// (0,0), +Y toward (0,90E), +Z toward the north pole. So scene (x,y,z) ->
// ECEF (x, -z, y), scaled to metres. The globe itself is never rotated
// (GlobeScene.tsx), so this matrix is static for the whole session --
// built once at module load, not per frame.
const WORLD_TO_ECEF = new THREE.Matrix4().set(
  ECEF_METRES_PER_UNIT,
  0,
  0,
  0,
  0,
  0,
  -ECEF_METRES_PER_UNIT,
  0,
  0,
  ECEF_METRES_PER_UNIT,
  0,
  0,
  0,
  0,
  0,
  1,
);

/** The spike's one mount. Sun direction is this globe's own (`sun.ts`'s
 *  `subsolarPoint`-derived vector -- the same one every other layer's
 *  terminator uses), not takram's bundled astronomy-engine: reusing it
 *  keeps this layer's terminator pixel-identical to Lane 3 step A's
 *  `ATMO_FRAG` halo instead of drawing two independently-computed sun
 *  positions a few arcminutes apart. Only its coordinate frame changes,
 *  scene basis to ECEF, via WORLD_TO_ECEF's linear part (a direction has
 *  w=0, so the translation row never applies, and the matrix's uniform
 *  scale leaves a unit vector unit-length). */
export default function PhysicalAtmosphere({ now }: { now: Date }) {
  const apiRef = useRef<AtmosphereApi>(null);

  useEffect(() => {
    apiRef.current?.worldToECEFMatrix.copy(WORLD_TO_ECEF);
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const dir = sunDirection(now);
    api.sunDirection.set(dir.x, -dir.z, dir.y);
  }, [now]);

  return (
    <Atmosphere ref={apiRef}>
      <Sky sun moon={false} />
    </Atmosphere>
  );
}
