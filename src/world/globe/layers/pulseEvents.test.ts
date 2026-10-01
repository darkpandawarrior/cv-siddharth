import { describe, it, expect } from "vitest";
import { diffPulseEvents, pickIntroEvents, formatTimeAgo, EMPTY_PULSE_SOURCES, type PulseSources } from "./pulseEvents.ts";

const activity = (at: string): PulseSources["activity"] => ({
  connected: true,
  items: [{ repo: "darkpandawarrior/Doori", type: "push", message: "fix: x", url: "https://github.com/darkpandawarrior/Doori/commit/1", at, upstream: false }],
});

const ops = (at: string, conclusion: "success" | "failure" = "success"): PulseSources["ops"] => ({
  connected: true,
  stale: false,
  repo: "cv-siddharth",
  runs: [{ workflow: "ci.yml", conclusion, at, url: "https://x/1", event: "push", recentFailures: 0, recentTotal: 1 }],
  neverRan: [],
  supplyChain: { connected: true, indexBuiltAt: null, apps: [] },
});

const signals = (over: Partial<NonNullable<PulseSources["signals"]>> = {}): PulseSources["signals"] => ({
  at: "2026-09-27T10:00:00Z",
  lichess: { online: false, playing: false },
  devto: [],
  ci: null,
  downloads: null,
  ...over,
});

describe("diffPulseEvents", () => {
  it("emits nothing on the first poll (prev null) -- that feeds pickIntroEvents instead", () => {
    expect(diffPulseEvents(null, { activity: activity("2026-09-27T09:00:00Z"), ops: null, signals: null })).toEqual([]);
  });

  it("emits nothing across two identical polls -- no duplicate pulses", () => {
    const snap: PulseSources = { activity: activity("2026-09-27T09:00:00Z"), ops: ops("2026-09-27T09:00:00Z"), signals: signals() };
    expect(diffPulseEvents(snap, snap)).toEqual([]);
    expect(diffPulseEvents(snap, { ...snap })).toEqual([]);
  });

  it("emits a push pulse for a new github-activity item, correctly kinded", () => {
    const prev: PulseSources = { activity: activity("2026-09-27T09:00:00Z"), ops: null, signals: null };
    const curr: PulseSources = { activity: activity("2026-09-27T09:05:00Z"), ops: null, signals: null };
    const events = diffPulseEvents(prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("push");
    expect(events[0].at).toBe("2026-09-27T09:05:00Z");
  });

  it("kinds a completed CI run pass vs fail correctly", () => {
    const prevPass: PulseSources = { activity: null, ops: ops("2026-09-27T09:00:00Z", "success"), signals: null };
    const currFail: PulseSources = { activity: null, ops: ops("2026-09-27T09:10:00Z", "failure"), signals: null };
    const events = diffPulseEvents(prevPass, currFail);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("ci-fail");
  });

  it("fires a lichess pulse only on the offline-to-online edge, never while already online", () => {
    const offline = signals({ lichess: { online: false, playing: false } });
    const online = signals({ lichess: { online: true, playing: false } });
    const stillOnline = signals({ lichess: { online: true, playing: false }, at: "2026-09-27T10:05:00Z" });

    const edge = diffPulseEvents({ activity: null, ops: null, signals: offline }, { activity: null, ops: null, signals: online });
    expect(edge).toHaveLength(1);
    expect(edge[0].kind).toBe("lichess");

    const noRefire = diffPulseEvents({ activity: null, ops: null, signals: online }, { activity: null, ops: null, signals: stillOnline });
    expect(noRefire).toEqual([]);
  });

  it("fires a devto pulse on a reaction jump, stamped with the poll's own time", () => {
    const before = signals({ devto: [{ url: "https://dev.to/a", reactions: 3, comments: 0, publishedAt: "2026-09-01T00:00:00Z" }] });
    const after = signals({ devto: [{ url: "https://dev.to/a", reactions: 9, comments: 0, publishedAt: "2026-09-01T00:00:00Z" }], at: "2026-09-27T11:00:00Z" });
    const events = diffPulseEvents({ activity: null, ops: null, signals: before }, { activity: null, ops: null, signals: after });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("devto");
    expect(events[0].detail).toBe("reactions +6");
    expect(events[0].at).toBe("2026-09-27T11:00:00Z");
  });
});

describe("pickIntroEvents", () => {
  it("picks the newest `max` real events, oldest first, for the staggered opening replay", () => {
    const curr: PulseSources = {
      activity: { connected: true, items: [
        { repo: "d/a", type: "push", message: "m1", url: "u1", at: "2026-09-27T08:00:00Z", upstream: false },
        { repo: "d/b", type: "push", message: "m2", url: "u2", at: "2026-09-27T09:00:00Z", upstream: false },
      ] },
      ops: ops("2026-09-27T09:30:00Z"),
      signals: signals(),
    };
    const intro = pickIntroEvents(curr, 2);
    expect(intro).toHaveLength(2);
    expect(intro.map((e) => e.at)).toEqual(["2026-09-27T09:00:00Z", "2026-09-27T09:30:00Z"]);
  });

  it("returns nothing from an all-null first poll", () => {
    expect(pickIntroEvents(EMPTY_PULSE_SOURCES)).toEqual([]);
  });
});

describe("formatTimeAgo", () => {
  it("reads whole minutes, singular at exactly one", () => {
    const now = Date.parse("2026-09-27T10:04:00Z");
    expect(formatTimeAgo(now, "2026-09-27T10:04:00Z")).toBe("just now");
    expect(formatTimeAgo(now, "2026-09-27T10:03:00Z")).toBe("1 min ago");
    expect(formatTimeAgo(now, "2026-09-27T10:00:00Z")).toBe("4 min ago");
    expect(formatTimeAgo(now, "2026-09-27T08:00:00Z")).toBe("2 hours ago");
  });
});
