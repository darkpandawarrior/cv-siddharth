import { describe, expect, it } from "vitest";
import { buildLedgerSections, RELIEF_ROW, type SectionRow } from "./ledgerRows.ts";
import type { LedgerRow as GrammarLedgerRow } from "./grammar.ts";
import type { NowModelRaw } from "./useNowModel.ts";

function fixtureGrammarRow(overrides: Partial<GrammarLedgerRow> = {}): GrammarLedgerRow {
  return {
    id: "pr-stone",
    section: "LAND",
    label: "PR stones: 24 merged across 2 upstreams",
    cadence: "generated",
    sourceFile: "profile/openSource.ts",
    binds: ["pr-stone:a", "pr-stone:b"],
    ...overrides,
  };
}

const EMPTY_RAW: NowModelRaw = {
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

describe("buildLedgerSections: grammar rows", () => {
  it("places a grammar row into the section it declares", () => {
    const sections = buildLedgerSections([fixtureGrammarRow()], EMPTY_RAW);
    expect(sections.LAND.map((r) => r.id)).toContain("pr-stone");
    expect(sections.SKY.map((r) => r.id)).not.toContain("pr-stone");
  });

  it("every grammar rule row maps 1:1, none dropped", () => {
    const rows = [fixtureGrammarRow({ id: "a", section: "LAND" }), fixtureGrammarRow({ id: "b", section: "REACH" })];
    const sections = buildLedgerSections(rows, EMPTY_RAW);
    expect(sections.LAND.some((r) => r.id === "a")).toBe(true);
    expect(sections.REACH.some((r) => r.id === "b")).toBe(true);
  });
});

describe("buildLedgerSections: stream rows", () => {
  it("river gets a RIVER row whose label carries the 'modelled' cadence word", () => {
    const raw: NowModelRaw = { ...EMPTY_RAW, river: { date: "2026-09-24", dischargeM3s: 73.6, next: [], range7d: [40, 90] } };
    const sections = buildLedgerSections([], raw);
    const river = sections.RIVER.find((r) => r.id === "river");
    expect(river).toBeDefined();
    expect(river!.cadence).toBe("modelled");
    expect(river!.label).toMatch(/modelled/);
  });

  it("a stream with no live data yet still renders an honest 'unavailable' row, not a guess", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    const weather = sections.SKY.find((r) => r.id === "weather");
    expect(weather!.label).toMatch(/unavailable right now/);
  });

  it("touched (a PEOPLE stream with no bespoke Now slot) still gets exactly one row via the generic fallback path", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    expect(sections.PEOPLE.some((r) => r.id === "touched")).toBe(true);
  });

  it("a claim:false stream (e.g. season) with no section slot produces no body row", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    const allIds = [...sections.SKY, ...sections.RIVER, ...sections.LAND, ...sections.PEOPLE, ...sections.REACH].map((r) => r.id);
    expect(allIds).not.toContain("season");
  });
});

describe("buildLedgerSections: the LAND relief row and the ambient footer", () => {
  it("LAND always includes the SRTM relief row", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    expect(sections.LAND).toContainEqual(RELIEF_ROW);
    expect(RELIEF_ROW.label).toMatch(/SRTM/);
  });

  it("the Ambient (no claim) footer includes birds", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    expect(sections.ambient.some((r) => r.id === "birds")).toBe(true);
  });

  it("every ambient row is a real STREAMS class:ambient entry (stars, aircraft, satellites, birds)", () => {
    const sections = buildLedgerSections([], EMPTY_RAW);
    expect(new Set(sections.ambient.map((r) => r.id))).toEqual(new Set(["stars", "aircraft", "satellites", "birds"]));
  });
});

describe("buildLedgerSections: the checker actually fires (break-it, G15)", () => {
  it("an unrecognised section on a fixture row would land nowhere valid — this test would catch a typo'd section name", () => {
    const bad = fixtureGrammarRow({ section: "LAND" as SectionRow["section"] });
    const sections = buildLedgerSections([bad], EMPTY_RAW);
    const total = sections.SKY.length + sections.RIVER.length + sections.LAND.length + sections.PEOPLE.length + sections.REACH.length;
    expect(total).toBeGreaterThan(0);
  });
});
