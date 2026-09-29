// LANE X2 ("ONE BOX" — merges place search and Ask the globe into
// ExploreBar.tsx's single top-centre input). Pure, store-free logic kept
// colocated with its own test: turning a GlobeAction list into a one-line
// PREVIEW before it runs ("Run: <summary>" — execute.ts's own `notes` only
// exist AFTER executing, so that string can't serve as a preview), and
// building the cheap undo for a list the box just applied.
import type { GlobeAction } from "../copilot/actions.ts";
import type { LayerId } from "../globeStore.ts";

/** One line per action, shown before it runs. */
export function describeAction(action: GlobeAction): string {
  switch (action.type) {
    case "flyTo":
      return `fly to ${action.lat.toFixed(1)}, ${action.lon.toFixed(1)}`;
    case "flyToPlace":
      return `fly to "${action.query}"`;
    case "follow":
      return `follow ${action.entityId}`;
    case "setLayer":
      return `${action.on ? "show" : "hide"} ${action.id}`;
    case "setStyle":
      return `style: ${action.style}`;
    case "setTime": {
      if ("offsetMin" in action) {
        if (action.offsetMin === 0) return "back to live";
        const mins = Math.abs(action.offsetMin);
        const unit = mins % 1440 === 0 ? `${mins / 1440}d` : mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`;
        return `time ${action.offsetMin > 0 ? "forward" : "back"} ${unit}`;
      }
      return `time: ${action.isoDate}`;
    }
    case "select":
      return `select ${action.kind} ${action.id}`;
    case "filter": {
      const parts: string[] = [];
      if (action.quakeMinMag !== undefined) parts.push(`quakes at least ${action.quakeMinMag}`);
      if (action.quakeSinceHours !== undefined) parts.push(`last ${action.quakeSinceHours}h`);
      return parts.length ? parts.join(", ") : "filter updated";
    }
    case "setView":
      return `view: ${action.view}`;
    case "narrate":
      return action.text;
  }
}

export function describeActions(actions: GlobeAction[]): string {
  return actions.map(describeAction).join("; ") || "run command";
}

/** Cheap-only undo (brief: "undoable where cheap: layer toggles, time
 *  offset"). `before` is a snapshot taken right before the actions ran, so
 *  the inverse restores the ORIGINAL value rather than just flipping a
 *  boolean — a `setLayer on:true` against an already-on layer is a store
 *  no-op (see execute.ts), and undo has to match that, not double-flip it.
 *  Every other action kind (fly/select/follow/style/view/filter) has no
 *  entry here on purpose: a speculative inverse for those is exactly the
 *  abstraction ponytail rule 1 says to skip until the brief asks for it. */
export function buildUndo(actions: GlobeAction[], before: { layers: Record<LayerId, boolean>; timeOffsetMin: number }): GlobeAction[] {
  const byKey = new Map<string, GlobeAction>();
  for (const action of actions) {
    if (action.type === "setLayer") byKey.set(`layer:${action.id}`, { type: "setLayer", id: action.id, on: before.layers[action.id] });
    else if (action.type === "setTime") byKey.set("time", { type: "setTime", offsetMin: before.timeOffsetMin });
  }
  return [...byKey.values()];
}

/** Three starter phrases shown only while the box is empty (brief: "Three
 *  example chips when empty"). Each is a real, working command — see
 *  intents.ts's own rules for "quakes above N", "follow the ISS" and
 *  "night lights only". */
export const EXAMPLE_CHIPS: readonly string[] = ["show quakes above 5 this week", "follow the ISS", "night lights only"];
