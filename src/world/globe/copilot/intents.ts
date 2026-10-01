// LANE W12. A deterministic parser for the common phrasings — free, instant,
// no network call. Anything it doesn't recognise returns null and the
// caller (execute.ts's runGlobeAsk) falls through to the LLM. No fuzzy
// matching, no NLP library: a small ordered list of rules, each producing a
// typed GlobeAction directly (never through validate.ts — these are
// constructed as literals, not parsed from untrusted JSON, so there is
// nothing to validate).
//
// Rule ORDER matters: the first match wins, and a broad catch-all (flyToPlace
// — "go/fly/take me to <anything>") has to run LAST or it would swallow a
// time phrase like "go back 6 hours" as a place name. See the ordering test
// in intents.test.ts.
import type { EarthStyle, GlobeView, LayerId } from "../globeStore.ts";
import { LAYER_IDS } from "../globeStore.ts";
import type { GlobeAction } from "./actions.ts";

// The ISS as SatelliteLayer.tsx (L3) and ui/LayerPanel.tsx (L5) both key it:
// `sat:<NORAD id>`. Restated rather than imported — see cameraMath.ts's own
// file-level comment for why a small shared constant is duplicated across
// lanes rather than cross-imported.
const ISS_ENTITY_ID = "sat:25544";

const LAYER_ALIASES: Record<string, LayerId> = {
  markers: "markers",
  "pune markers": "markers",
  pune: "markers",
  stars: "stars",
  star: "stars",
  moon: "stars",
  sky: "stars",
  satellites: "satellites",
  satellite: "satellites",
  sats: "satellites",
  aircraft: "aircraft",
  planes: "aircraft",
  plane: "aircraft",
  flights: "aircraft",
  presence: "presence",
  visitors: "presence",
  people: "presence",
  pulses: "pulses",
  "live pulses": "pulses",
  activity: "pulses",
  signals: "pulses",
  hazards: "hazards",
  "earth events": "hazards",
  events: "hazards",
  quakes: "hazards",
  earthquakes: "hazards",
  wildfires: "hazards",
  fires: "hazards",
  storms: "hazards",
  wind: "wind",
  reach: "reach",
  apps: "reach",
  repos: "reach",
  countries: "countries",
  together: "together",
};

function layerFromWords(words: string): LayerId | null {
  return LAYER_ALIASES[words.trim().toLowerCase()] ?? null;
}

const STYLE_ALIASES: Record<string, EarthStyle> = {
  dots: "dots",
  "dot matrix": "dots",
  imagery: "imagery",
  "real imagery": "imagery",
  "real earth": "imagery",
  satellite: "imagery",
  "satellite imagery": "imagery",
  photo: "imagery",
  photographic: "imagery",
};

const VIEW_ALIASES: Record<string, GlobeView> = {
  orbit: "orbit",
  "free view": "orbit",
  "orbit view": "orbit",
  reset: "orbit",
  ground: "ground",
  "ground view": "ground",
  "look up": "ground",
  "street view": "street",
  street: "street",
};

/** Minutes per unit, for "back N hours/minutes/days". */
const UNIT_MIN: Record<string, number> = { minute: 1, min: 1, hour: 60, hr: 60, day: 1440 };

function pluralStrip(word: string): string {
  return word.replace(/s$/, "");
}

/** "this week" / "in the last 24 hours" / "since yesterday" -> hours, or
 *  undefined when the text carries no time-window phrase at all. */
function quakeSinceHoursFromText(text: string): number | undefined {
  const t = text.toLowerCase();
  if (/\bthis week\b|\bpast week\b|\blast 7 days\b/.test(t)) return 24 * 7;
  if (/\btoday\b|\bpast day\b|\blast 24 hours\b/.test(t)) return 24;
  if (/\byesterday\b/.test(t)) return 48;
  const m = /\blast\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?)\b/.exec(t);
  if (m) return (Number(m[1]) * (UNIT_MIN[pluralStrip(m[2])] ?? 60)) / 60;
  return undefined;
}

/** One rule: a normalised-text matcher plus how to turn a match into
 *  actions. `nowMs` only matters to the "tomorrow noon" rule (so it's
 *  testable without mocking the system clock). */
type Rule = (text: string, nowMs: number) => GlobeAction[] | null;

const rules: Rule[] = [
  // --- Layer show/hide -----------------------------------------------------
  (text) => {
    const m = /^(?:show|display|enable|turn on)\s+(.+)$/i.exec(text) ?? /^(.+)\s+on$/i.exec(text);
    const id = m ? layerFromWords(m[1]) : null;
    return id ? [{ type: "setLayer", id, on: true }] : null;
  },
  (text) => {
    const m = /^(?:hide|disable|turn off)\s+(.+)$/i.exec(text) ?? /^(.+)\s+off$/i.exec(text);
    const id = m ? layerFromWords(m[1]) : null;
    return id ? [{ type: "setLayer", id, on: false }] : null;
  },

  // --- "night lights only" --------------------------------------------------
  (text) => {
    if (!/^night\s*(?:lights?|side)\s*only$/i.test(text)) return null;
    return [{ type: "setStyle", style: "imagery" }, ...LAYER_IDS.map((id): GlobeAction => ({ type: "setLayer", id, on: false }))];
  },

  // --- Style switches --------------------------------------------------------
  (text) => {
    const m = /^(?:switch to|use|show)\s+(.+?)(?:\s+style)?$/i.exec(text);
    const style = STYLE_ALIASES[(m?.[1] ?? text).trim().toLowerCase()];
    return style ? [{ type: "setStyle", style }] : null;
  },

  // --- Views -----------------------------------------------------------------
  (text) => {
    const view = VIEW_ALIASES[text.trim().toLowerCase()];
    return view ? [{ type: "setView", view }] : null;
  },

  // --- Follow ------------------------------------------------------------------
  (text) => {
    const m = /^(?:follow|track)\s+(?:the\s+)?(iss|international space station|space station)$/i.exec(text);
    return m ? [{ type: "follow", entityId: ISS_ENTITY_ID }] : null;
  },

  // --- Time: "tomorrow noon" / "tomorrow at 3pm" ------------------------------
  (text, nowMs) => {
    const m = /^tomorrow(?:\s+at)?\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i.exec(text);
    if (!m) return null;
    const spec = m[1].toLowerCase();
    let hour: number;
    let minute = 0;
    if (spec === "noon") hour = 12;
    else if (spec === "midnight") hour = 0;
    else {
      const tm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(spec);
      if (!tm) return null;
      hour = Number(tm[1]) % 12;
      minute = tm[2] ? Number(tm[2]) : 0;
      if (tm[3]?.toLowerCase() === "pm") hour += 12;
    }
    const d = new Date(nowMs);
    d.setDate(d.getDate() + 1);
    d.setHours(hour, minute, 0, 0);
    return [{ type: "setTime", isoDate: d.toISOString() }];
  },
  // --- Time: "back 6 hours" / "go forward 2 days" -----------------------------
  (text) => {
    const m = /^(?:go\s+)?(back|forward)\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?)$/i.exec(text);
    if (!m) return null;
    const sign = m[1].toLowerCase() === "back" ? -1 : 1;
    const n = Number(m[2]);
    const unit = UNIT_MIN[pluralStrip(m[3].toLowerCase())] ?? 60;
    return [{ type: "setTime", offsetMin: sign * n * unit }];
  },
  // --- Time: "+2h" / "-30m" / "+1d" --------------------------------------------
  (text) => {
    const m = /^([+-])\s*(\d+(?:\.\d+)?)\s*(m|h|d)$/i.exec(text);
    if (!m) return null;
    const sign = m[1] === "-" ? -1 : 1;
    const n = Number(m[2]);
    const unit = { m: 1, h: 60, d: 1440 }[m[3].toLowerCase() as "m" | "h" | "d"];
    return [{ type: "setTime", offsetMin: sign * n * unit }];
  },
  // --- Time: back to live ------------------------------------------------------
  (text) => {
    if (!/^(?:now|live|back to now|reset time|current time)$/i.test(text)) return null;
    return [{ type: "setTime", offsetMin: 0 }];
  },

  // --- Quake filters -----------------------------------------------------------
  (text) => {
    // Guard FIRST: quakeSinceHoursFromText's own "today"/"this week" words
    // are generic time phrases that also appear in requests this parser
    // must NOT claim ("compare today with last Monday" is an LLM request,
    // not a quake filter) — only read a time window out of a sentence that
    // actually mentions quakes.
    if (!/\bquakes?\b|\bearthquakes?\b/i.test(text)) return null;
    const magMatch = /(?:quakes?|earthquakes?)\s+(?:above|over|greater than|>\s*=?|at least)\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    const hoursMatch = quakeSinceHoursFromText(text);
    if (!magMatch && hoursMatch === undefined) return null;
    const filter: GlobeAction = { type: "filter" };
    if (magMatch) filter.quakeMinMag = Number(magMatch[1]);
    if (hoursMatch !== undefined) filter.quakeSinceHours = hoursMatch;
    return [{ type: "setLayer", id: "hazards", on: true }, filter];
  },
  (text) => {
    if (!/^(?:show|reset)?\s*(?:all|every)\s+quakes$/i.test(text)) return null;
    return [
      { type: "setLayer", id: "hazards", on: true },
      { type: "filter", quakeMinMag: -2 },
    ];
  },

  // --- Fly to a place (broad catch-all: LAST) -----------------------------------
  (text) => {
    const m = /^(?:fly|go|navigate|zoom in|jump|take me|show me)\s+(?:to|over)?\s*(.+)$/i.exec(text);
    if (!m) return null;
    const query = m[1].trim();
    if (!query || layerFromWords(query)) return null;
    return [{ type: "flyToPlace", query }];
  },
];

/** The one entry point. Runs the rules in order (see the file header for why
 *  order is load-bearing) and returns the first match's actions, or null if
 *  nothing recognised the text — the caller then goes to the LLM. */
export function parseIntent(rawText: string, nowMs: number = Date.now()): GlobeAction[] | null {
  const text = rawText.trim();
  if (!text) return null;
  for (const rule of rules) {
    const actions = rule(text, nowMs);
    if (actions) return actions;
  }
  return null;
}
