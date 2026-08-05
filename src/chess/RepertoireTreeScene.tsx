import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { DoubleSide, MathUtils } from "three";
import type { Group } from "three";
// As in the other two scenes: troika would otherwise fetch a fallback font
// from a CDN, so the font is bundled and every in-canvas string is ASCII.
import fontUrl from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";
import { pct, shareSeries, type PlatformKey, type RepYear } from "./repertoireModel.ts";
import { readToken } from "../themeColor";

/**
 * The repertoire as Black, in two pieces that are never joined.
 *
 * **Rail** (low): for the two lines whose share moved most, one bar per
 * platform-year, height = share of that platform-year's Black games. Never raw
 * counts — the platforms are different sizes and different eras, so counts
 * would draw the platform change rather than the repertoire change.
 *
 * **Tree** (high): the scrubbed year's actual repertoire, one hub per platform
 * that year, branches sized by share.
 *
 * Each platform keeps its own lane in Z, its own colour *and* its own node
 * shape, and the January 2023 handoff is drawn as a wall between the two
 * halves. Nothing is ever drawn as one line across it: the Scandinavian's fall
 * on lichess and its return on chess.com are two within-platform observations
 * that happen to sit either side of a change of site, and a viewer must be
 * able to see that.
 *
 * A platform-year the generator marked `thin` renders as a flat grey plate
 * labelled "thin" — no height, no percentage. A 9-game sample gets no voice.
 */

const YEAR_GAP = 1.6;
const RAIL_H = 2.2;
const LANE_Z = 1.5;
/** Z separates the two tracked lines, one row each. Platform is carried by
 *  colour *and* shape *and* the wall at the handoff — putting platform on Z as
 *  well split every row in two and made both unreadable from most angles. */
const ROW_GAP = 2.2;
const TREE_Y = 5.2;
const BRANCH_R = 1.55;
const TREE_MAX_BRANCHES = 6;

const PLATFORM_STYLE: Record<PlatformKey, { colour: string; label: string }> = {
  lichess: { colour: "#5ee6ff", label: "lichess" },
  chesscom: { colour: "#3ddc84", label: "chess.com" },
};

const THIN_COLOUR = "#6b7280";

const laneZ = (key: PlatformKey) => (key === "lichess" ? -LANE_Z : LANE_Z);

/** A rail bar. Box for lichess, cylinder for chess.com — the platforms differ
 *  in shape as well as colour, so the split never rests on hue alone. */
function Bar({
  position,
  height,
  colour,
  round,
}: {
  position: [number, number, number];
  height: number;
  colour: string;
  round: boolean;
}) {
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]}>
      {round ? (
        <cylinderGeometry args={[0.21, 0.21, height, 12]} />
      ) : (
        <boxGeometry args={[0.4, height, 0.4]} />
      )}
      <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.5} roughness={0.5} />
    </mesh>
  );
}

/** A tree node that grows in when the year changes — instantly under reduced
 *  motion, which still leaves the scrubber fully usable. */
function Node({
  position,
  radius,
  colour,
  round,
  reduced,
}: {
  position: [number, number, number];
  radius: number;
  colour: string;
  round: boolean;
  reduced: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.scale.setScalar(reduced ? 1 : MathUtils.damp(g.scale.x, 1, 7, delta));
  });
  return (
    <group ref={group} position={position} scale={reduced ? 1 : 0.001}>
      <mesh>
        {round ? <sphereGeometry args={[radius, 20, 20]} /> : <octahedronGeometry args={[radius, 0]} />}
        <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={1.1} roughness={0.4} />
      </mesh>
    </group>
  );
}

export default function RepertoireTreeScene({
  years,
  focus,
  selected,
  handoffYear,
  reduced,
}: {
  years: RepYear[];
  /** The two lines the rail tracks, derived from the data, not chosen by hand. */
  focus: string[];
  selected: string;
  handoffYear: string | null;
  reduced: boolean;
}) {
  const x = useMemo(() => {
    const n = years.length;
    return (i: number) => (i - (n - 1) / 2) * YEAR_GAP;
  }, [years.length]);

  const rows = useMemo(
    () => focus.map((name, k) => ({ name, series: shareSeries(years, name), z: (k - (focus.length - 1) / 2) * ROW_GAP })),
    [focus, years],
  );

  const selectedIndex = Math.max(0, years.findIndex((y) => y.year === selected));
  const selectedYear = years[selectedIndex];
  const handoffIndex = handoffYear ? years.findIndex((y) => y.year === handoffYear) : -1;
  const handoffX = handoffIndex > 0 ? (x(handoffIndex) + x(handoffIndex - 1)) / 2 : null;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 6.6, 12.6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      frameloop={reduced ? "demand" : "always"}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 8, 8]} intensity={70} color={readToken("--color-text", "#e8efe9")} />
      <OrbitControls
        autoRotate={!reduced}
        autoRotateSpeed={0.25}
        enableDamping={!reduced}
        enablePan={false}
        minDistance={8}
        maxDistance={26}
        maxPolarAngle={Math.PI / 2 + 0.05}
        target={[0, 2.2, 0]}
      />

      {/* ---- the rail: every platform-year, both tracked lines ---- */}
      {years.map((y, i) => (
        <Billboard key={`year-${y.year}`} position={[x(i), -0.5, ROW_GAP]}>
          <Text font={fontUrl} fontSize={0.26} color={y.year === selected ? "#e8efe9" : "#8b909a"} anchorX="center">
            {y.year}
          </Text>
        </Billboard>
      ))}

      {rows.map((row) =>
        row.series.map((p) => {
          const i = years.findIndex((y) => y.year === p.year);
          // Both platforms in one year (2021 and 2023 only) sit side by side
          // rather than on top of each other.
          const siblings = years[i].platforms;
          const nudge = siblings.length > 1 ? (siblings.findIndex((s) => s.key === p.key) - 0.5) * 0.5 : 0;
          const bx = x(i) + nudge;
          const style = PLATFORM_STYLE[p.key];
          const round = p.key === "chesscom";
          if (p.thin) {
            return (
              <group key={`${row.name}-${p.year}-${p.key}`}>
                <Bar position={[bx, 0, row.z]} height={0.05} colour={THIN_COLOUR} round={round} />
                <Billboard position={[bx, 0.32, row.z]}>
                  <Text font={fontUrl} fontSize={0.17} color={THIN_COLOUR} anchorX="center">
                    {`thin n=${p.blackGames}`}
                  </Text>
                </Billboard>
              </group>
            );
          }
          const share = p.share ?? 0;
          // Only the ends of each platform's run are labelled — the arc is
          // "41.1% down to 0.2%", and labelling every bar buries it in text.
          // The opening end also names its platform, so the rail says which
          // site each run belongs to without a legend.
          const run = row.series.filter((q) => q.key === p.key && !q.thin);
          const first = run.length > 1 && run[0].year === p.year;
          const last = run.length > 1 && run[run.length - 1].year === p.year;
          return (
            <group key={`${row.name}-${p.year}-${p.key}`}>
              <Bar position={[bx, 0, row.z]} height={0.03 + share * RAIL_H} colour={style.colour} round={round} />
              {(first || last) && (
                <Billboard position={[bx, 0.35 + share * RAIL_H, row.z]}>
                  <Text font={fontUrl} fontSize={0.19} color={style.colour} anchorX="center">
                    {first ? `${style.label} ${pct(p.share)}` : pct(p.share)}
                  </Text>
                </Billboard>
              )}
            </group>
          );
        }),
      )}

      {/* One label per row: which opening this run of bars is. */}
      {rows.map((row) => (
        <Billboard key={`row-${row.name}`} position={[x(0) - 1.5, 0.55, row.z]}>
          <Text font={fontUrl} fontSize={0.22} color={readToken("--color-text", "#e8efe9")} anchorX="right">
            {row.name}
          </Text>
        </Billboard>
      ))}

      {/* The scrubbed year, marked on the rail so the tree above is anchored. */}
      <Line
        points={[
          [x(selectedIndex), 0, -ROW_GAP],
          [x(selectedIndex), 0, ROW_GAP],
        ]}
        color={readToken("--color-text", "#e8efe9")}
        lineWidth={1.5}
      />

      {/* ---- the handoff: a wall, not a hinge ---- */}
      {handoffX !== null && (
        <group>
          <mesh position={[handoffX, RAIL_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[(LANE_Z + 1.2) * 2, RAIL_H * 1.4]} />
            <meshBasicMaterial color={readToken("--color-warn", "#f0883e")} transparent opacity={0.12} side={DoubleSide} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [handoffX, 0, 0],
              [handoffX, RAIL_H * 1.5, 0],
            ]}
            color={readToken("--color-warn", "#f0883e")}
            lineWidth={2}
            dashed
            dashSize={0.14}
            gapSize={0.1}
          />
          <Billboard position={[handoffX, RAIL_H * 1.4, 0]}>
            <Text font={fontUrl} fontSize={0.24} color={readToken("--color-warn", "#f0883e")} anchorX="center">
              {`handoff -> chess.com ${handoffYear}`}
            </Text>
          </Billboard>
        </group>
      )}

      {/* ---- the tree: the scrubbed year's repertoire, one hub per platform ---- */}
      {selectedYear?.platforms.map((slice, si, all) => {
        const style = PLATFORM_STYLE[slice.key];
        const round = slice.key === "chesscom";
        const z = laneZ(slice.key) * 1.6;
        // Two platforms in one year stand side by side as well as on separate
        // Z lanes — stacked at the same X their labels became unreadable, and
        // reading the two repertoires against each other is the whole point of
        // the years where both exist.
        const hubX = all.length > 1 ? (si - (all.length - 1) / 2) * 6.6 : 0;
        const hub: [number, number, number] = [hubX, TREE_Y, z];
        const shown = slice.openings.slice(0, TREE_MAX_BRANCHES);
        return (
          <group key={`tree-${slice.key}`}>
            <Node position={hub} radius={0.26} colour={style.colour} round={round} reduced={reduced} />
            <Billboard position={[hubX, TREE_Y - 0.6, z]}>
              <Text font={fontUrl} fontSize={0.24} color={style.colour} anchorX="center">
                {`${style.label} ${selected} | ${slice.blackGames} games as Black${slice.thin ? " | thin" : ""}`}
              </Text>
            </Billboard>
            {shown.map((o, i) => {
              const angle = Math.PI * (0.92 - (i / Math.max(1, shown.length - 1)) * 0.84);
              const r = BRANCH_R * (i % 2 === 0 ? 1 : 0.78);
              const p: [number, number, number] = [
                hub[0] + Math.cos(angle) * r * 1.15,
                hub[1] + Math.sin(angle) * r,
                z,
              ];
              const share = o.share ?? 0;
              const tracked = focus.includes(o.name);
              return (
                <group key={`${slice.key}-${o.name}`}>
                  <Line
                    points={[hub, p]}
                    color={style.colour}
                    lineWidth={1 + share * 5}
                    transparent
                    opacity={tracked ? 0.95 : 0.4}
                  />
                  <Node
                    position={p}
                    radius={0.1 + share * 0.42}
                    colour={slice.thin ? THIN_COLOUR : style.colour}
                    round={round}
                    reduced={reduced}
                  />
                  <Billboard position={[p[0], p[1] + 0.42 + share * 0.4, z]}>
                    <Text
                      font={fontUrl}
                      fontSize={tracked ? 0.22 : 0.18}
                      color={slice.thin ? THIN_COLOUR : tracked ? "#e8efe9" : "#8b909a"}
                      anchorX="center"
                    >
                      {`${o.name} ${slice.thin ? `n=${o.count}` : pct(o.share)}`}
                    </Text>
                  </Billboard>
                </group>
              );
            })}
          </group>
        );
      })}
    </Canvas>
  );
}
