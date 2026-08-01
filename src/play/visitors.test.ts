import { describe, expect, it } from "vitest";
import {
  EMPTY_LEDGER,
  SHARD_COUNT,
  VISITOR_KEY,
  isPlausibleZone,
  isoDay,
  ordinal,
  pickShard,
  planVisit,
  readVisitor,
  recentDays,
  sumDays,
  topZones,
  totalVisitors,
  withOrdinal,
  writeVisitor,
  zonePlace,
  zoneRegion,
  type VisitorLedger,
  type VisitorRecord,
} from "./visitors.ts";

/* Two things are worth pinning down here: the once-per-browser-per-day rule,
 * because everything the counter claims rests on it, and the reading of a
 * document anyone on the internet can write to. */

function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const blocked = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
};

const ledger = (over: Partial<VisitorLedger>): VisitorLedger => ({ ...EMPTY_LEDGER, ...over });

describe("planVisit", () => {
  it("counts a brand-new browser as both a person and a visit, and leaves it unnumbered", () => {
    expect(planVisit(null, "2026-08-01")).toEqual({
      // n: 0 — only the shared write can say what number this visitor is.
      record: { n: 0, first: "2026-08-01", days: 1, last: "2026-08-01" },
      countPerson: true,
      countDay: true,
    });
  });

  it("counts nothing at all when the same browser comes back the same day", () => {
    const prev: VisitorRecord = { n: 7, first: "2026-07-01", days: 3, last: "2026-08-01" };
    expect(planVisit(prev, "2026-08-01")).toEqual({ record: prev, countPerson: false, countDay: false });
  });

  it("counts a new day as a visit but never as a second person", () => {
    const prev: VisitorRecord = { n: 7, first: "2026-07-01", days: 3, last: "2026-07-31" };
    expect(planVisit(prev, "2026-08-01")).toEqual({
      record: { n: 7, first: "2026-07-01", days: 4, last: "2026-08-01" },
      countPerson: false,
      countDay: true,
    });
  });

  it("never re-issues a number to someone who already has one", () => {
    const prev: VisitorRecord = { n: 7, first: "2026-07-01", days: 1, last: "2026-07-31" };
    expect(planVisit(prev, "2026-08-01").record.n).toBe(7);
    expect(withOrdinal(planVisit(prev, "2026-08-01").record, 5000).n).toBe(7);
  });

  it("counts a refresh once and a week of daily visits seven times", () => {
    let record: VisitorRecord | null = null;
    let people = 0;
    let visits = 0;
    const days = ["2026-08-01", "2026-08-01", "2026-08-02", "2026-08-02", "2026-08-03", "2026-08-04"];
    for (const day of days) {
      const plan = planVisit(record, day);
      if (plan.countPerson) people++;
      if (plan.countDay) visits++;
      record = plan.record;
    }
    expect({ people, visits, days: record?.days }).toEqual({ people: 1, visits: 4, days: 4 });
  });
});

describe("withOrdinal", () => {
  it("stamps the number a new visitor earned", () => {
    const fresh: VisitorRecord = { n: 0, first: "2026-08-01", days: 1, last: "2026-08-01" };
    expect(withOrdinal(fresh, 1204).n).toBe(1204);
  });

  it("leaves an existing number alone, however the count has moved since", () => {
    const known: VisitorRecord = { n: 7, first: "2026-07-01", days: 2, last: "2026-08-01" };
    expect(withOrdinal(known, 9999)).toEqual(known);
  });

  it("never issues a zeroth or fractional visitor", () => {
    const fresh: VisitorRecord = { n: 0, first: "2026-08-01", days: 1, last: "2026-08-01" };
    expect(withOrdinal(fresh, 0).n).toBe(1);
    expect(withOrdinal(fresh, -5).n).toBe(1);
    expect(withOrdinal(fresh, 3.9).n).toBe(3);
  });
});

describe("readVisitor / writeVisitor", () => {
  it("round-trips a record", () => {
    const store = storage();
    const record: VisitorRecord = { n: 12, first: "2026-07-01", days: 2, last: "2026-08-01" };
    expect(writeVisitor(store, record)).toBe(true);
    expect(readVisitor(store)).toEqual(record);
  });

  it("treats a missing, corrupt or half-written record as a first visit", () => {
    expect(readVisitor(storage())).toBeNull();
    expect(readVisitor(storage({ [VISITOR_KEY]: "{not json" }))).toBeNull();
    expect(readVisitor(storage({ [VISITOR_KEY]: "null" }))).toBeNull();
    expect(readVisitor(storage({ [VISITOR_KEY]: '{"n":"lots","last":"2026-08-01"}' }))).toBeNull();
  });

  it("repairs a record that is merely thin rather than discarding it", () => {
    expect(readVisitor(storage({ [VISITOR_KEY]: '{"n":4,"last":"2026-08-01"}' }))).toEqual({
      n: 4,
      first: "2026-08-01",
      days: 1,
      last: "2026-08-01",
    });
  });

  it("reports blocked storage rather than throwing into a render", () => {
    expect(readVisitor(blocked)).toBeNull();
    expect(writeVisitor(blocked, { n: 1, first: "x", days: 1, last: "x" })).toBe(false);
  });
});

describe("totalVisitors", () => {
  it("sums the shards", () => {
    expect(totalVisitors(ledger({ shards: { s0: 3, s7: 10, s63: 1 } }))).toBe(14);
  });

  it("is 0 for an empty or absent ledger", () => {
    expect(totalVisitors(EMPTY_LEDGER)).toBe(0);
    expect(totalVisitors({} as VisitorLedger)).toBe(0);
  });

  it("ignores anything a stranger could have written into a shard", () => {
    const junk = { s0: 5, s1: -100, s2: NaN, s3: Infinity, s4: "9000", s5: null, s6: 2.7 };
    expect(totalVisitors(ledger({ shards: junk as unknown as Record<string, number> }))).toBe(7);
  });
});

describe("pickShard", () => {
  it("stays inside the shard range at both ends of the random source", () => {
    expect(pickShard(() => 0)).toBe("s0");
    expect(pickShard(() => 0.9999999)).toBe(`s${SHARD_COUNT - 1}`);
    // Math.random() is documented as < 1, but a bad polyfill returning exactly
    // 1 must not invent a 65th shard.
    expect(pickShard(() => 1)).toBe(`s${SHARD_COUNT - 1}`);
  });

  it("spreads across shards, which is the whole point of having them", () => {
    const seen = new Set(Array.from({ length: 400 }, () => pickShard()));
    expect(seen.size).toBeGreaterThan(SHARD_COUNT / 2);
  });
});

describe("recentDays", () => {
  it("returns the window ending today, oldest first", () => {
    const days = recentDays(EMPTY_LEDGER, "2026-08-01", 3);
    expect(days.map((d) => d.day)).toEqual(["2026-07-30", "2026-07-31", "2026-08-01"]);
  });

  it("fills the quiet days with zeroes so the chart keeps a time axis", () => {
    const days = recentDays(ledger({ days: { "2026-08-01": 4 } }), "2026-08-01", 3);
    expect(days.map((d) => d.count)).toEqual([0, 0, 4]);
    expect(sumDays(days)).toBe(4);
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(recentDays(EMPTY_LEDGER, "2027-01-01", 2).map((d) => d.day)).toEqual(["2026-12-31", "2027-01-01"]);
    expect(recentDays(EMPTY_LEDGER, "2026-03-01", 2).map((d) => d.day)).toEqual(["2026-02-28", "2026-03-01"]);
  });

  it("survives a nonsense day rather than rendering NaN bars", () => {
    expect(recentDays(EMPTY_LEDGER, "not-a-day", 5)).toEqual([]);
    expect(recentDays(ledger({ days: { "2026-08-01": NaN } }), "2026-08-01", 1)[0].count).toBe(0);
  });
});

describe("topZones", () => {
  it("orders by count and labels the place and region", () => {
    const zones = topZones(ledger({ zones: { "Asia/Kolkata": 9, "Europe/London": 12, "America/New_York": 3 } }));
    expect(zones.map((z) => [z.place, z.region, z.count])).toEqual([
      ["London", "Europe", 12],
      ["Kolkata", "Asia", 9],
      ["New York", "Americas", 3],
    ]);
  });

  it("drops keys that no browser's Intl would ever have produced", () => {
    const hostile = {
      "Asia/Kolkata": 2,
      "<script>alert(1)</script>": 99,
      "../../etc/passwd": 99,
      "Area/One/Two/Three/Four": 99,
      "": 99,
      [`Asia/${"x".repeat(80)}`]: 99,
    };
    expect(topZones(ledger({ zones: hostile })).map((z) => z.zone)).toEqual(["Asia/Kolkata"]);
  });

  it("caps how many it will hand back, however many are in the room", () => {
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`Etc/Zone${i}`, i + 1]));
    expect(topZones(ledger({ zones: many }))).toHaveLength(40);
    expect(topZones(ledger({ zones: many }), 5)).toHaveLength(5);
  });

  it("is stable between renders when counts tie", () => {
    const tied = ledger({ zones: { "Europe/Oslo": 2, "Asia/Tokyo": 2, "Europe/Rome": 2 } });
    expect(topZones(tied).map((z) => z.zone)).toEqual(topZones(tied).map((z) => z.zone));
    expect(topZones(tied)[0].zone).toBe("Asia/Tokyo");
  });
});

describe("zone labelling", () => {
  it("reads the place out of a zone, underscores and all", () => {
    expect(zonePlace("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zonePlace("UTC")).toBe("UTC");
  });

  it("says Americas, because 'America' as a region name reads as one country", () => {
    expect(zoneRegion("America/Sao_Paulo")).toBe("Americas");
    expect(zoneRegion("Australia/Perth")).toBe("Australia");
  });

  it("accepts the shapes Intl actually emits and refuses the rest", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "Etc/GMT+5"]) {
      expect(isPlausibleZone(zone), zone).toBe(true);
    }
    for (const zone of ["", "/", "Asia/", "a b/c", "Asia/Kolkata; DROP TABLE"]) {
      expect(isPlausibleZone(zone), zone).toBe(false);
    }
  });
});

describe("ordinal", () => {
  it("handles the teens, which is the only part anyone gets wrong", () => {
    expect([11, 12, 13, 111, 112, 113].map(ordinal)).toEqual(["11th", "12th", "13th", "111th", "112th", "113th"]);
  });

  it("handles the rest", () => {
    expect([1, 2, 3, 4, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });

  it("keeps the thousands separator, since this is read as prose", () => {
    expect(ordinal(1204)).toBe("1,204th");
  });
});

describe("isoDay", () => {
  it("keys on UTC, so every visitor buckets into the same day", () => {
    expect(isoDay(new Date("2026-08-01T23:30:00Z"))).toBe("2026-08-01");
    expect(isoDay(new Date("2026-08-02T00:30:00Z"))).toBe("2026-08-02");
  });
});
