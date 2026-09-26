/**
 * The layer registry (this lane's own task list, master-plan.md#M56): every
 * canvas layer under `src/world/v2/layers/*.tsx` and every HUD layer under
 * `src/world/v2/hud/*.tsx` self-registers by exporting `default Component`
 * and `export const layer = { id, order }`. `WorldV2.tsx` mounts both lists,
 * sorted by `order`, so a phase-3/4 lane adds a file to one of those two
 * directories and never has to edit this hub (the contract P2-10b's own
 * `AltitudeRailV2.tsx` — a HUD layer arriving from a sibling lane — also
 * follows).
 *
 * `resolveLayers` is the pure core: given whatever `import.meta.glob`
 * handed back (a path -> module map), it validates and sorts. Kept
 * separate from the glob call itself so `layers.test.ts` can hand it a
 * fixture module map directly rather than depending on a real file
 * existing on disk under `layers/` — no phase-3 layer exists yet, so the
 * real glob below returns `{}` today, and that is the correct, honest
 * state for this lane (GrammarInstances.tsx draws every placeholder in
 * the meantime).
 */
import type { ComponentType } from "react";

export type LayerKind = "canvas" | "hud";

export interface LayerModule {
  id: string;
  order: number;
}

export interface Layer {
  id: string;
  order: number;
  kind: LayerKind;
  /** The glob path this layer came from — surfaced for a duplicate-id error
   *  message and for tests, never rendered. */
  path: string;
  Component: ComponentType;
}

type GlobModule = { default?: ComponentType; layer?: LayerModule };
type GlobResult = Record<string, GlobModule>;

/**
 * Validates and sorts one glob's worth of layer modules. A module missing
 * `default` or `layer` (a stray non-conforming file under the directory)
 * is skipped rather than thrown on — the same "not written correctly yet
 * doesn't crash the hub" posture as this lane's other "not written yet ->
 * skip" conventions, since a malformed layer file is a build-time typo a
 * PR review catches, not a runtime condition this hub needs to survive by
 * hiding it. Two layers sharing an `id` is a real authoring mistake
 * (whichever renders last would silently shadow the other), so THAT throws.
 */
export function resolveLayers(modules: GlobResult, kind: LayerKind): Layer[] {
  const layers: Layer[] = [];
  const seenIds = new Map<string, string>();
  for (const [path, mod] of Object.entries(modules)) {
    if (!mod.default || !mod.layer) continue;
    const { id, order } = mod.layer;
    const clash = seenIds.get(id);
    if (clash) throw new Error(`layers.ts: duplicate layer id "${id}" in ${clash} and ${path}`);
    seenIds.set(id, path);
    layers.push({ id, order, kind, path, Component: mod.default });
  }
  return layers.sort((a, b) => a.order - b.order);
}

const canvasModules = import.meta.glob<GlobModule>("./layers/*.tsx", { eager: true });
const hudModules = import.meta.glob<GlobModule>("./hud/*.tsx", { eager: true });

/** Every canvas layer (mounted inside `<Canvas>`), order-sorted. Empty
 *  today — the first one lands in phase 3. */
export const CANVAS_LAYERS: readonly Layer[] = resolveLayers(canvasModules, "canvas");

/** Every HUD layer (mounted as a DOM sibling of `<Canvas>`), order-sorted.
 *  `LandmarkPanelV2.tsx` and `LandmarkList.tsx` are this lane's own HUD
 *  pieces and are mounted directly by `HudV2.tsx` rather than through this
 *  glob — the glob is for layers OTHER lanes add without touching the hub
 *  (P2-10b's `AltitudeRailV2.tsx` is the first). */
export const HUD_LAYERS: readonly Layer[] = resolveLayers(hudModules, "hud");
