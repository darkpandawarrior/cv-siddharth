/**
 * The kit registry (this lane's own task list): every real per-form model
 * under `src/world/v2/kits/*.ts` self-registers by exporting a `FormId` ->
 * kit-component map. A kit "claims" a form the day its file lands; until
 * then `GrammarInstances.tsx` draws every one of that form's features as an
 * instanced primitive placeholder (a basalt box, a kite quad, a niche
 * ring — visual-catalogue.md's own placeholder language).
 *
 * No kit exists yet in this phase (P2-07a-e's own GLB kits are a sibling,
 * concurrently-dispatched lane this one does not depend on, and every
 * phase-3 form kit is later still), so `KITS` is `{}` today — that is the
 * correct, honest state, not a stub to fill in: `GrammarInstances.tsx`'s
 * whole placeholder path exists BECAUSE this map starts empty.
 */
import type { ComponentType } from "react";
import type { FormId } from "./forms.ts";

export interface KitProps {
  /** The one feature this kit instance renders — its own position, state,
   *  label and date (worldModel.ts's `Feature`). A kit component decides
   *  its own geometry/material from `feature.state`/`feature.scalar`; it
   *  never re-derives placement, which `worldModel.ts` already owns. */
  feature: { id: string; pos: readonly [number, number, number]; scalar: number; state: string; label: string };
}

type KitModule = { default?: ComponentType<KitProps>; kit?: { form: FormId } };

/** `FormId -> the kit component that claims it`. A malformed file under
 *  `kits/` (missing `default` or `kit`) is skipped, the same posture
 *  `layers.ts`'s `resolveLayers` takes for a stray file under `layers/`. */
function resolveKits(modules: Record<string, KitModule>): Readonly<Record<FormId, ComponentType<KitProps>>> {
  const kits: Record<FormId, ComponentType<KitProps>> = {};
  for (const mod of Object.values(modules)) {
    if (!mod.default || !mod.kit) continue;
    kits[mod.kit.form] = mod.default;
  }
  return kits;
}

const kitModules = import.meta.glob<KitModule>("./kits/*.ts", { eager: true });

export const KITS: Readonly<Record<FormId, ComponentType<KitProps>>> = resolveKits(kitModules);

/** True once a real kit has claimed `form` — GrammarInstances.tsx's own
 *  branch between "mount the real kit" and "draw the placeholder". */
export function isKitted(form: FormId): boolean {
  return form in KITS;
}
