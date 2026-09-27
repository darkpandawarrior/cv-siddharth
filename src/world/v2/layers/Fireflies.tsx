/**
 * Fireflies (this lane's own task list; world-v2-spec.md#5 row 16
 * firefly-meadow; idea-atlas REC-5; master-plan.md#M1). One firefly per
 * weeb title counted at runtime through `landOf(ledger)`'s own "firefly"
 * rule (grammar.ts G10: `weeb.anime.byWatch` minus "To Watch", plus
 * `weeb.manga.byRead`), never a literal count, and never a visitor: M1's
 * whole resolution is that fireflies mean the weeb corpus only, paper
 * lanterns are visitors.
 *
 * Genre reads only where a real one exists (REC-5): `weebTitles.ts` is the
 * matched-and-scored subset (48 of ~176), each with real AniList genres.
 * There is no per-title join for the aggregate byWatch/byRead rows GRAMMAR
 * counts (no title name survives into a `firefly` Feature, living-ledger
 * §4.4's own "aggregate-only domain"), so this file distributes the corpus'
 * REAL genre frequency across the lit fireflies deterministically (never
 * `Math.random`), which is an honest statistical picture of "what kind of
 * watching this is" rather than a fabricated per-firefly title claim.
 * Colour stays inside the amber family throughout (world-v2-spec §0 rule 3
 * + REC-5's own "never a hue rotation, only value/saturation").
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { landOf } from "../worldModel.ts";
import { ledger } from "../ledger.ts";
import { hashNoise, stringSeed } from "../hash.ts";
import { useReveal } from "../reveal.ts";
import { worldPalette } from "../../palette.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { weebTitles } from "../../../data/weebTitles.ts";

export const layer = { id: "fireflies", order: 42 };

interface FireflyInstance {
  id: string;
  x: number;
  y: number;
  z: number;
  seed: number;
  lit: boolean;
  genreRank: number; // -1 for dark/no-signal fireflies
}

const MEADOW_Z_SPREAD = 40;
const HOVER_HEIGHT_MIN = 0.4;
const HOVER_HEIGHT_MAX = 1.8;
const GENRE_BUCKETS = 5;

/** Top `GENRE_BUCKETS` genres by real frequency across the scored/matched
 *  corpus, ranked so bucket 0 is the most common. Only genres that actually
 *  occur are ever returned (an empty corpus yields no buckets, never a
 *  guessed one). */
function topGenres(): string[] {
  const freq = new Map<string, number>();
  for (const t of weebTitles) for (const g of t.genres) freq.set(g, (freq.get(g) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, GENRE_BUCKETS)
    .map(([g]) => g);
}

function buildFireflies(): FireflyInstance[] {
  const genres = topGenres();
  const out: FireflyInstance[] = [];
  for (const f of landOf(ledger)) {
    if (f.rule !== "firefly") continue;
    const zSeed = hashNoise(stringSeed(`${f.id}:z`));
    const ySeed = hashNoise(stringSeed(`${f.id}:y`));
    const lit = f.state === "lit";
    // A deterministic bucket pick, weighted toward the corpus' own most
    // common genres first (bucket 0 gets the widest slice of the [-1,1)
    // noise range), real distribution, no per-title claim.
    const genreRank = lit && genres.length > 0 ? Math.floor(((hashNoise(stringSeed(f.id)) + 1) / 2) * genres.length) : -1;
    out.push({
      id: f.id,
      x: f.pos[0],
      y: HOVER_HEIGHT_MIN + ((ySeed + 1) / 2) * (HOVER_HEIGHT_MAX - HOVER_HEIGHT_MIN),
      z: f.pos[2] + zSeed * MEADOW_Z_SPREAD,
      seed: hashNoise(stringSeed(`${f.id}:phase`)),
      lit,
      genreRank,
    });
  }
  return out;
}

const dummy = new THREE.Object3D();
const FIREFLY_GEOMETRY = new THREE.SphereGeometry(0.06, 6, 6);

export default function Fireflies() {
  const reducedMotion = useReducedMotion();
  const palette = worldPalette();
  const [opacity, setOpacity] = useState(0);
  useReveal(true, reducedMotion, setOpacity);

  const fireflies = useMemo(() => buildFireflies(), []);
  const genres = useMemo(() => topGenres(), []);

  const geometry = useMemo(() => FIREFLY_GEOMETRY.clone(), []);
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

  // Bucket 0 (the most common genre) gets the brightest, most saturated
  // amber; later buckets step down in lightness/saturation only, same hue
  // throughout (REC-5). Dark (unwatched-track) fireflies get palette.line,
  // no bloom.
  const litColors = useMemo(() => {
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(palette.accent).getHSL(hsl);
    const n = Math.max(1, genres.length);
    return Array.from({ length: n }, (_, i) =>
      new THREE.Color().setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * (1 - i / (n * 1.6)), 0.25, 1), THREE.MathUtils.clamp(hsl.l * (1 - i / (n * 2)), 0.2, 1)),
    );
  }, [palette.accent, genres.length]);
  const darkColor = useMemo(() => new THREE.Color(palette.line), [palette.line]);

  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i];
      const color = f.lit ? (litColors[f.genreRank] ?? litColors[0]) : darkColor;
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [fireflies, litColors, darkColor]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i];
      const drift = reducedMotion ? 0 : Math.sin(t * 0.5 + f.seed * 8) * 0.4;
      const twinkle = f.lit ? 0.7 + 0.3 * Math.sin(t * (2 + f.seed) + f.seed * 9) : 0.35;
      dummy.position.set(f.x + drift, f.y + (reducedMotion ? 0 : Math.sin(t * 0.8 + f.seed * 5) * 0.15), f.z);
      dummy.scale.setScalar(twinkle);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  // The brightest cluster's own label (REC-5): the single title with the
  // widest mine-vs-crowd gap, `weeb.divergence.top[0]`, a real ranking
  // already computed by gen-weeb.mjs, never re-derived here. Anchored over
  // the meadow's own centre rather than a genuine per-instance hover (the
  // aggregate rows behind these instances carry no title to hover to).
  const brightestLabel = ledger.weeb.divergence?.top?.[0]?.name ?? null;
  const centroid = useMemo(() => {
    const lit = fireflies.filter((f) => f.lit);
    if (lit.length === 0) return null;
    const sum = lit.reduce((acc, f) => ({ x: acc.x + f.x, z: acc.z + f.z }), { x: 0, z: 0 });
    return { x: sum.x / lit.length, z: sum.z / lit.length };
  }, [fireflies]);

  if (fireflies.length === 0) return null;

  return (
    <group name="fireflies">
      <instancedMesh ref={meshRef} args={[geometry, material, fireflies.length]} frustumCulled={false} />

      {brightestLabel && centroid && (
        <Html position={[centroid.x, HOVER_HEIGHT_MAX + 1, centroid.z]} center distanceFactor={16} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-card/90 px-2 py-1 text-xs text-text" data-firefly-brightest={brightestLabel}>
            {brightestLabel}
          </div>
        </Html>
      )}

      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-fireflies={fireflies.length} data-fireflies-lit={fireflies.filter((f) => f.lit).length} />
      </Html>
    </group>
  );
}
