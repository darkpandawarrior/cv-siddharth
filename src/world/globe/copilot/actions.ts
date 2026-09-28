// LANE W12 ("Ask the globe" — command + AI co-pilot engine).
//
// The typed action vocabulary every source of globe commands emits: the
// deterministic parser (intents.ts, free, instant) and the LLM fallback
// (askLLM.ts -> api/_lib/globe-ask.ts -> validate.ts). execute.ts is the
// only consumer that applies these to the store. Plain data (no React, no
// three, no store import) so it is trivially unit-testable and safe to ship
// across the client/server boundary as JSON.
//
// `type` is the discriminant field, not `kind` — `select`'s own payload
// needs a field called `kind` (the SELECTION's category, e.g. "quake"),
// which would collide with a same-named discriminant on the same object.
import type { EarthStyle, GlobeView, LayerId } from "../globeStore.ts";

export interface FlyToAction {
  type: "flyTo";
  lat: number;
  lon: number;
  distance?: number;
}
export interface FlyToPlaceAction {
  type: "flyToPlace";
  query: string;
}
export interface FollowAction {
  type: "follow";
  entityId: string;
}
export interface SetLayerAction {
  type: "setLayer";
  id: LayerId;
  on: boolean;
}
export interface SetStyleAction {
  type: "setStyle";
  style: EarthStyle;
}
export type SetTimeAction = { type: "setTime"; offsetMin: number } | { type: "setTime"; isoDate: string };
export interface SelectAction {
  type: "select";
  kind: string;
  id: string;
}
export interface FilterAction {
  type: "filter";
  quakeMinMag?: number;
  quakeSinceHours?: number;
}
export interface SetViewAction {
  type: "setView";
  view: GlobeView;
}
export interface NarrateAction {
  type: "narrate";
  text: string;
}

export type GlobeAction =
  | FlyToAction
  | FlyToPlaceAction
  | FollowAction
  | SetLayerAction
  | SetStyleAction
  | SetTimeAction
  | SelectAction
  | FilterAction
  | SetViewAction
  | NarrateAction;

export type KnownActionType = GlobeAction["type"];

export const KNOWN_ACTION_TYPES: readonly KnownActionType[] = [
  "flyTo",
  "flyToPlace",
  "follow",
  "setLayer",
  "setStyle",
  "setTime",
  "select",
  "filter",
  "setView",
  "narrate",
];

/** A narrate action is shown to the visitor verbatim — bounded so a runaway
 *  model reply can't fill the ask box's answer area. */
export const NARRATE_MAX_CHARS = 280;

/** Extension point (brief: "a registry ... so the time-machine, story and
 *  explore lanes can add compare/story/search actions later without editing
 *  your files"). execute.ts falls back to a registered handler for any
 *  `type` outside the 10 kinds above (see execute.ts's default branch).
 *
 * ponytail: no other lane exists yet to register anything, and validate.ts
 * only allow-lists these 10 built-in kinds — a future lane adding a new
 * action type also has to widen validate.ts's allowlist; this registry only
 * gets its own action THROUGH once that happens. Building a generic,
 * schema-less pass-through validator for a shape nobody has defined yet
 * would be exactly the speculative abstraction ponytail forbids. Widen
 * validate.ts's KNOWN_ACTION_TYPES check when the first real consumer shows
 * up, not before. */
export type ActionHandler = (action: { type: string; [key: string]: unknown }) => void;
const registry = new Map<string, ActionHandler>();

export function registerActionHandler(type: string, fn: ActionHandler): void {
  registry.set(type, fn);
}
export function getActionHandler(type: string): ActionHandler | undefined {
  return registry.get(type);
}
/** Test-only: registerActionHandler has no matching unregister (nothing in
 *  production ever needs to remove one), so intents.test.ts / execute.test.ts
 *  clear the module-level map between cases instead of leaking handlers
 *  across tests. */
export function __clearActionHandlersForTest(): void {
  registry.clear();
}
