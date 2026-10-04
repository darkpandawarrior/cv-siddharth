import { expect, test, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { surfaceClicks, surfaceHover, surfacePicker } from "./exploreCanvas.ts";

test("surface ray hits the near side in the right-handed frame and misses space", () => {
  const camera = new PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(26, 0, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }) } as HTMLCanvasElement;
  const pick = surfacePicker(canvas, () => ({ camera }));
  expect(pick(300, 300)?.lat).toBeCloseTo(0); expect(pick(300, 300)?.lon).toBeCloseTo(0);
  expect(pick(330, 300)!.lon).toBeGreaterThan(0);
  expect(pick(0, 0)).toBeNull();
});
test("surface clicks ignore drags, cancellation and secondary pointers, then detach", () => {
  const target = new EventTarget() as HTMLCanvasElement;
  const pick = vi.fn(() => ({ lat: 0, lon: 0 })), click = vi.fn();
  const detach = surfaceClicks(target, pick, click);
  const send = (type: string, x = 0, primary = true) => target.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: 0, pointerId: 1, isPrimary: primary, button: 0 }));
  send("pointerdown"); send("pointerup"); expect(click).toHaveBeenCalledTimes(1);
  send("pointerdown"); send("pointermove", 30); send("pointermove", 0); send("pointerup"); expect(click).toHaveBeenCalledTimes(1);
  send("pointerdown"); send("pointercancel"); send("pointerup"); expect(click).toHaveBeenCalledTimes(1);
  send("pointerdown"); send("pointerdown", 0, false); send("pointerup"); expect(click).toHaveBeenCalledTimes(1);
  detach(); send("pointerdown"); send("pointerup"); expect(click).toHaveBeenCalledTimes(1);
});

test("surface hover reports the picked point for a mouse, and null while dragging, off-globe or on touch", () => {
  const target = new EventTarget() as HTMLCanvasElement;
  const pick = vi.fn((x: number) => (x < 0 ? null : { lat: 1, lon: 2 }));
  const onMove = vi.fn();
  const detach = surfaceHover(target, pick, onMove);
  const send = (type: string, opts: Partial<{ clientX: number; buttons: number; pointerType: string }> = {}) =>
    target.dispatchEvent(Object.assign(new Event(type), { clientX: 0, clientY: 0, buttons: 0, pointerType: "mouse", ...opts }));

  send("pointermove");
  expect(onMove).toHaveBeenLastCalledWith({ lat: 1, lon: 2, clientX: 0, clientY: 0 });

  send("pointermove", { buttons: 1 }); // dragging/orbiting
  expect(onMove).toHaveBeenLastCalledWith(null);

  send("pointermove", { pointerType: "touch" }); // touch keeps its own tap behaviour
  expect(onMove).toHaveBeenLastCalledWith(null);

  send("pointermove", { clientX: -1 }); // pick() misses the globe
  expect(onMove).toHaveBeenLastCalledWith(null);

  send("pointerleave");
  expect(onMove).toHaveBeenLastCalledWith(null);

  detach();
  onMove.mockClear();
  send("pointermove");
  expect(onMove).not.toHaveBeenCalled();
});
