import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { DoubleSide } from "three";
// drei's <Text> is troika, which resolves any glyph its font can't draw by
// fetching a fallback font from jsDelivr at runtime. So the font ships with the
// bundle (the .woff, not the .woff2 — troika refuses woff2) and every in-canvas
// string stays ASCII. A portfolio shouldn't depend on a CDN being up.
import fontUrl from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";
import type { ArcSeries, Corpus } from "../lib/useCorpus.ts";
import { readToken } from "../themeColor";

/**
 * The rating arc as twin ribbons — time on X, rating on Y, **platform on Z**.
 *
 * The Y scale is per-platform, never shared: lichess blitz peaks ~260 points
 * above chess.com blitz for the same player at roughly the same strength, so
 * one shared axis would draw a cliff at the platform handoff and read as a
 * collapse in ability the games do not support. Only the time axis is shared,
 * which is exactly what makes the January 2023 baton-pass legible: one set of
 * ribbons stops, another starts on its own plane at its own scale. Each ribbon
 * writes its own range next to it, so the different scales are stated rather
 * than implied.
 *
 * Composed around the handoff, not around an overlap — only five months in
 * 7.5 years ever saw ≥10 games on both platforms.
 *
 * Reduced motion never reaches here: `ChessRoom` renders the flat `ChessArc`
 * instead, so this chunk (and three.js with it) is not even fetched.
 */

const W = 12; // world width of the shared time axis
const RIBBON_H = 2.3; // world height of one platform's full rating range
const PLATFORM_GAP = 4.2; // Z distance between platform planes
const FORMAT_GAP = 0.5; // Z distance between formats inside one platform

// One colour per format, shared across platforms so a format is the same
// colour everywhere. Meaning never rests on the colour alone: every ribbon
// also carries a written "<format> <min>–<max>" label, and the platforms are
// separated in space, not by hue.
const FORMAT_COLOUR = ["#3ddc84", "#5ee6ff", "#f0883e"];

const HANDOFF_COLOUR = "#f0883e";

type Vec3 = [number, number, number];

interface Ribbon {
  format: string;
  colour: string;
  min: number;
  max: number;
  z: number;
  /** Triangle-strip verts: baseline + curve, two per sample. */
  positions: Float32Array;
  colours: Float32Array;
  indices: Uint32Array;
  /** The top edge, drawn as a bright line over the ribbon. */
  edge: Vec3[];
  /** Where the ribbon ends — the label hangs off it. */
  end: Vec3;
}

interface Plane {
  platform: string;
  rMin: number;
  rMax: number;
  z: number;
  /** X extent of this platform's activity — its baseline, and where its label sits. */
  x0: number;
  x1: number;
  ribbons: Ribbon[];
}

function buildRibbon(
  series: ArcSeries,
  colour: string,
  z: number,
  x: (t: number) => number,
  y: (r: number) => number,
): Ribbon {
  const pts = series.points;
  const n = pts.length;
  const positions = new Float32Array(n * 6);
  const colours = new Float32Array(n * 6);
  const indices = new Uint32Array((n - 1) * 6);
  const rgb = [
    parseInt(colour.slice(1, 3), 16) / 255,
    parseInt(colour.slice(3, 5), 16) / 255,
    parseInt(colour.slice(5, 7), 16) / 255,
  ];
  const edge: Vec3[] = [];

  for (let i = 0; i < n; i++) {
    const px = x(pts[i].t);
    const py = y(pts[i].r);
    // vertex 2i = baseline, 2i+1 = the rating curve
    positions.set([px, 0, 0, px, py, 0], i * 6);
    // Vertical gradient: the ribbon fades into its own baseline.
    colours.set([rgb[0] * 0.12, rgb[1] * 0.12, rgb[2] * 0.12, ...rgb], i * 6);
    edge.push([px, py, 0]);
    if (i < n - 1) {
      const v = i * 2;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
  }

  const ratings = pts.map((p) => p.r);
  return {
    format: series.format,
    colour,
    min: Math.min(...ratings),
    max: Math.max(...ratings),
    z,
    positions,
    colours,
    indices,
    edge,
    end: edge[edge.length - 1],
  };
}

/** Every derived coordinate in one pass — the scene itself is then dumb. */
function useModel(corpus: Corpus, handoffAt: number | null) {
  return useMemo(() => {
    const series = corpus.arc.filter((s) => s.points.length > 1);
    const allT = series.flatMap((s) => s.points.map((p) => p.t));
    const tMin = Math.min(...allT);
    const tMax = Math.max(...allT);
    const tSpan = tMax - tMin || 1;
    const x = (t: number) => ((t - tMin) / tSpan - 0.5) * W;

    const formatOrder = [...new Set(series.map((s) => s.format))];
    const platforms = [...new Set(series.map((s) => s.platform))];

    const planes: Plane[] = platforms.map((platform, pi) => {
      const own = series.filter((s) => s.platform === platform);
      const ratings = own.flatMap((s) => s.points.map((p) => p.r));
      const rMin = Math.min(...ratings);
      const rMax = Math.max(...ratings);
      const rSpan = rMax - rMin || 1;
      // Per-platform Y. This is the whole point of the scene.
      const y = (r: number) => ((r - rMin) / rSpan) * RIBBON_H;
      const z = (pi - (platforms.length - 1) / 2) * PLATFORM_GAP;
      const ts = own.flatMap((s) => s.points.map((p) => p.t));
      return {
        platform,
        rMin,
        rMax,
        z,
        x0: x(Math.min(...ts)),
        x1: x(Math.max(...ts)),
        ribbons: own.map((s, si) =>
          buildRibbon(
            s,
            FORMAT_COLOUR[formatOrder.indexOf(s.format) % FORMAT_COLOUR.length],
            (si - (own.length - 1) / 2) * FORMAT_GAP,
            x,
            y,
          ),
        ),
      };
    });

    const firstYear = new Date(tMin).getUTCFullYear();
    const lastYear = new Date(tMax).getUTCFullYear();
    const years: { label: string; x: number }[] = [];
    for (let yr = firstYear; yr <= lastYear; yr++) {
      const t = Date.UTC(yr, 0, 1);
      if (t >= tMin && t <= tMax) years.push({ label: String(yr), x: x(t) });
    }

    const zSpan = (platforms.length - 1) * PLATFORM_GAP + 2;
    return { planes, years, zSpan, handoffX: handoffAt === null ? null : x(handoffAt) };
  }, [corpus, handoffAt]);
}

export default function ChessArcScene({
  corpus,
  handoffAt,
  handoffLabel,
}: {
  corpus: Corpus;
  /** ms epoch of the platform handoff, derived by the room. */
  handoffAt: number | null;
  handoffLabel: string;
}) {
  const { planes, years, zSpan, handoffX } = useModel(corpus, handoffAt);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 4.4, 12.5], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[6, 6, 8]} intensity={40} color={readToken("--color-probe", "#5ee6ff")} />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.3}
        enablePan={false}
        minDistance={7}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2 + 0.08}
        target={[0, 1, 0]}
      />

      {/* Year gridlines — the one reference the two planes genuinely share. */}
      {years.map((yr) => (
        <group key={yr.label}>
          <Line
            points={[
              [yr.x, 0, -zSpan / 2],
              [yr.x, 0, zSpan / 2],
            ]}
            color="#243029"
            lineWidth={1}
          />
          <Billboard position={[yr.x, -1.05, zSpan / 2]}>
            <Text font={fontUrl} fontSize={0.24} color="#8b909a" anchorX="center">
              {yr.label}
            </Text>
          </Billboard>
        </group>
      ))}

      {/* The handoff: a marked seam between the planes, never a joining line. */}
      {handoffX !== null && (
        <group>
          <mesh position={[handoffX, RIBBON_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[zSpan, RIBBON_H * 1.3]} />
            <meshBasicMaterial color={HANDOFF_COLOUR} transparent opacity={0.1} side={DoubleSide} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [handoffX, 0, 0],
              [handoffX, RIBBON_H * 1.35, 0],
            ]}
            color={HANDOFF_COLOUR}
            lineWidth={2}
            dashed
            dashSize={0.14}
            gapSize={0.1}
          />
          <Billboard position={[handoffX, RIBBON_H * 1.55, 0]}>
            <Text font={fontUrl} fontSize={0.26} color={HANDOFF_COLOUR} anchorX="center">
              {handoffLabel}
            </Text>
          </Billboard>
        </group>
      )}

      {planes.map((plane) => (
        <group key={plane.platform} position={[0, 0, plane.z]}>
          {/* The plane's own baseline: it starts where the platform starts and
              stops where it stops, so the handoff shows as one baseline ending
              and another carrying on rather than as a joined line. */}
          <Line
            points={[
              [plane.x0, 0, 0],
              [plane.x1, 0, 0],
            ]}
            color="#4b5a51"
            lineWidth={1.5}
          />
          <Billboard position={[plane.x0, -0.42, 0]}>
            <Text font={fontUrl} fontSize={0.26} color={readToken("--color-text", "#e8efe9")} anchorX="left">
              {`${plane.platform} | own scale ${plane.rMin}-${plane.rMax}`}
            </Text>
          </Billboard>
          {plane.ribbons.map((r) => (
            <group key={r.format} position={[0, 0, r.z]}>
              <mesh>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[r.positions, 3]} />
                  <bufferAttribute attach="attributes-color" args={[r.colours, 3]} />
                  <bufferAttribute attach="index" args={[r.indices, 1]} />
                </bufferGeometry>
                <meshBasicMaterial
                  vertexColors
                  transparent
                  opacity={0.28}
                  side={DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <Line points={r.edge} color={r.colour} lineWidth={2} />
              {/* Each ribbon states its own range — the scales differ, so they
                  are written out rather than left to the geometry to imply. */}
              <Billboard position={[r.end[0] + 0.25, r.end[1], 0]}>
                <Text font={fontUrl} fontSize={0.22} color={r.colour} anchorX="left">
                  {`${r.format} ${r.min}-${r.max}`}
                </Text>
              </Billboard>
            </group>
          ))}
        </group>
      ))}
    </Canvas>
  );
}
