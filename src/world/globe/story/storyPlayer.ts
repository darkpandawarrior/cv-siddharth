import type { StoryChapter } from "./storyModel.ts";

/** Presentation time is milliseconds from an injected monotonic clock. It is
 * deliberately separate from evidence dates: a year-only event cannot acquire
 * day precision just because the UI animates it for a few seconds. */
export function createStoryPlayer(chapters: readonly StoryChapter[], clock: () => number, eventDurationMs = 5000) {
  if (!Number.isFinite(eventDurationMs) || eventDurationMs <= 0 || !chapters.length || chapters.some((c) => !c.events.length)) throw new RangeError("A player needs events and a positive finite duration");
  const frames = chapters.flatMap((chapter, chapterIndex) => chapter.events.map((event, eventIndex) => ({ chapter, chapterIndex, event, eventIndex })));
  const starts = chapters.map((_, i) => frames.findIndex((f) => f.chapterIndex === i) * eventDurationMs);
  const duration = frames.length * eventDurationMs;
  let time = 0, speed = 1, playing = false;
  function readClock() {
    const now = clock();
    if (!Number.isFinite(now)) throw new RangeError("Clock must be finite");
    return now;
  }
  let last = readClock();
  function sync() {
    const now = Math.max(last, readClock());
    if (playing) time = Math.min(duration, time + (now - last) * speed);
    last = now;
    if (time === duration) playing = false;
  }
  function snapshot() {
    sync();
    const frame = frames[Math.min(frames.length - 1, Math.floor(time / eventDurationMs))];
    return { ...frame, time, duration, playing, speed,
      progress: time === duration ? 1 : (time % eventDurationMs) / eventDurationMs,
      chapterProgress: (time - starts[frame.chapterIndex]) / (frame.chapter.events.length * eventDurationMs),
      totalProgress: time / duration };
  }
  function seek(ms: number) {
    if (!Number.isFinite(ms)) throw new RangeError("Seek time must be finite");
    sync(); time = Math.max(0, Math.min(duration, ms));
    return snapshot();
  }
  function seekChapter(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length) throw new RangeError("Unknown chapter");
    return seek(starts[index]);
  }
  return {
    snapshot, seek, seekChapter,
    /** Playing at the end replays the story; pausing never loses elapsed time. */
    play() { sync(); if (time === duration) time = 0; playing = true; return snapshot(); },
    pause() { sync(); playing = false; return snapshot(); },
    setSpeed(value: number) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError("Speed must be positive and finite");
      sync(); speed = value; return snapshot();
    },
    next() { return seekChapter(Math.min(chapters.length - 1, snapshot().chapterIndex + 1)); },
    prev() { return seekChapter(Math.max(0, snapshot().chapterIndex - 1)); },
  };
}
