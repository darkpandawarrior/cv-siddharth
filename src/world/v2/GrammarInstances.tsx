/**
 * Placeholder-grammar instances (this lane's own task list): every
 * `Feature` in a `WorldModel` whose `form` no `kits.ts` entry claims yet is
 * drawn as one of three coarse instanced primitives — a basalt box, a kite
 * quad or a niche ring (visual-catalogue.md's own placeholder language) —
 * grouped one `<Instances>` per shape so an arbitrarily large ledger still
 * costs three draw calls, not one mesh per feature.
 *
 * `reveal.ts`'s fade is a real kit's job (C4: "per-object fade as tier-B
 * assets resolve") — a placeholder itself has nothing to resolve FROM, so
 * this file does not call `useReveal`; the first kit that swaps a
 * placeholder for a real GLB is what wraps its own load in it.
 * ponytail: wire `useReveal` in here too the day this file needs to hide a
 * genuine pop (a large batch of features appearing at once, say, on a
 * cache-cold load) — nothing about `reveal.ts`'s contract needs to change
 * for that, it just needs a caller.
 *
 * A hidden DOM mirror (`GrammarInstancesDom`, mounted by `HudV2.tsx` as a
 * sibling of the `aria-hidden` Canvas, the same "world state also lands on
 * a real DOM node" idiom `Hud.tsx`'s own `data-reality-rain` span uses) is
 * what lets `LedgerPanel.tsx`'s row hover and the e2e spec address a
 * feature by `data-rule` without reading back WebGL pixels — three.js
 * meshes carry no DOM attributes of their own.
 */
import { useMemo, type ReactNode } from "react";
import { Instance, Instances } from "@react-three/drei";
import { isKitted } from "./kits.ts";
import { worldPalette } from "../palette.ts";
import type { Feature, WorldModel } from "./worldModel.ts";

type Shape = "box" | "kite" | "ring";

/** Coarse, name-based classification — the whole point of a placeholder is
 *  that it costs no per-form authoring; a real kit (kits.ts) replaces the
 *  shape entirely once one claims the form. */
function shapeFor(form: string): Shape {
  if (/kite/i.test(form)) return "kite";
  if (/niche|ring|deepmal|baori|well/i.test(form)) return "ring";
  return "box";
}

const STATE_COLOR: Readonly<Record<Feature["state"], keyof ReturnType<typeof worldPalette>>> = {
  lit: "signal",
  peak: "accent",
  unmeasured: "line",
  dark: "surface",
  reserved: "line",
};

/** A gentle, deterministic scale from `scalar` (a rule's own height/weight
 *  figure) — clamped so an outlier data point never produces a degenerate
 *  or a screen-filling instance. Placeholder geometry, placeholder scale
 *  math: a real kit decides its own. */
function scaleFor(scalar: number): number {
  if (!Number.isFinite(scalar) || scalar <= 0) return 1;
  return Math.min(4, Math.max(0.6, 1 + Math.log2(1 + scalar) / 6));
}

function unclaimedFeatures(worldModel: WorldModel): Feature[] {
  return worldModel.features.filter((f) => !isKitted(f.form));
}

function groupByShape(features: readonly Feature[]): Record<Shape, Feature[]> {
  const groups: Record<Shape, Feature[]> = { box: [], kite: [], ring: [] };
  for (const f of features) groups[shapeFor(f.form)].push(f);
  return groups;
}

function ShapeGroup({
  features,
  geometry,
  materialSide,
  palette,
  highlightedRule,
}: {
  features: readonly Feature[];
  geometry: ReactNode;
  materialSide?: 0 | 1 | 2;
  palette: ReturnType<typeof worldPalette>;
  highlightedRule: string | null;
}) {
  return (
    <Instances limit={Math.max(1, features.length)} range={features.length}>
      {geometry}
      <meshStandardMaterial roughness={0.8} side={materialSide} />
      {features.map((f) => {
        const highlighted = f.rule === highlightedRule;
        const scale = scaleFor(f.scalar) * (highlighted ? 1.15 : 1);
        return <Instance key={f.id} position={f.pos} scale={scale} color={palette[STATE_COLOR[f.state]]} />;
      })}
    </Instances>
  );
}

export interface GrammarInstancesProps {
  worldModel: WorldModel;
  highlightedRule: string | null;
}

export function GrammarInstances({ worldModel, highlightedRule }: GrammarInstancesProps) {
  const palette = worldPalette();
  const unclaimed = useMemo(() => unclaimedFeatures(worldModel), [worldModel]);
  const groups = useMemo(() => groupByShape(unclaimed), [unclaimed]);

  return (
    <group name="grammar-instances">
      <ShapeGroup features={groups.box} geometry={<boxGeometry args={[1, 1, 1]} />} palette={palette} highlightedRule={highlightedRule} />
      <ShapeGroup features={groups.kite} geometry={<planeGeometry args={[1, 0.6]} />} materialSide={2} palette={palette} highlightedRule={highlightedRule} />
      <ShapeGroup features={groups.ring} geometry={<torusGeometry args={[0.6, 0.15, 8, 16]} />} palette={palette} highlightedRule={highlightedRule} />
    </group>
  );
}

export interface GrammarInstancesDomProps {
  worldModel: WorldModel;
  highlightedRule: string | null;
}

/**
 * The hidden DOM mirror: one visually-hidden node per rendered feature,
 * `data-rule` set to the feature's rule id and `data-highlighted` toggled by
 * the ledger's own hover state — living-ledger-spec §7.2's "hovering a row
 * outlines every bound feature." Mounted by `HudV2.tsx` outside the
 * `aria-hidden` Canvas subtree, the same "world state also lands on a real
 * DOM node" idiom this codebase already ships (`Hud.tsx`'s
 * `data-reality-rain` span). `aria-hidden` here too: this list exists for
 * hover-highlight wiring and for tests, not for a screen reader — the
 * world's whole accessible surface is `HudV2.tsx`'s cards and
 * `LandmarkList.tsx`'s real buttons.
 */
export function GrammarInstancesDom({ worldModel, highlightedRule }: GrammarInstancesDomProps) {
  const unclaimed = useMemo(() => unclaimedFeatures(worldModel), [worldModel]);
  return (
    <div aria-hidden="true" className="sr-only">
      {unclaimed.map((f) => (
        <span key={f.id} data-rule={f.rule} data-feature-id={f.id} data-highlighted={f.rule === highlightedRule} />
      ))}
    </div>
  );
}
