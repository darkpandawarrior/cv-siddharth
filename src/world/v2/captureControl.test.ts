import { expect, test, vi } from "vitest";
import { installCaptureControl, type CaptureHost, type FrameLoop } from "./captureControl.ts";

test("production installs no capture API and never changes the frame loop", () => {
  for (const host of [{}, { __WORLD_CAPTURE_TEST__: false }] as CaptureHost[]) {
    const setMode = vi.fn();
    expect(installCaptureControl(host, () => "always", setMode)).toBeNull();
    expect(host.__WORLD_CAPTURE__).toBeUndefined();
    expect(setMode).not.toHaveBeenCalled();
  }
});

test.each(["always", "demand"] as const)("capture waits for terrain frames and restores %s", async (initial) => {
  const host: CaptureHost = { __WORLD_CAPTURE_TEST__: true };
  let mode: FrameLoop = initial;
  const control = installCaptureControl(host, () => mode, (next) => { mode = next; })!;
  const paused = host.__WORLD_CAPTURE__!.pause();
  control.frame(false);
  control.frame(true);
  expect(mode).toBe(initial);
  control.frame(true);
  await paused;
  expect(mode).toBe("never");
  host.__WORLD_CAPTURE__!.resume();
  expect(mode).toBe(initial);
  const again = host.__WORLD_CAPTURE__!.pause();
  control.frame(true);
  control.frame(true);
  await again;
  control.dispose();
  expect(mode).toBe(initial);
  expect(host.__WORLD_CAPTURE__).toBeUndefined();
});
