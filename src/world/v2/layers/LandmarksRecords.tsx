/**
 * Landmarks & records — deepmal, stepping stones, employer ghats, hero
 * stones, room chhatris, old town (P3-01f, world-v2-spec.md#5 rows
 * 11-14/17/18). A self-registering `layers.ts` canvas layer: `WorldV2.tsx`
 * mounts `<layer.Component />` with zero props (`layers.ts`'s own contract,
 * matching `Terrain`/`Water`), so every input this file needs — the
 * ledger, the palette, reduced motion — is read directly, the same way
 * those sibling canvas modules already do.
 *
 * All placement/grouping/state comes from `recordBindings.ts` (pure); this
 * file only turns that data into a bounded set of `<Instances>` groups
 * (`GrammarInstances.tsx`'s own "one draw call per shape, not per feature"
 * discipline) plus one hidden DOM mirror for the e2e spec and the ledger's
 * hover wiring elsewhere — three.js meshes carry no attributes of their
 * own (`GrammarInstances.tsx`'s doc comment says the same).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Instance, Instances } from "@react-three/drei";
import type { LightProbe } from "three";
import { groundPosition } from "../terrainHeight.ts";
import { useTerrainHeight } from "../terrainSurface.tsx";
import { ledger } from "../ledger.ts";
import { recordBindings, stoneMaterial, type EmployerGhat, type HeroStone } from "../recordBindings.ts";
import type { DetailLink } from "../worldModel.ts";
import { useReveal } from "../reveal.ts";
import { prefersReducedMotion } from "../../reducedMotion.ts";
import { worldPalette } from "../../palette.ts";
import { bakeDeepmalLightProbe, drawCallsAttr } from "../lightProbe.ts";
import * as kit from "../kits/records.ts";

export const layer = { id: "landmarks-records", order: 40 };

/** Four corner pillars per chhatri — a fixed, four-pillar canopy is the
 *  shape every `ROOM_PLACEMENTS` entry gets; nothing here scales per room. */
const CHHATRI_PILLAR_OFFSETS: readonly (readonly [number, number])[] = [
  [0.7, 0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [-0.7, -0.7],
];

/** The spec's own "opens" contract (world-v2-spec §5 preamble): `project`
 *  goes to its project page, `home-anchor` to its section on the homepage,
 *  `route` (pr-stone's own PR URLs today) opens externally, `rel=noopener`
 *  per the table's own row 14. A plain top-level navigation rather than
 *  TanStack Router's `useNavigate` — this layer takes zero props and zero
 *  router context by `layers.ts`'s own contract, the same boundary
 *  `Hodi.tsx`'s sibling canvas modules already sit inside. */
function openDetailLink(link: DetailLink): void {
  if (typeof window === "undefined") return;
  if (link.kind === "project") window.location.assign(`/project/${link.target}`);
  else if (link.kind === "home-anchor") window.location.assign(`/#${link.target}`);
  else if (/^https?:\/\//.test(link.target)) window.open(link.target, "_blank", "noopener");
  else window.location.assign(link.target);
}

function GhatFlights({ ghat, palette, opacity }: { ghat: EmployerGhat; palette: ReturnType<typeof worldPalette>; opacity: number }) {
  const [gx, gy, gz] = ghat.pos;
  return (
    <group name={`employer-ghat:${ghat.company}`}>
      <mesh position={[gx, gy + 0.7, gz]}>
        <boxGeometry args={kit.GHAT_HOUSE_GEOMETRY_ARGS} />
        <meshStandardMaterial color={kit.ghatRoofColor()} roughness={0.85} transparent opacity={opacity} />
      </mesh>
      {ghat.flights.map((flight, i) => {
        const fx = gx + (i - (ghat.flights.length - 1) / 2) * 0.85;
        return (
          <group key={`${ghat.company}:flight:${i}`} position={[fx, gy, gz - 1.6]}>
            {Array.from({ length: flight.steps }, (_, s) => (
              <mesh key={s} position={[0, s * 0.14, -s * 0.2]}>
                <boxGeometry args={kit.GHAT_STEP_GEOMETRY_ARGS} />
                <meshStandardMaterial color={kit.ghatPlasterColor()} roughness={0.9} transparent opacity={opacity} />
              </mesh>
            ))}
            <mesh position={[0, flight.steps * 0.14 + 0.15, -flight.steps * 0.2 - 0.3]}>
              <boxGeometry args={kit.GHAT_LANDING_GEOMETRY_ARGS} />
              <meshStandardMaterial color={kit.flightLandingColor(flight.tier, palette)} roughness={0.8} transparent opacity={opacity} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function HeroStoneStele({ stone, palette, opacity }: { stone: HeroStone; palette: ReturnType<typeof worldPalette>; opacity: number }) {
  const [x, y, z] = stone.pos;
  return (
    <group
      name={`hero-stone:${stone.slug}`}
      position={[x, y + 0.8, z]}
      onClick={(e) => {
        e.stopPropagation();
        openDetailLink(stone.opens);
      }}
    >
      <mesh>
        <boxGeometry args={kit.HERO_STONE_GEOMETRY_ARGS} />
        <meshStandardMaterial color={kit.heroStoneColor()} roughness={0.75} transparent opacity={opacity} />
      </mesh>
      {Array.from({ length: stone.registers }, (_, i) => (
        <mesh key={i} position={[0, -0.6 + i * 0.22, 0.14]}>
          <boxGeometry args={kit.HERO_REGISTER_GEOMETRY_ARGS} />
          <meshStandardMaterial color={kit.heroRegisterColor(palette)} roughness={0.6} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

export default function LandmarksRecords() {
  const palette = worldPalette();
  const reducedMotion = prefersReducedMotion();
  const heightAt = useTerrainHeight();
  const rawBindings = useMemo(() => recordBindings(ledger), []);
  const bindings = useMemo(() => {
    const placed = <T extends { pos: readonly number[] }>(items: readonly T[]) => items.map((item) => ({ ...item, pos: groundPosition(item.pos, heightAt) }));
    return {
    ...rawBindings,
    deepmal: { ...rawBindings.deepmal, niches: placed(rawBindings.deepmal.niches), centroid: groundPosition(rawBindings.deepmal.centroid, heightAt) },
    steppingStones: { ...rawBindings.steppingStones, stones: placed(rawBindings.steppingStones.stones), cairns: placed(rawBindings.steppingStones.cairns) },
    weirs: placed(rawBindings.weirs), employerGhats: placed(rawBindings.employerGhats),
    heroStones: placed(rawBindings.heroStones), roomChhatris: placed(rawBindings.roomChhatris),
    oldTown: placed(rawBindings.oldTown), benchmarks: placed(rawBindings.benchmarks),
    };
  }, [rawBindings, heightAt]);
  const [opacity, setOpacity] = useState(reducedMotion ? 1 : 0);
  useReveal(true, reducedMotion, setOpacity);

  const probeRef = useRef<LightProbe | null>(null);
  const bakedRef = useRef(false);
  const [drawCalls, setDrawCalls] = useState("0");
  const { gl, scene } = useThree();

  // L2 (visual-catalogue.md#L2): one CubeCamera bake, after this layer has
  // placed its lit niches, never one probe per niche.
  useEffect(() => {
    if (bakedRef.current || bindings.deepmal.niches.length === 0) return;
    bakedRef.current = true;
    let cancelled = false;
    bakeDeepmalLightProbe(gl, scene, bindings.deepmal.centroid)
      .then((probe) => {
        if (cancelled) return;
        probeRef.current = probe;
        scene.add(probe);
      })
      .catch(() => {
        // No probe is a dimmer deepmal, never a crash — the fixed
        // ambient/directional lights already in the scene still light it.
      });
    return () => {
      cancelled = true;
      if (probeRef.current) scene.remove(probeRef.current);
    };
  }, [gl, scene, bindings.deepmal.centroid, bindings.deepmal.niches.length]);

  // Mirrors renderer.info.render.calls into the hidden DOM node — the same
  // "world state also lands on a real DOM node" idiom GrammarInstancesDom
  // uses, throttled to every 30th frame since it's diagnostic, not driving
  // render (G12's own reduced-motion posture applies equally to a needless
  // per-frame setState).
  const frameCount = useRef(0);
  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % 30 !== 0) return;
    setDrawCalls(drawCallsAttr(gl.info));
  });

  const stones = bindings.steppingStones.stones;
  const cairns = bindings.steppingStones.cairns;
  const submerged = bindings.steppingStones.submerged;

  return (
    <group name="landmarks-records">
      {/* Deepmal — fleet niches, rings of 12, era-banded */}
      <Instances limit={Math.max(1, bindings.deepmal.niches.length)} range={bindings.deepmal.niches.length}>
        <cylinderGeometry args={kit.NICHE_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.7} transparent opacity={opacity} />
        {bindings.deepmal.niches.map((n) => (
          <Instance key={n.id} position={n.pos} scale={kit.nicheScale(n.lit)} color={kit.nicheColor(n.lit, n.eraKey, palette)} />
        ))}
      </Instances>

      {/* Stepping stones — merged PRs, grouped by org */}
      <Instances limit={Math.max(1, stones.length)} range={stones.length}>
        <boxGeometry args={kit.STONE_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.9} transparent opacity={opacity} />
        {stones.map((s) => (
          <Instance
            key={s.id}
            position={s.pos}
            color={kit.stoneOrRecurrenceColor(stoneMaterial(s.org), s.recurrence, palette)}
            onClick={
              s.opens
                ? (e) => {
                    e.stopPropagation();
                    openDetailLink(s.opens as DetailLink);
                  }
                : undefined
            }
          />
        ))}
      </Instances>

      {/* Cairns — non-itemised merges folded per org */}
      <Instances limit={Math.max(1, cairns.length)} range={cairns.length}>
        <boxGeometry args={kit.CAIRN_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.95} transparent opacity={opacity} />
        {cairns.map((c) => (
          <Instance key={`${c.org}:cairn`} position={c.pos} color={kit.stoneColor(stoneMaterial(c.org), palette)} />
        ))}
      </Instances>

      {/* Submerged stones — open PRs, never walkable (rendered below the
          waterline, never clickable to a destination it hasn't merged) */}
      <Instances limit={Math.max(1, submerged.length)} range={submerged.length}>
        <boxGeometry args={kit.SUBMERGED_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.6} transparent opacity={opacity * 0.7} />
        {submerged.map((s, i) => (
          <Instance key={s.id} position={[6 + i * 1.1, -0.3, 40]} color={kit.submergedColor(palette)} />
        ))}
      </Instances>

      {/* Weirs — one per employer, at its earliest entry */}
      <Instances limit={Math.max(1, bindings.weirs.length)} range={bindings.weirs.length}>
        <boxGeometry args={kit.WEIR_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.85} transparent opacity={opacity} />
        {bindings.weirs.map((w) => (
          <Instance key={w.company} position={w.pos} color={kit.weirColor(palette)} />
        ))}
      </Instances>

      {/* Employer ghats — riverside houses + flights, hover-only, never
          clickable (no onClick anywhere in this group). */}
      {bindings.employerGhats.map((ghat) => (
        <GhatFlights key={ghat.company} ghat={ghat} palette={palette} opacity={opacity} />
      ))}

      {/* Hero stones — case-study vīragal, one carved register per
          approach step, each opens its case study. */}
      {bindings.heroStones.map((stone) => (
        <HeroStoneStele key={stone.slug} stone={stone} palette={palette} opacity={opacity} />
      ))}

      {/* Room chhatris — one per ROOM_PLACEMENTS entry */}
      {bindings.roomChhatris.map((c) => (
        <group key={c.to} name={`room-chhatri:${c.to}`} position={c.pos}>
          {CHHATRI_PILLAR_OFFSETS.map(([px, pz], i) => (
            <mesh key={i} position={[px, 1.1, pz]}>
              <cylinderGeometry args={kit.CHHATRI_PILLAR_GEOMETRY_ARGS} />
              <meshStandardMaterial color={kit.chhatriStoneColor(palette)} roughness={0.7} transparent opacity={opacity} />
            </mesh>
          ))}
          <mesh position={[0, 2.3, 0]}>
            <coneGeometry args={kit.CHHATRI_DOME_GEOMETRY_ARGS} />
            <meshStandardMaterial color={kit.chhatriStoneColor(palette)} roughness={0.6} transparent opacity={opacity} />
          </mesh>
        </group>
      ))}

      {/* Old town Excelsior — one printing house per writing.archive era */}
      <Instances limit={Math.max(1, bindings.oldTown.length)} range={bindings.oldTown.length}>
        <boxGeometry args={kit.OLD_TOWN_HOUSE_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.9} transparent opacity={opacity} />
        {bindings.oldTown.map((h) => (
          <Instance key={h.eraKey} position={h.pos} scale={[1, kit.oldTownHeight(h.pieceCount), 1]} color={kit.oldTownColor(palette)} />
        ))}
      </Instances>

      {/* Benchmarks — survey plaques (G12) */}
      <Instances limit={Math.max(1, bindings.benchmarks.length)} range={bindings.benchmarks.length}>
        <boxGeometry args={kit.BENCHMARK_GEOMETRY_ARGS} />
        <meshStandardMaterial roughness={0.5} transparent opacity={opacity} />
        {bindings.benchmarks.map((b) => (
          <Instance key={b.id} position={b.pos} color={kit.benchmarkColor(palette)} />
        ))}
      </Instances>

      <Html>
        <div aria-hidden="true" className="sr-only" data-landmarks-records data-draw-calls={drawCalls}>
          <span data-deepmal-lit={bindings.deepmal.lit} data-deepmal-total={bindings.deepmal.total} />
          <span
            data-stones-career-ops={bindings.steppingStones.countsByOrg["career-ops-hq"] ?? 0}
            data-stones-openmf={bindings.steppingStones.countsByOrg.openMF ?? 0}
            data-stones-submerged={bindings.steppingStones.submergedCount}
          />
          {bindings.employerGhats.map((g) => (
            // No `data-opens` on purpose: employer ghats are non-clickable,
            // hover-label only (world-v2-spec §5 row 11's own "opens" cell).
            <span key={g.company} data-employer-ghat={g.company} data-employer-flights={g.flights.length} />
          ))}
          {bindings.heroStones.map((h) => (
            <span key={h.slug} data-hero-stone={h.slug} data-opens={h.opens.kind} data-registers={h.registers} />
          ))}
        </div>
      </Html>
    </group>
  );
}
