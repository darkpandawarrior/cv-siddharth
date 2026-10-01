import { parseShareState, serializeShareState, type ShareState } from "../globeUrlState.ts";
import { GIBS_BASES, GIBS_OVERLAYS } from "../layers/gibsCatalog.ts";

export const SAVED_VIEWS_KEY = "cv-siddharth:globe-saved-views";
export const SAVED_VIEWS_LIMIT = 20;
export interface SavedView { version: 1; id: string; name: string; query: string }

/** Store only URL parameters. Nonzero time is pinned to its UTC minute. */
export function savedQuery(state: ShareState, now = Date.now()): string {
  const params = new URLSearchParams(serializeShareState({ ...state, selectionId: null }, now));
  if (state.timeOffsetMin !== 0) {
    params.delete("t");
    params.set("at", new Date(Math.floor((now + state.timeOffsetMin * 60000) / 60000) * 60000).toISOString().slice(0, 16) + "Z");
  }
  return params.toString();
}

export function validSavedQuery(query: string, now = Date.now()): boolean {
  if (query.length > 2400) return false;
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => !["lat", "lon", "alt", "view", "t", "at", "ly", "base", "ov"].includes(key))) return false;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return false;
  const state = parseShareState(params, now);
  if ([state.lat, state.lon, state.alt, state.view, state.timeOffsetMin, state.layers, state.base].some(v => v === undefined)) return false;
  if (params.has("at") === params.has("t")) return false;
  if (params.has("t") && params.get("t") !== "0") return false;
  if (!GIBS_BASES.some(entry => entry.id === state.base)) return false;
  if (params.get("ly") !== state.layers!.join(",")) return false;
  if (params.has("ov") && params.get("ov") !== state.overlays?.map(o => `${o.id}:${o.opacity.toFixed(2)}`).join(",")) return false;
  if (state.overlays?.some(o => !GIBS_OVERLAYS.some(entry => entry.id === o.id))) return false;
  for (const key of ["lat", "lon", "alt"] as const) {
    if (Number(params.get(key)) !== state[key]) return false;
  }
  return true;
}

export function decodeSavedViews(raw: string | null, now = Date.now()): { views: SavedView[]; dropped: boolean } {
  if (raw === null) return { views: [], dropped: false };
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return { views: [], dropped: true };
    const views: SavedView[] = [];
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<SavedView>;
      if (Object.keys(v).sort().join(",") !== "id,name,query,version") continue;
      if (v.version !== 1 || typeof v.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(v.id)
        || typeof v.name !== "string" || v.name.length > 80 || typeof v.query !== "string"
        || !validSavedQuery(v.query, now) || views.some(entry => entry.id === v.id) || views.length === SAVED_VIEWS_LIMIT) continue;
      views.push({ version: 1, id: v.id, name: v.name, query: v.query });
    }
    return { views, dropped: views.length !== values.length };
  } catch { return { views: [], dropped: true }; }
}

export function viewTimeLabel(query: string, now = Date.now()): string {
  const at = new URLSearchParams(query).get("at");
  return at ? `${Date.parse(at) < now ? "Past" : "Future"} · ${at.replace("T", " ").replace("Z", " UTC")}` : "Current time on restore";
}
