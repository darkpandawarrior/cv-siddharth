import { describe, expect, it } from "vitest";
import { createSenseTracker, initialSenseEntry, SENSE_RADIUS_M, stepSense } from "./sense.ts";

describe("sense: stepSense (one id's own transition)", () => {
  it("fires once on entry (armed -> in range)", () => {
    const result = stepSense(initialSenseEntry(), 10);
    expect(result.fired).toBe(true);
    expect(result.entry.armed).toBe(false);
  });

  it("does not refire while still in range", () => {
    let entry = initialSenseEntry();
    ({ entry } = stepSense(entry, 10));
    const second = stepSense(entry, 5);
    expect(second.fired).toBe(false);
    expect(second.entry.armed).toBe(false);
  });

  it("re-arms on exit, without firing", () => {
    let entry = initialSenseEntry();
    ({ entry } = stepSense(entry, 10)); // enters, fires
    const exit = stepSense(entry, SENSE_RADIUS_M + 5);
    expect(exit.fired).toBe(false);
    expect(exit.entry.armed).toBe(true);
  });

  it("fires again on a second entry after re-arming", () => {
    let entry = initialSenseEntry();
    ({ entry } = stepSense(entry, 10)); // enter -> fire
    ({ entry } = stepSense(entry, 100)); // exit -> re-arm
    const secondEntry = stepSense(entry, 10);
    expect(secondEntry.fired).toBe(true);
  });

  it("exactly at the radius counts as out of range (< radius, not <=)", () => {
    const result = stepSense(initialSenseEntry(), SENSE_RADIUS_M);
    expect(result.fired).toBe(false);
  });
});

describe("sense: createSenseTracker (many lanterns at once)", () => {
  it("fires per id independently", () => {
    const tracker = createSenseTracker();
    const fired = tracker.step(new Map([["a", 10], ["b", 100]]));
    expect(fired).toEqual(["a"]);
  });

  it("does not refire an id already fired and still in range on the next step", () => {
    const tracker = createSenseTracker();
    tracker.step(new Map([["a", 10]]));
    const second = tracker.step(new Map([["a", 12]]));
    expect(second).toEqual([]);
  });

  it("re-arms and refires when an id leaves the channel and later reappears", () => {
    const tracker = createSenseTracker();
    tracker.step(new Map([["a", 10]])); // fires
    tracker.step(new Map()); // "a" leaves the channel entirely
    const refired = tracker.step(new Map([["a", 10]])); // reappears close
    expect(refired).toEqual(["a"]);
  });
});
