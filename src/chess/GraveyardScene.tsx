import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, OrbitControls, Text } from "@react-three/drei";
import { Color, MathUtils } from "three";
import type { Mesh } from "three";
// Same reasoning as ChessArcScene: troika fetches a fallback font from a CDN
// for any glyph its font lacks, so the font ships in the bundle and every
// in-canvas string stays ASCII.
import fontUrl from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";

/**
 * The Graveyard — 64 extruded columns over a chessboard, one per square, each
 * as tall (and as bright) as the number of games whose *final* position had a
 * piece standing there.
 *
 * Index 0 is a1 and 63 is h8, the convention `squareMatrix` fixed in the
 * generator, so this file does the one mapping and nothing re-derives it.
 * Heights are normalised against the maximum of the matrix currently shown —
 * wins and losses have different maxima, and normalising both against one
 * number would make the smaller board look emptier than it is rather than
 * differently shaped, which is the comparison worth seeing.
 *
 * The board is chess.com's games alone; lichess's export carries no FEN. The
 * caption in the room says so — this scene must never look like the whole
 * corpus.
 */

const FILES = "abcdefgh";
const TILE = 1;
const MAX_H = 2.2;
const MIN_H = 0.06;

export type GraveyardView = "losses" | "wins";

/** Colour per matrix. Never the only signal — the pane's toggle carries
 *  `aria-pressed` and a written label, and the scene writes the view out too. */
const VIEW_COLOUR: Record<GraveyardView, string> = {
  losses: "#f0883e",
  wins: "#3ddc84",
};

function Column({
  index,
  height,
  glow,
  colour,
  reduced,
}: {
  index: number;
  height: number;
  glow: number;
  colour: string;
  reduced: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  const x = (index % 8) - 3.5;
  const z = 3.5 - Math.floor(index / 8);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    // Reduced motion gets the same information, arrived at instantly.
    const next = reduced ? height : MathUtils.damp(m.scale.y, height, 6, delta);
    m.scale.y = next;
    m.position.y = next / 2;
  });

  return (
    <mesh ref={mesh} position={[x, height / 2, z]} scale={[1, height, 1]}>
      <boxGeometry args={[TILE * 0.82, 1, TILE * 0.82]} />
      {/* Opaque on purpose: 64 translucent columns overlap into a fog that
          hides exactly the height differences the scene exists to show. Heat
          is carried by tint and emissive together, and by the height itself. */}
      <meshStandardMaterial
        color={new Color("#151d19").lerp(new Color(colour), 0.2 + glow * 0.8)}
        emissive={colour}
        emissiveIntensity={0.05 + glow * 0.9}
        roughness={0.5}
        metalness={0.1}
      />
    </mesh>
  );
}

export default function GraveyardScene({
  counts,
  view,
  reduced,
}: {
  /** 64 occupancy counts, index 0 = a1 … 63 = h8. */
  counts: number[];
  view: GraveyardView;
  reduced: boolean;
}) {
  const max = Math.max(1, ...counts);
  const colour = VIEW_COLOUR[view];

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 8.6, 12.4], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      frameloop={reduced ? "demand" : "always"}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[5, 9, 6]} intensity={90} color="#e8efe9" />
      <OrbitControls
        autoRotate={!reduced}
        autoRotateSpeed={0.3}
        enableDamping={!reduced}
        enablePan={false}
        minDistance={7}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 0.6, 0]}
      />

      {/* The board itself, so the columns read as squares rather than as bars. */}
      {counts.map((_, i) => (
        <mesh key={`tile-${i}`} position={[(i % 8) - 3.5, -0.01, 3.5 - Math.floor(i / 8)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TILE, TILE]} />
          <meshBasicMaterial color={(i + Math.floor(i / 8)) % 2 === 0 ? "#141a17" : "#1e2823"} />
        </mesh>
      ))}

      {counts.map((n, i) => {
        const norm = n / max;
        return (
          <Column
            key={i}
            index={i}
            height={MIN_H + norm * MAX_H}
            glow={norm}
            colour={colour}
            reduced={reduced}
          />
        );
      })}

      {/* Files and ranks written out — the board should be readable by someone
          who has never used algebraic notation. */}
      {FILES.split("").map((f, i) => (
        <Billboard key={f} position={[i - 3.5, 0.12, 5]}>
          <Text font={fontUrl} fontSize={0.34} color="#8b909a" anchorX="center">
            {f}
          </Text>
        </Billboard>
      ))}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
        <Billboard key={r} position={[-5, 0.12, 3.5 - (r - 1)]}>
          <Text font={fontUrl} fontSize={0.34} color="#8b909a" anchorX="center">
            {String(r)}
          </Text>
        </Billboard>
      ))}

      {/* Which matrix is on screen, stated in the scene as well as in the room,
          so the colour is never the only thing carrying it. */}
      <Billboard position={[0, MAX_H + 1.9, 0]}>
        <Text font={fontUrl} fontSize={0.36} color={colour} anchorX="center">
          {`${view} | tallest square ${max} games`}
        </Text>
      </Billboard>
    </Canvas>
  );
}
