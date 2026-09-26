/**
 * The Reality ledger's rows (living-ledger-spec §7.1-7.2), built from
 * `GRAMMAR` (via `worldModel().rows`, one row per rule, already computed
 * upstream) and `STREAMS` (this file's own job) — never a hand-written
 * sentence duplicating what a `src/lib/*Text.ts` formatter already owns
 * (master-plan.md#M17: "row text comes from pure formatters owned by their
 * source lanes").
 *
 * Pure: every function here takes its data as a parameter (the raw readings
 * `useNowModel.ts` already gathered) and returns rows — no fetch, no clock
 * read, so `ledgerRows.test.ts` and `ledgerCoverage.test.ts` can build any
 * combination of "some streams answered, some didn't" without a hook.
 *
 * SECTION ASSIGNMENT, resolved: living-ledger-spec §7.1's table names
 * S1-S3/S5/S7-S9 for SKY, S4/S6 (plus G2) for RIVER, S11-S16 for PEOPLE and
 * S18 (plus G15-G17) for REACH — but leaves several STREAMS entries this
 * codebase already ships (season, chess-presence, kites-devto, downloads,
 * festival, last-visit) with no section slot, because none of them has a
 * sentence-worthy value in `Now`/`NowModelRaw` yet (worldModel.ts's own
 * `valueFor()` comment says the same for the ones it switches on: "driven
 * by their own live/local source ... not by Now's shape"). Those five stay
 * out of the body sections here rather than getting a row this lane cannot
 * honestly fill in; STREAMS' own `chess-presence` will get PEOPLE placement
 * the day a lane threads that state through (a one-line addition to
 * SECTION_BY_STREAM_ID below, not a redesign).
 */
import { airRow, riverRow, sunRow, weatherRow } from "../../lib/ledgerText.ts";
import { moonRow, starsRow } from "../../lib/skyText.ts";
import { moonTimes } from "../../lib/moon.ts";
import { ciRow as familyCiRow } from "../../lib/signalsText.ts";
import { recentPushes, siteCiGlow } from "../realityRows.ts";
import type { LedgerRow as GrammarLedgerRow } from "./grammar.ts";
import type { NowModelRaw } from "./useNowModel.ts";
import { STREAMS, type Stream } from "./streams.ts";

export type Section = "SKY" | "RIVER" | "LAND" | "PEOPLE" | "REACH";

export interface SectionRow {
  /** For a GRAMMAR-derived row this is the rule id; for a STREAMS-derived
   *  row it is the stream id — either way it is what a scene instance's
   *  `data-rule` attribute carries, so hovering a row can highlight its
   *  bound instances (living-ledger-spec §7.2). */
  id: string;
  section: Section;
  label: string;
  cadence: string;
  sourceFile: string;
  binds: string[];
}

export interface AmbientRow {
  id: string;
  label: string;
}

export interface LedgerSections {
  SKY: SectionRow[];
  RIVER: SectionRow[];
  LAND: SectionRow[];
  PEOPLE: SectionRow[];
  REACH: SectionRow[];
  ambient: AmbientRow[];
}

function fromGrammarRow(r: GrammarLedgerRow): SectionRow {
  return { id: r.id, section: r.section, label: r.label, cadence: r.cadence, sourceFile: r.sourceFile, binds: r.binds };
}

const SECTION_BY_STREAM_ID: Readonly<Partial<Record<string, Section>>> = {
  sun: "SKY",
  moon: "SKY",
  weather: "SKY",
  air: "SKY",
  aircraft: "SKY",
  satellites: "SKY",
  stars: "SKY",
  rain6h: "RIVER",
  river: "RIVER",
  pushes24h: "PEOPLE",
  "ci-site": "PEOPLE",
  "ci-family": "PEOPLE",
  presence: "PEOPLE",
  "presence-countries": "PEOPLE",
  radio: "PEOPLE",
  touched: "PEOPLE",
  "reach-counter": "REACH",
};

/** ~900 to magnitude 4 (living-ledger-spec §5.3's own figure for the real
 *  BSC5 subset this world draws) — a fixed, cited count, not a live read:
 *  the star field is a static heavy asset (streams.ts's own `stars.failure`
 *  says as much), so there is nothing to poll. */
const STAR_COUNT = 900;

/** Every stream this file has no bespoke formatter or live value for yet
 *  gets this generic, still-honest sentence straight from its own STREAMS
 *  row — real source/licence, never a guessed number. */
function genericStreamRow(s: Stream): string {
  return `${s.id} · ${s.source} · ${s.licence}`;
}

function streamRowText(s: Stream, raw: NowModelRaw): string {
  switch (s.id) {
    case "sun":
      return raw.sky ? sunRow(raw.sky.sun.altitudeDeg, raw.sky.times.sunrise, raw.sky.times.sunset) : "Sun · unavailable right now · computed";
    case "moon": {
      if (!raw.moonPhase || !raw.moonPosition || !raw.sky) return "Moon · unavailable right now · computed";
      const rise = moonTimes(raw.sky.now).rise;
      return moonRow(raw.moonPhase, rise);
    }
    case "weather":
      return weatherRow(raw.sky?.weather ?? null);
    case "air":
      return airRow(raw.air);
    case "aircraft":
      return `Aircraft · ${raw.aircraftTotal} tracked within 60 nm · adsb.lol (ODbL) · ambient`;
    case "satellites":
      return `Satellites · ${raw.satelliteCount} tracked objects (CelesTrak stations group) · ambient`;
    case "stars":
      return starsRow(STAR_COUNT, 4.0);
    case "rain6h":
      return `Rain (6h) · ${raw.sky?.weather ? raw.sky.weather.precipMmH.toFixed(1) : "0.0"} mm · Open-Meteo (CC BY 4.0) · live`;
    case "river":
      return riverRow(raw.river);
    case "pushes24h": {
      const count = raw.activity ? recentPushes(raw.activity.items, (raw.sky?.now ?? new Date()).getTime()).length : 0;
      return `Pushes (24h) · ${count} · GitHub Events API · live`;
    }
    case "ci-site": {
      const glow = siteCiGlow(raw.ops);
      return `CI (this site) · ${glow} · GitHub Actions · ${raw.ops?.stale ? "last good" : "live"}`;
    }
    case "ci-family":
      return raw.signals?.ci ? familyCiRow(raw.signals.ci, raw.signals.at) : "CI (family) · unavailable right now · GitHub Actions";
    case "presence":
      return `Visitors · ${raw.presenceCount} here now · playhtml · live`;
    case "presence-countries": {
      const n = Object.keys(raw.presenceCountries).length;
      return n > 0 ? `Countries here now · ${n} · this site's own realtime channel · live` : "Countries here now · unavailable right now (no country data yet)";
    }
    case "radio":
      return raw.radio?.isPlaying && raw.radio.track ? `On his radio · ${raw.radio.track} — ${raw.radio.artist ?? "unknown artist"} · Spotify · live` : "On his radio · nothing playing right now · Spotify";
    case "touched":
      return "Touched this session · session-only, resets on reload · first-party";
    case "reach-counter":
      return "Cumulative reach not recorded (no store configured) · off by default";
    default:
      return genericStreamRow(s);
  }
}

/** One row per stream `SECTION_BY_STREAM_ID` names — the curated set
 *  living-ledger-spec §7.1's table lists per section. `river` (claim:false,
 *  §5.4's own explicit "Ledger row" example) and the class:"ambient" ones
 *  named there (aircraft, satellites, stars) get a real, informational row
 *  here on top of their footer entry (built separately, below): `claim`
 *  governs whether the 3D scene may dress a feature in a claim colour or
 *  open a panel for it (streamFence.test.ts), not whether the ledger may
 *  disclose what feeds it — the two are independent by design. */
function buildStreamRows(raw: NowModelRaw): SectionRow[] {
  const rows: SectionRow[] = [];
  for (const s of STREAMS) {
    const section = SECTION_BY_STREAM_ID[s.id];
    if (!section) continue;
    rows.push({
      id: s.id,
      section,
      label: streamRowText(s, raw),
      cadence: s.class,
      sourceFile: s.endpoint ?? s.source,
      binds: Array.isArray(s.form) ? s.form : [s.form],
    });
  }
  return rows;
}

/** "Ambient (no claim)" footer (living-ledger-spec §7.2): every STREAMS
 *  entry whose `class` is literally `"ambient"` — the streams whose
 *  renderer may never reach for a claim colour or open a panel
 *  (streamFence.test.ts). `birds` is deliberately in this list (this
 *  lane's own task list). */
function buildAmbientRows(): AmbientRow[] {
  return STREAMS.filter((s) => s.class === "ambient").map((s) => ({ id: s.id, label: `${s.id} · ${s.source} · no claim` }));
}

/** living-ledger-spec §5.1's own relief attribution, hand-authored because
 *  it describes the terrain generator itself (P2-05's gen-terrain.mjs +
 *  fetch-real-relief.mjs) rather than a GRAMMAR rule or a STREAMS row — the
 *  wording is this lane's own task list, verbatim. */
export const RELIEF_ROW: SectionRow = {
  id: "relief-srtm",
  section: "LAND",
  label:
    "Relief texture: SRTM/GMTED2010 (USGS, public domain), sampled near Vetal Tekdi. The shape of the banks is real ground; where things stand on it is his data.",
  cadence: "static",
  sourceFile: "scripts/fetch-real-relief.mjs",
  binds: [],
};

export function buildLedgerSections(grammarRows: readonly GrammarLedgerRow[], raw: NowModelRaw): LedgerSections {
  const rows = [...grammarRows.map(fromGrammarRow), ...buildStreamRows(raw), RELIEF_ROW];
  const sections: LedgerSections = { SKY: [], RIVER: [], LAND: [], PEOPLE: [], REACH: [], ambient: buildAmbientRows() };
  for (const row of rows) sections[row.section].push(row);
  return sections;
}
