import { expect, it } from "vitest";
import { buildStory, createStoryPlayer } from "./index.ts";

function setup() {
  let now = 0;
  const story = buildStory().slice(0, 3);
  // A multi-event chapter catches players that equate chapter and event index.
  story[0].events.push({ ...story[0].events[0], id: "second" });
  const player = createStoryPlayer(story, () => now, 100);
  return { player, set: (value: number) => { now = value; } };
}

it("plays, pauses and resumes using only the injected clock", () => {
  const { player: p, set } = setup();
  expect(p.snapshot()).toMatchObject({ playing: false, time: 0, progress: 0, chapterIndex: 0 });
  set(1000); expect(p.snapshot().time).toBe(0);
  p.play(); set(1050);
  expect(p.pause()).toMatchObject({ time: 50, playing: false, progress: 0.5, chapterProgress: 0.25 });
  set(2000); expect(p.snapshot().time).toBe(50);
  p.play(); p.play(); set(2075);
  expect(p.snapshot()).toMatchObject({ time: 125, eventIndex: 1, progress: 0.25 });
});

it("settles elapsed time at the old speed before changing speed", () => {
  const { player: p, set } = setup();
  p.play(); set(25); expect(p.setSpeed(2).time).toBe(25);
  set(50); expect(p.snapshot().time).toBe(75);
  p.pause(); p.setSpeed(0.5); set(1000); p.play(); set(1050);
  expect(p.snapshot()).toMatchObject({ time: 100, speed: 0.5, eventIndex: 1 });
});

it("seeks in milliseconds or chapter indices, clamps endpoints, and steps chapters", () => {
  const { player: p, set } = setup();
  expect(p.seek(100)).toMatchObject({ chapterIndex: 0, eventIndex: 1, progress: 0 });
  expect(p.next()).toMatchObject({ chapterIndex: 1, time: 200 });
  expect(p.next()).toMatchObject({ chapterIndex: 2, time: 300 });
  expect(p.next().time).toBe(300);
  expect(p.prev().chapterIndex).toBe(1);
  expect(p.seekChapter(0).time).toBe(0);
  expect(p.prev().time).toBe(0);
  expect(p.seek(-1).time).toBe(0);
  expect(p.seek(9999)).toMatchObject({ time: 400, progress: 1, chapterProgress: 1, totalProgress: 1, playing: false });
  p.play(); expect(p.snapshot().time).toBe(0);
  set(25); p.seekChapter(1); set(50);
  expect(p.snapshot()).toMatchObject({ time: 225, playing: true });
});

it("stops at the end without wrapping and ignores backwards clock motion", () => {
  const { player: p, set } = setup();
  p.play(); set(80); expect(p.snapshot().time).toBe(80);
  set(20); expect(p.snapshot().time).toBe(80);
  set(100); expect(p.snapshot().time).toBe(100);
  set(10000); expect(p.snapshot()).toMatchObject({ time: 400, playing: false, progress: 1 });
  set(20000); expect(p.snapshot().time).toBe(400);
});

it("rejects nonfinite clocks, invalid speeds, durations, indices and empty stories", () => {
  const { player: p, set } = setup();
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(() => p.seek(value)).toThrow(RangeError);
    expect(() => p.setSpeed(value)).toThrow(RangeError);
  }
  for (const value of [0, -1]) expect(() => p.setSpeed(value)).toThrow(RangeError);
  for (const value of [-1, 3, 0.5, NaN]) expect(() => p.seekChapter(value)).toThrow(RangeError);
  for (const value of [0, -1, Infinity, NaN]) expect(() => createStoryPlayer(buildStory(), () => 0, value)).toThrow(RangeError);
  expect(() => createStoryPlayer([], () => 0)).toThrow(RangeError);
  expect(() => createStoryPlayer([{ ...buildStory()[0], events: [] }], () => 0)).toThrow(RangeError);
  expect(() => createStoryPlayer(buildStory(), () => NaN)).toThrow(RangeError);
  set(NaN); expect(() => p.snapshot()).toThrow(RangeError);
});

it("handles a single event and uses the default duration", () => {
  const p = createStoryPlayer([buildStory()[0]], () => 0);
  expect(p.snapshot().duration).toBe(5000);
  expect(p.next().chapterIndex).toBe(0);
  expect(p.prev().chapterIndex).toBe(0);
  expect(p.seek(p.snapshot().duration)).toMatchObject({ eventIndex: 0, progress: 1, playing: false });
});
