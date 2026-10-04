import { afterEach, describe, expect, it } from "vitest";
import { ledger } from "./ledger.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";
import { GRAMMAR } from "./grammar.ts";
import { landOf } from "./worldModel.ts";
import { futureSlots } from "./futureSlots.ts";
import { dateZ } from "../city.ts";
import { getReplay, getServerReplay, setReplay, subscribeReplay, REPLAY_SPEEDS, replayInterval, replayMonths, stepReplay, timelapse } from "./timelapse.ts";

const now = new Date("2026-10-04T06:57:00Z");
afterEach(() => setReplay(null));

it("shares the selected month, clears it, and unsubscribes without duplicate notifications", () => {
  const updates: (string | null)[] = [];
  const unsubscribe = subscribeReplay(() => updates.push(getReplay()));
  expect(getServerReplay()).toBeNull();
  setReplay("2023-04");
  setReplay("2023-04");
  setReplay(null);
  unsubscribe();
  setReplay("2023-05");
  expect(updates).toEqual(["2023-04", null]);
});

describe("ledger replay", () => {
  it.each([ledger, buildFixtureLedger()])("keeps each I-class feature count non-decreasing across every month", (source) => {
    const counts = new Map<string, number>();
    for (const month of replayMonths(now)) {
      const features = timelapse(source, month);
      for (const rule of GRAMMAR.filter((r) => r.class === "I")) {
        const count = features.filter((f) => f.rule === rule.id).length;
        expect(count, `${month}: ${rule.id}`).toBeGreaterThanOrEqual(counts.get(rule.id) ?? 0);
        counts.set(rule.id, count);
      }
    }
  });

  it.each(["2017-01", "2023-04", "2026-10"])("matches a manual filter at %s", (month) => {
    const expected = landOf(ledger).filter((f) => (f.date?.slice(0, 7) ?? ledger.generatedAt.slice(0, 7)) <= month);
    const actual = timelapse(ledger, month);
    expect(actual).toHaveLength(expected.length);
    expect(actual.map(({ cadence: _cadence, ...feature }) => feature)).toEqual(expected);
  });

  it("shows every undated record at its snapshot with the undated cadence", () => {
    const source = buildFixtureLedger();
    expect(timelapse(source, "2026-05").filter((f) => f.date === null)).toEqual([]);
    const undated = timelapse(source, "2026-06").filter((f) => f.date === null);
    expect(undated.length).toBeGreaterThan(0);
    expect(undated.every((f) => f.cadence === "undated")).toBe(true);
    expect(undated.map((f) => f.id)).toEqual(landOf(source).filter((f) => f.date === null).map((f) => f.id));
  });

  it("includes every month from 2017 through now and steps across year boundaries", () => {
    const months = replayMonths(now);
    expect(months[0]).toBe("2017-01");
    expect(months.at(-1)).toBe("2026-10");
    expect(months).toHaveLength(118);
    expect(stepReplay("2023-12", 1, "2026-10")).toBe("2024-01");
    expect(stepReplay("2024-01", -1, "2026-10")).toBe("2023-12");
    expect(stepReplay("2017-01", -1, "2026-10")).toBe("2017-01");
    expect(stepReplay("2026-10", 1, "2026-10")).toBe("2026-10");
    expect(() => stepReplay("2023-13", 1, "2026-10")).toThrow(RangeError);
  });

  it("uses 200 ms per month at 1x and supports 0.5x through 4x", () => {
    expect(REPLAY_SPEEDS.map(replayInterval)).toEqual([400, 200, 100, 50]);
  });
});

describe("future peg contract", () => {
  it("reserves exactly G6, G7, G11 and G12 on the current date line", () => {
    const pegs = futureSlots(ledger, now);
    expect(pegs.map((p) => p.ruleId).sort()).toEqual(["benchmark", "deepmal-niche", "lesson-kite", "pr-stone"]);
    for (const peg of pegs) expect(Math.abs(peg.z - dateZ("2026-10-04")!)).toBeLessThan(1e-9);
  });

  it("places an added record on its reserved line", () => {
    const source = buildFixtureLedger();
    const peg = futureSlots(source, now).find((p) => p.ruleId === "lesson-kite")!;
    source.writing.lessons.push({ title: "Fixture lesson", slug: "fixture-new", created: "2026-10-04", project: "fixture", links: {} });
    const feature = landOf(source).find((f) => f.id === "lesson-kite:/fixture-new")!;
    expect(Math.abs(feature.pos[2] - peg.z)).toBeLessThan(1e-9);
  });
});
