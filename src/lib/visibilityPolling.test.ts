import { afterEach, expect, it, vi } from "vitest";
import { startVisibilityPolling } from "./visibilityPolling.ts";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("pauses while hidden, resumes once if overdue, and waits if still fresh", async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("document", doc);
  const poll = vi.fn(async () => {});
  const stop = startVisibilityPolling(poll, 1000);
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(1);
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(500);
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
  expect(poll).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(500);
  expect(poll).toHaveBeenCalledTimes(2);
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(3000);
  expect(poll).toHaveBeenCalledTimes(2);
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
  doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(3);
  stop();
  await vi.advanceTimersByTimeAsync(3000);
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(poll).toHaveBeenCalledTimes(3);
});

it("starts hidden without fetching and coalesces visibility events during a poll", async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: true });
  vi.stubGlobal("document", doc);
  let finish: () => void = () => {};
  const poll = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const stop = startVisibilityPolling(poll, 1000);
  await vi.advanceTimersByTimeAsync(3000);
  expect(poll).not.toHaveBeenCalled();
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(poll).toHaveBeenCalledTimes(1);
  stop();
  finish();
  await vi.advanceTimersByTimeAsync(2000);
  expect(poll).toHaveBeenCalledTimes(1);
});
