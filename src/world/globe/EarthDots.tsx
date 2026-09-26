import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { fibonacciLattice, isDayAt, latLonToXyz } from "./geoMath.ts";
import { heavy } from "../../lib/assetBase.ts";

// Kept in sync with the sibling globe/*.tsx files rather than imported from
// one of them - same "restated, not shared" call Ghosts.tsx's CART_HALF
// already makes in this codebase (this lane's own file list has no room for
// a seventh, constants-only module).
export const GLOBE_RADIUS = 6;

/** heavy/globe/earth-720x360.bin's own layout (scripts/gen-globe-earth.mjs):
 *  an 8-byte "GLOB" + u16LE width + u16LE height header, then one byte per
 *  cell - bit 0x80 is land, the low nibble is a 0-15 Black Marble radiance. */
export interface EarthMask {
  width: number;
  height: number;
  land: Uint8Array;
  radiance: Uint8Array;
}

/** Pure parser, exported for the unit test: buffer in, mask out. `null` on
 *  anything that doesn't look like the real file - a network hiccup renders
 *  no dots rather than garbage ones (same "absent, not faked" rule as every
 *  other live/heavy read in this world). */
export function parseEarthMask(buf: Uint8Array): EarthMask | null {
  if (buf.length < 8 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "GLOB") return null;
  const width = buf[4] | (buf[5] << 8);
  const height = buf[6] | (buf[7] << 8);
  const cells = width * height;
  if (buf.length < 8 + cells) return null;
  const land = new Uint8Array(cells);
  const radiance = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const byte = buf[8 + i];
    land[i] = byte & 0x80 ? 1 : 0;
    radiance[i] = byte & 0x0f;
  }
  return { width, height, land, radiance };
}

async function loadEarthMask(url: string): Promise<EarthMask | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseEarthMask(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Nearest-cell sample - the mask is 1 deg/cell, plenty for a dot this size. */
function sampleMask(mask: EarthMask, lat: number, lon: number): { land: boolean; radiance: number } {
  const x = Math.min(mask.width - 1, Math.max(0, Math.floor(((lon + 180) / 360) * mask.width)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * mask.height)));
  const i = y * mask.width + x;
  return { land: mask.land[i] === 1, radiance: mask.radiance[i] };
}

// Ambient: warm white, never brand colours (living-ledger-spec.md#6.3) - 
// literal hex, not a theme token, because this is the one house rule that
// says these dots must NOT follow the site's own palette.
const DAY_COLOR = new THREE.Color("#e7efe9");
const NIGHT_UNLIT_COLOR = new THREE.Color("#141a17");
const NIGHT_CITY_COLOR = new THREE.Color("#ffdba3");

const DOT_GEOMETRY = new THREE.SphereGeometry(0.035, 6, 6);
const dummy = new THREE.Object3D();

/**
 * GLOBE's Earth: a Fibonacci-lattice dot matrix over the real 360x180 land
 * mask, one InstancedMesh, coloured by the real subsolar day/night split
 * plus baked Black Marble night radiance (§6.3, task 1). `count` is the
 * tier's lattice sample size (6,000 / 2,500 / 1,200) - filtered to land, so
 * the rendered instance count is smaller than `count` (about 29% of Earth is
 * land). Positions and land/radiance are fixed once the mask loads; only the
 * per-instance colour is recomputed, and only when `now` actually changes
 * (`useSky`'s once-a-minute tick) - never per frame, since nothing here
 * animates.
 */
export function EarthDots({ count, now }: { count: number; now: Date }) {
  const [mask, setMask] = useState<EarthMask | null>(null);
  useEffect(() => {
    let alive = true;
    loadEarthMask(heavy("/globe/earth-720x360.bin")).then((m) => {
      if (alive) setMask(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  const lattice = useMemo(() => fibonacciLattice(count), [count]);
  const dots = useMemo(() => {
    if (!mask) return [];
    return lattice.map((p) => ({ ...p, ...sampleMask(mask, p.lat, p.lon) })).filter((d) => d.land);
  }, [lattice, mask]);

  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || dots.length === 0) return;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const p = latLonToXyz(d.lat, d.lon);
      dummy.position.set(p.x * GLOBE_RADIUS, p.y * GLOBE_RADIUS, p.z * GLOBE_RADIUS);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const day = isDayAt(now, d.lat, d.lon);
      const color = day ? DAY_COLOR : d.radiance > 0 ? NIGHT_CITY_COLOR.clone().multiplyScalar(0.25 + (d.radiance / 15) * 0.75) : NIGHT_UNLIT_COLOR;
      mesh.setColorAt(i, color);
    }
    mesh.count = dots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dots, now]);

  if (dots.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[DOT_GEOMETRY, undefined, dots.length]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
