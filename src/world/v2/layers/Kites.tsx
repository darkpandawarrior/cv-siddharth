/**
 * Kites (this lane's own task list; world-v2-spec.md#5 row 10
 * loopdown-kite-masts; REC-9; master-plan.md#M21; visual-catalogue.md#C4).
 *
 * Two data-driven kite families flying over the east meadow: lesson kites
 * (amber, one per `writing.lessons` entry, G7 in grammar.ts) and archive
 * kites (pale, one per `writing.archive` entry, G8). Altitude is GRAMMAR's
 * own `scalar` (M21's exact resolution, dev.to reactions when known, else
 * the 18 m floor, this file never re-derives that formula), written into
 * BOTH the mesh's Y position and a named `aAltitude` instanced attribute
 * (liveContract.ts) so P3-02a's live-binding lane can overwrite it in place
 * once a live signal exists, without this file changing.
 *
 * `landOf(ledger)` (worldModel.ts, D1's one source of truth) supplies every
 * count and position here, this file only decides HOW `lesson-kite` and
 * `archive-kite` features are drawn.
 *
 * ponytail: no `src/world/v2/kits/*.ts` entry claims either form (kits.ts's
 * own "no phase-3 kit lane owns lesson-kite/archive-kite" gap, checked
 * across every phase-3 lane's `owns` list, and this lane's own owns list
 * has no kits/ path to add one to), so GrammarInstances.tsx keeps drawing
 * its generic placeholder kite quad for the same features underneath these
 * real ones. Claim both forms in kits.ts the day a lane owns that file
 * again; nothing here needs to change for that fix to land.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useNavigate } from "@tanstack/react-router";
import { landOf, type Feature } from "../worldModel.ts";
import { ledger } from "../ledger.ts";
import { ATTRIBUTE_A_ALTITUDE } from "../liveContract.ts";
import { BOUNDS } from "../valley.ts";
import { hashNoise, stringSeed } from "../hash.ts";
import { useReveal } from "../reveal.ts";
import { worldPalette } from "../../palette.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { leadCastIdOf } from "../../../LoopdownCast.tsx";
import { titleize } from "../../../data/writingMeta.ts";

export const layer = { id: "kites", order: 40 };

type KiteKind = "lesson" | "archive";

interface KiteInstance {
  id: string;
  kind: KiteKind;
  slug: string;
  x: number;
  y: number;
  z: number;
  seed: number;
  title: string;
  hoverLabel: string;
}

// world-v2-spec §2's north end of the spine (2017, upstream), undated
// kites (no `created`/`era` GRAMMAR could parse into a z) tether here
// rather than at worldModel.ts's own generic z=0 shelf, per this lane's own
// task line ("undated tethered on the north edge"). worldModel.ts is not
// owned by this lane, so the override happens here, on the rendered
// position only, the ledger row's own count is untouched.
const NORTH_EDGE_Z = BOUNDS.zMin + 16;
const NORTH_EDGE_JITTER = 8;

/** Parses `lesson-kite:/<slug>` / `archive-kite:<slug>` (grammar.ts's own
 *  `placementSeed`) back into a bare slug. */
function slugOf(feature: Feature): string {
  return feature.id.slice(`${feature.rule}:`.length).replace(/^\//, "");
}

function buildKites(): KiteInstance[] {
  const lessons = new Map(ledger.writing.lessons.map((l) => [l.slug, l]));
  const archive = new Map(ledger.writing.archive.map((a) => [a.slug, a]));
  const out: KiteInstance[] = [];
  for (const f of landOf(ledger)) {
    if (f.rule !== "lesson-kite" && f.rule !== "archive-kite") continue;
    const kind: KiteKind = f.rule === "lesson-kite" ? "lesson" : "archive";
    const slug = slugOf(f);
    const seed = hashNoise(stringSeed(f.id));
    const undated = f.date === null;
    const x = undated ? seed * NORTH_EDGE_JITTER : f.pos[0];
    const z = undated ? NORTH_EDGE_Z + seed * NORTH_EDGE_JITTER : f.pos[2];
    let title = f.label;
    let hoverLabel = f.label;
    if (kind === "lesson") {
      const lesson = lessons.get(slug);
      if (lesson) {
        title = lesson.title;
        const castId = leadCastIdOf(lesson.series);
        hoverLabel = castId ? `${lesson.title} · ${titleize(castId)}` : lesson.title;
      }
    } else {
      const entry = archive.get(slug);
      if (entry) title = entry.title;
      hoverLabel = title;
    }
    out.push({ id: f.id, kind, slug, x, y: f.scalar, z, seed, title, hoverLabel });
  }
  return out;
}

/** A 4-gon = a diamond/kite silhouette, tilted to catch the (implied) wind
 *  rather than lying flat. Built fresh per `KiteGroup` (lessons vs archive
 *  each carry their own `aAltitude` instanced attribute, sized to their own
 *  instance count) rather than shared at module scope, so the two groups'
 *  attributes never overwrite one another on the same geometry object. */
function buildKiteGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(0.55, 4);
  geo.rotateX(-Math.PI / 2.4);
  return geo;
}

const dummy = new THREE.Object3D();

function KiteGroup({
  kites,
  color,
  reducedMotion,
  opacity,
  onHover,
  onNavigate,
}: {
  kites: readonly KiteInstance[];
  color: string;
  reducedMotion: boolean;
  opacity: number;
  onHover: (kite: KiteInstance | null) => void;
  onNavigate: (slug: string) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildKiteGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // P3-02a's own attribute (liveContract.ts): initialised to GRAMMAR's
  // pre-live altitude (M21) so the live-binding lane only ever overwrites a
  // real, honest starting value, never a placeholder zero.
  const altitudeArray = useMemo(() => new Float32Array(kites.map((k) => k.y)), [kites]);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide, transparent: true }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);
  material.opacity = opacity;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // world-v2-spec §7 "Kites (data): ... a 2-sine sway", frozen at t=0
    // under reduced motion (world-v2-spec §8's own reduced-motion doctrine
    // for every data particle in this world).
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < kites.length; i++) {
      const k = kites[i];
      const swayX = (Math.sin(t * 0.6 + k.seed * 6) + Math.sin(t * 1.3 + k.seed * 11) * 0.4) * 0.6;
      const swayY = Math.sin(t * 0.9 + k.seed * 4) * 0.3;
      dummy.position.set(k.x + swayX, k.y + swayY, k.z);
      dummy.rotation.set(0, k.seed * Math.PI, Math.sin(t * 0.4 + k.seed * 3) * 0.15);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (kites.length === 0) return null;

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onHover(kites[e.instanceId] ?? null);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onNavigate(kites[e.instanceId].slug);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, kites.length]}
      frustumCulled={false}
      onPointerOver={handlePointerOver}
      onPointerOut={() => onHover(null)}
      onClick={handleClick}
    >
      <instancedBufferAttribute attach={`geometry-attributes-${ATTRIBUTE_A_ALTITUDE}`} args={[altitudeArray, 1]} />
    </instancedMesh>
  );
}

/** One merged `LineSegments`, a tether from the water (y=0) up to every
 *  kite's own altitude, at its (x, z). Static: the sway above is a few tens
 *  of centimetres, not worth rebuilding a buffer over every frame for. */
function Tethers({ kites, color }: { kites: readonly KiteInstance[]; color: string }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(kites.length * 6);
    kites.forEach((k, i) => {
      positions.set([k.x, 0, k.z, k.x, k.y, k.z], i * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [kites]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (kites.length === 0) return null;
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent opacity={0.35} />
    </lineSegments>
  );
}

export default function Kites() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const palette = worldPalette();
  const [hovered, setHovered] = useState<KiteInstance | null>(null);
  const [opacity, setOpacity] = useState(0);
  useReveal(true, reducedMotion, setOpacity);

  const all = useMemo(() => buildKites(), []);
  const lessonKites = useMemo(() => all.filter((k) => k.kind === "lesson"), [all]);
  const archiveKites = useMemo(() => all.filter((k) => k.kind === "archive"), [all]);

  const goToLesson = (slug: string) => navigate({ to: "/loopdown", hash: slug });

  return (
    <group name="kites">
      <KiteGroup
        kites={lessonKites}
        color={palette.accent}
        reducedMotion={reducedMotion}
        opacity={opacity}
        onHover={setHovered}
        onNavigate={goToLesson}
      />
      <KiteGroup
        kites={archiveKites}
        color={palette.textDim}
        reducedMotion={reducedMotion}
        opacity={opacity}
        onHover={setHovered}
        onNavigate={goToLesson}
      />
      <Tethers kites={lessonKites} color={palette.accentDim} />
      <Tethers kites={archiveKites} color={palette.line} />

      {hovered && (
        <Html position={[hovered.x, hovered.y + 0.9, hovered.z]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-card/90 px-2 py-1 text-xs text-text">{hovered.hoverLabel}</div>
        </Html>
      )}

      {/* Hidden DOM mirror (GrammarInstancesDom's own idiom, restated here
          because this layer mounts outside that file's own worldModel prop):
          one `data-kites` count and one `data-kite-rule`/`data-slug` span
          per kite, for e2e/world-fiction.spec.ts to read without touching
          WebGL pixels. Named `data-kite-rule`, not `data-rule`:
          GrammarInstances.tsx's OWN DOM mirror already emits `data-rule`
          spans for these same still-unclaimed forms (this file's own
          top-of-file ponytail note), and reusing that attribute name here
          would silently double-count against it. */}
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-kites={all.length}>
          {all.map((k) => (
            <span key={k.id} data-kite-rule={k.kind === "lesson" ? "lesson-kite" : "archive-kite"} data-slug={k.slug} data-title={k.title} />
          ))}
        </div>
      </Html>
    </group>
  );
}
