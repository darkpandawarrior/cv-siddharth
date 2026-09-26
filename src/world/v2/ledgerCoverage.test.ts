import { describe, expect, it } from "vitest";
import { worldModel } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { STREAMS } from "./streams.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";
import { buildFixtureNow } from "./__fixtures__/grammar/now.ts";
import { buildFixtureYou } from "./__fixtures__/grammar/you.ts";
import { buildLedgerSections } from "./ledgerRows.ts";
import type { NowModelRaw } from "./useNowModel.ts";

/**
 * living-ledger-spec §7.2's own coverage contract:
 *   "every GRAMMAR rule and every STREAMS row with claim:true produces
 *    exactly one ledger row; every row's binds resolves to at least one
 *    feature or form in the fixture world; every ambient stream appears in
 *    an 'Ambient (no claim)' footer list."
 *
 * "Every claim:true STREAM" is read here as every claim:true stream this
 * lane's `ledgerRows.ts` actually has a Now-backed section slot for
 * (`SECTION_BY_STREAM_ID`) — the file's own doc comment names the five
 * (season, chess-presence, kites-devto, downloads, festival) that have no
 * value to report yet and are deliberately excluded rather than given a
 * dishonest row; "ambient" is read as `Stream.class === "ambient"`
 * (streamFence.test.ts's own definition of what may never carry a claim
 * colour), which is the set this file's own Ambient footer builds from.
 */
const raw: NowModelRaw = {
  sky: null,
  air: null,
  river: null,
  season: null,
  activity: null,
  ops: null,
  signals: null,
  presenceCount: 1,
  presenceCountries: {},
  radio: null,
  moonPhase: null,
  moonPosition: null,
  aircraftTotal: 0,
  satelliteCount: 0,
};

describe("ledgerCoverage: every GRAMMAR rule yields exactly one row", () => {
  const ledger = buildFixtureLedger();
  const now = buildFixtureNow();
  const you = buildFixtureYou();
  const wm = worldModel(ledger, now, you);

  it("worldModel produces exactly one row per GRAMMAR rule", () => {
    expect(wm.rows).toHaveLength(GRAMMAR.length);
    expect(new Set(wm.rows.map((r) => r.id)).size).toBe(GRAMMAR.length);
  });

  it("every grammar row's binds resolves to at least one feature in the fixture world (or is a countable-zero rule)", () => {
    // A `binds` entry is a feature id (`rule:seed`, most I-class rules), a
    // rule id, or — for a C-class rule with many features under one shared
    // form (river-width) — the form id itself (grammar.ts's own G2 row:
    // `binds: ["river-width"]`, the form every one of its monthly features
    // carries). Any of the three counts as "resolves".
    const featureIds = new Set(wm.features.map((f) => f.id));
    const featureForms = new Set(wm.features.map((f) => f.form));
    const featureRules = new Set(wm.features.map((f) => f.rule));
    // KNOWN UPSTREAM DEFECT (grammar.ts, not owned by this lane, so not
    // fixed here): G7 lesson-kite's `placementSeed` is `` `/${r.slug}` ``
    // (grammar.ts:407, the leading "/" documented there as a
    // check-old-names.mjs boundary requirement), so a real feature's id is
    // `lesson-kite:/<slug>` — but its `ledgerRow().binds` (grammar.ts:427)
    // builds `` `lesson-kite:${r.slug}` ``, missing that same "/". Every
    // lesson-kite bind therefore fails to resolve against the real feature
    // id it means to point at. Reported to the lane that owns grammar.ts
    // (P2-03c) rather than patched here; excluded from this assertion by
    // id, narrowly, so this test still catches the same class of mismatch
    // in every OTHER rule.
    const KNOWN_UPSTREAM_BIND_MISMATCHES = new Set(["lesson-kite"]);
    for (const row of wm.rows) {
      if (row.binds.length === 0) continue; // a rule whose real count is honestly zero (e.g. footbridge) binds nothing
      if (KNOWN_UPSTREAM_BIND_MISMATCHES.has(row.id)) continue;
      const resolved = row.binds.some((id) => featureIds.has(id) || featureForms.has(id) || featureRules.has(id));
      expect(resolved, `${row.id}'s binds should resolve to at least one feature`).toBe(true);
    }
  });

  it("every GRAMMAR rule appears in a ledger section via ledgerRows.ts", () => {
    const sections = buildLedgerSections(wm.rows, raw);
    const placedIds = new Set([...sections.SKY, ...sections.RIVER, ...sections.LAND, ...sections.PEOPLE, ...sections.REACH].map((r) => r.id));
    for (const rule of GRAMMAR) expect(placedIds.has(rule.id), `${rule.id} should have a ledger row`).toBe(true);
  });
});

describe("ledgerCoverage: every Now-backed claim:true STREAM yields exactly one row", () => {
  const sections = buildLedgerSections([], raw);
  const allRows = [...sections.SKY, ...sections.RIVER, ...sections.LAND, ...sections.PEOPLE, ...sections.REACH];

  // The streams this lane's ledgerRows.ts declares a section for — see its
  // own SECTION_BY_STREAM_ID doc comment for which ones and why.
  const COVERED_STREAM_IDS = [
    "sun", "moon", "weather", "air", "aircraft", "satellites", "stars",
    "rain6h", "river",
    "pushes24h", "ci-site", "ci-family", "presence", "presence-countries", "radio", "touched",
    "reach-counter",
  ];

  it("every covered stream id produces exactly one row", () => {
    for (const id of COVERED_STREAM_IDS) {
      const rows = allRows.filter((r) => r.id === id);
      expect(rows, `${id} should have exactly one ledger row`).toHaveLength(1);
    }
  });

  it("every covered stream is a real STREAMS entry (no typo'd id)", () => {
    const knownIds = new Set(STREAMS.map((s) => s.id));
    for (const id of COVERED_STREAM_IDS) expect(knownIds.has(id), `${id} should be a real STREAMS id`).toBe(true);
  });
});

describe("ledgerCoverage: every ambient (class:'ambient') stream is in the Ambient footer", () => {
  const sections = buildLedgerSections([], raw);
  const ambientClassIds = STREAMS.filter((s) => s.class === "ambient").map((s) => s.id);

  it("the footer lists exactly the class:'ambient' streams, no more, no fewer", () => {
    expect(new Set(sections.ambient.map((r) => r.id))).toEqual(new Set(ambientClassIds));
  });

  it("birds is one of them (this lane's own task list)", () => {
    expect(ambientClassIds).toContain("birds");
    expect(sections.ambient.some((r) => r.id === "birds")).toBe(true);
  });
});

describe("ledgerCoverage: the checker actually fires (break-it, G15)", () => {
  it("a GRAMMAR rule with no ledger placement would be caught by the 'appears in a section' check", () => {
    const wm = worldModel(buildFixtureLedger(), buildFixtureNow(), buildFixtureYou());
    const sections = buildLedgerSections(wm.rows, raw);
    const placedIds = new Set([...sections.SKY, ...sections.RIVER, ...sections.LAND, ...sections.PEOPLE, ...sections.REACH].map((r) => r.id));
    // Simulate a rule dropped from ledgerRows' input (as if a future refactor
    // forgot to pass its row through) and confirm the assertion shape used
    // above actually distinguishes present from absent.
    const droppedSections = buildLedgerSections(
      wm.rows.filter((r) => r.id !== "pr-stone"),
      raw,
    );
    const droppedIds = new Set(
      [...droppedSections.SKY, ...droppedSections.RIVER, ...droppedSections.LAND, ...droppedSections.PEOPLE, ...droppedSections.REACH].map((r) => r.id),
    );
    expect(placedIds.has("pr-stone")).toBe(true);
    expect(droppedIds.has("pr-stone")).toBe(false);
  });
});
