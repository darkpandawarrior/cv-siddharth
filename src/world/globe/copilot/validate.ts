// LANE W12. Client-side validation of the LLM's parsed JSON action list —
// defense in depth on top of the server-side validation api/_lib/globe-ask.ts
// already does (that copy is duplicated, not imported, because Vercel edge
// functions must not import across ../../src — see system-prompt.ts's own
// note). Never applied to intents.ts's output: those actions are built as
// typed literals in trusted code, not parsed from untrusted text.
import { KNOWN_ACTION_TYPES, NARRATE_MAX_CHARS, type GlobeAction } from "./actions.ts";
import { LAYER_IDS, type GlobeView, type LayerId } from "../globeStore.ts";

const EARTH_STYLES = new Set(["imagery", "dots"]);
const GLOBE_VIEWS = new Set(["orbit", "ground", "follow", "street"]);
const DEFAULT_MAX_ACTIONS = 5;
const MAX_QUERY_CHARS = 100;
// A year either way — generous enough for every real phrasing ("back 6
// hours", "tomorrow noon") without letting a hostile payload set the scrubber
// to a date so extreme every time-aware layer silently draws nothing.
const MAX_OFFSET_MIN = 525_600;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** One raw candidate (parsed LLM JSON, `unknown`) -> a validated GlobeAction,
 *  or null when it's unsalvageable: unknown `type`, or a required field
 *  that's missing or the wrong JS type entirely. A number that's the wrong
 *  RANGE is clamped, not rejected (brief: "clamp numbers ... drop invalid
 *  lat/lon" — clamp is for range, drop is for "not even a number"). */
export function validateAction(raw: unknown): GlobeAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: unknown } & Record<string, unknown>;
  const type = a.type;
  if (typeof type !== "string" || !(KNOWN_ACTION_TYPES as readonly string[]).includes(type)) return null;

  switch (type as GlobeAction["type"]) {
    case "flyTo": {
      if (!isFiniteNum(a.lat) || !isFiniteNum(a.lon)) return null;
      const action: GlobeAction = { type: "flyTo", lat: clamp(a.lat, -90, 90), lon: clamp(a.lon, -180, 180) };
      if (isFiniteNum(a.distance)) action.distance = clamp(a.distance, 0.1, 50);
      return action;
    }
    case "flyToPlace": {
      if (typeof a.query !== "string" || !a.query.trim()) return null;
      return { type: "flyToPlace", query: a.query.trim().slice(0, MAX_QUERY_CHARS) };
    }
    case "follow": {
      if (typeof a.entityId !== "string" || !a.entityId.trim()) return null;
      return { type: "follow", entityId: a.entityId.trim().slice(0, 64) };
    }
    case "setLayer": {
      if (typeof a.id !== "string" || !(LAYER_IDS as readonly string[]).includes(a.id) || typeof a.on !== "boolean") return null;
      return { type: "setLayer", id: a.id as LayerId, on: a.on };
    }
    case "setStyle": {
      if (typeof a.style !== "string" || !EARTH_STYLES.has(a.style)) return null;
      return { type: "setStyle", style: a.style as "imagery" | "dots" };
    }
    case "setTime": {
      if (isFiniteNum(a.offsetMin)) return { type: "setTime", offsetMin: clamp(a.offsetMin, -MAX_OFFSET_MIN, MAX_OFFSET_MIN) };
      if (typeof a.isoDate === "string" && Number.isFinite(Date.parse(a.isoDate))) return { type: "setTime", isoDate: a.isoDate };
      return null;
    }
    case "select": {
      if (typeof a.kind !== "string" || !a.kind.trim() || typeof a.id !== "string" || !a.id.trim()) return null;
      return { type: "select", kind: a.kind.trim().slice(0, 32), id: a.id.trim().slice(0, 64) };
    }
    case "filter": {
      const action: GlobeAction = { type: "filter" };
      if (isFiniteNum(a.quakeMinMag)) action.quakeMinMag = clamp(a.quakeMinMag, -2, 10);
      if (isFiniteNum(a.quakeSinceHours)) action.quakeSinceHours = clamp(a.quakeSinceHours, 1, 24 * 30);
      return action;
    }
    case "setView": {
      if (typeof a.view !== "string" || !GLOBE_VIEWS.has(a.view)) return null;
      return { type: "setView", view: a.view as GlobeView };
    }
    case "narrate": {
      if (typeof a.text !== "string" || !a.text.trim()) return null;
      return { type: "narrate", text: a.text.trim().slice(0, NARRATE_MAX_CHARS) };
    }
    default:
      return null;
  }
}

/** A whole parsed JSON array -> a bounded list of validated actions.
 *  Anything that isn't an array is treated as "no actions" rather than
 *  thrown — a model that replies with a bare object instead of `[...]`
 *  should degrade to an empty action list plus whatever `narrate` the
 *  caller reads separately, never a crash. */
export function validateActions(raw: unknown, opts: { maxActions?: number } = {}): GlobeAction[] {
  const maxActions = opts.maxActions ?? DEFAULT_MAX_ACTIONS;
  if (!Array.isArray(raw)) return [];
  const out: GlobeAction[] = [];
  for (const item of raw) {
    const v = validateAction(item);
    if (v) out.push(v);
    if (out.length >= maxActions) break;
  }
  return out;
}
