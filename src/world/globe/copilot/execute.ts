// LANE W12. Applies a validated GlobeAction list to the store — the one
// place any copilot action actually touches globeStore.ts. Every action
// handler is a few lines; the interesting behaviour (deterministic-first,
// LLM-fallback) lives in runGlobeAsk below.
import { entityPositions, useGlobe, type Focus } from "../globeStore.ts";
import { getActionHandler, type GlobeAction } from "./actions.ts";
import { askGlobeLLM } from "./askLLM.ts";
import { buildGlobeContext } from "./context.ts";
import { parseIntent } from "./intents.ts";
import { resolvePlace } from "./places.ts";

/** Applies every action in order and returns a short, human summary of what
 *  changed — shown back to the visitor under the ask box (brief: "returns a
 *  short human summary of what changed"). Fly-to animation itself is
 *  CameraDirector.tsx's job (it already reacts to `store.focus`); this just
 *  sets the store fields CameraDirector and every other layer already read. */
export function executeActions(actions: GlobeAction[]): string {
  const notes: string[] = [];

  for (const action of actions) {
    const store = useGlobe.getState();
    switch (action.type) {
      case "flyTo": {
        const focus: Focus = { kind: "latlon", lat: action.lat, lon: action.lon, distance: action.distance };
        store.flyTo(focus);
        notes.push(`flew to ${action.lat.toFixed(1)}, ${action.lon.toFixed(1)}`);
        break;
      }
      case "flyToPlace": {
        const place = resolvePlace(action.query);
        if (place) {
          store.flyTo({ kind: "latlon", lat: place.lat, lon: place.lon });
          notes.push(`flew to ${place.name}`);
        } else {
          notes.push(`couldn't find "${action.query}" on the map`);
        }
        break;
      }
      case "follow": {
        store.flyTo({ kind: "entity", id: action.entityId });
        store.setView("follow");
        notes.push(`following ${action.entityId}`);
        break;
      }
      case "setLayer": {
        if (store.layers[action.id] !== action.on) store.toggleLayer(action.id);
        notes.push(`${action.on ? "showed" : "hid"} ${action.id}`);
        break;
      }
      case "setStyle": {
        store.setStyle(action.style);
        notes.push(`style: ${action.style}`);
        break;
      }
      case "setTime": {
        const offsetMin = "offsetMin" in action ? action.offsetMin : Math.round((Date.parse(action.isoDate) - Date.now()) / 60_000);
        store.setTimeOffset(offsetMin);
        notes.push(offsetMin === 0 ? "back to live" : "time shifted");
        break;
      }
      case "select": {
        const focus = entityPositions.get(action.id) ? ({ kind: "entity", id: action.id } as Focus) : undefined;
        store.select({ id: action.id, kind: action.kind, title: action.id, rows: [], source: "Ask the globe", live: false, focus });
        notes.push(`selected ${action.kind} ${action.id}`);
        break;
      }
      case "filter": {
        store.setFilters({ quakeMinMag: action.quakeMinMag, quakeSinceHours: action.quakeSinceHours });
        notes.push("filter updated");
        break;
      }
      case "setView": {
        store.setView(action.view);
        notes.push(`view: ${action.view}`);
        break;
      }
      case "narrate": {
        notes.push(action.text);
        break;
      }
      default: {
        // Unreachable for the 10 built-in kinds (exhaustive above); kept for
        // a future lane's registered extension kind — see actions.ts's own
        // comment on why validate.ts doesn't allow one through yet.
        const handler = getActionHandler((action as { type: string }).type);
        handler?.(action as unknown as { type: string; [key: string]: unknown });
      }
    }
  }

  return notes.join("; ") || "done";
}

/** The one entry point a UI (AskBox.tsx, or the e2e-only window seam below)
 *  calls: try the free deterministic parser first, and only pay for a model
 *  call when it returns null (brief: "Common commands resolve instantly and
 *  free ... everything else goes to the site's existing LLM chat backend"). */
export async function runGlobeAsk(text: string): Promise<string> {
  const deterministic = parseIntent(text);
  if (deterministic) return executeActions(deterministic);

  const { actions, narrate } = await askGlobeLLM(text, buildGlobeContext());
  const summary = actions.length ? executeActions(actions) : "";
  if (narrate) return summary ? `${narrate} (${summary})` : narrate;
  return summary || "I didn't catch a command in that — try \"fly to Tokyo\" or \"show quakes above 5\".";
}

// e2e-only seam (brief task 6): AskBox.tsx isn't mounted anywhere in this
// wave (a later UI lane gives it its real home), so there is no component in
// the live render tree whose effect could register a window hook the way
// Inspector.tsx's __GLOBE_TEST_SELECT__ or LayerPanel.tsx's
// __GLOBE_TEST_SET_ENTITY__ do. This module is instead dynamic-imported
// from HazardLayer.tsx (the one file in this lane's ownership that IS
// mounted) behind the same `?globeTest=1` query flag, so the fetch — and
// this side effect — never happens for a real visitor. See HazardLayer.tsx's
// own comment and this lane's report ("Needs from integration") for the
// real fix: mount AskBox.tsx (or just import this module once) from
// whatever component the UI lane adds.
declare global {
  interface Window {
    __GLOBE_ASK__?: (text: string) => Promise<string>;
  }
}
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("globeTest") === "1") {
  window.__GLOBE_ASK__ = runGlobeAsk;
}
