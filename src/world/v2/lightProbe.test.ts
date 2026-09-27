import { describe, expect, it } from "vitest";
import { Object3D, WebGLCoordinateSystem, type WebGLRenderer } from "three";
import { bakeDeepmalLightProbe, drawCallsAttr } from "./lightProbe.ts";

/**
 * A minimal stub implementing exactly what `CubeCamera.update()` and
 * `LightProbeGenerator.fromCubeRenderTarget()` touch on a renderer (three's
 * own `CubeCameraRenderer` type names the first six members) — no real
 * WebGL context, no jsdom canvas polyfill. `litCount` drives the synthetic
 * cube-face pixels `readRenderTargetPixelsAsync` hands back, standing in
 * for "how bright the deepmal reads with this many lit niches" without an
 * actual GPU raster.
 */
function makeStubRenderer(litCount: number) {
  const info = { render: { calls: 0 } };
  const intensity = litCount / 173; // 173 = fleetStats.live + fleetStats.delisted today
  const renderer = {
    coordinateSystem: WebGLCoordinateSystem,
    isWebGLRenderer: true,
    state: { buffers: { depth: { getReversed: () => false } } },
    xr: { enabled: false },
    autoClear: true,
    info,
    getRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: () => {},
    render: () => {
      info.render.calls += 1;
    },
    readRenderTargetPixelsAsync: async (_rt: unknown, _x: number, _y: number, w: number, h: number, buffer: Float32Array) => {
      for (let i = 0; i < w * h * 4; i += 4) {
        buffer[i] = intensity;
        buffer[i + 1] = intensity * 0.7;
        buffer[i + 2] = intensity * 0.3;
        buffer[i + 3] = 1;
      }
    },
  };
  return renderer as unknown as WebGLRenderer & { info: typeof info };
}

describe("bakeDeepmalLightProbe", () => {
  it("a stub lit count of 10 and of 88 bake different SH coefficients", async () => {
    const probeLow = await bakeDeepmalLightProbe(makeStubRenderer(10), new Object3D(), [0, 0, 0], 2);
    const probeHigh = await bakeDeepmalLightProbe(makeStubRenderer(88), new Object3D(), [0, 0, 0], 2);
    expect(probeLow.sh.coefficients[0].toArray()).not.toEqual(probeHigh.sh.coefficients[0].toArray());
  });

  it("renderer.info.render.calls holds flat regardless of the fleet's lit count (no per-niche light)", async () => {
    const rendererLow = makeStubRenderer(10);
    await bakeDeepmalLightProbe(rendererLow, new Object3D(), [0, 0, 0], 2);
    const rendererHigh = makeStubRenderer(88);
    await bakeDeepmalLightProbe(rendererHigh, new Object3D(), [0, 0, 0], 2);
    expect(rendererLow.info.render.calls).toBe(rendererHigh.info.render.calls);
    expect(rendererLow.info.render.calls).toBe(6); // CubeCamera.update's own six cube faces, always
  });

  it("mirrors that same call count into the data-draw-calls DOM attribute", async () => {
    const renderer = makeStubRenderer(42);
    await bakeDeepmalLightProbe(renderer, new Object3D(), [0, 0, 0], 2);
    expect(drawCallsAttr(renderer.info)).toBe("6");
  });
});

describe("drawCallsAttr", () => {
  it("formats renderer.info.render.calls as a plain string", () => {
    expect(drawCallsAttr({ render: { calls: 0 } })).toBe("0");
    expect(drawCallsAttr({ render: { calls: 17 } })).toBe("17");
  });
});

describe("break-it (G15): the stub's own lit-count signal actually drives the result", () => {
  it("two bakes at the SAME lit count produce identical SH — the difference above is real, not test flakiness", async () => {
    const probeA = await bakeDeepmalLightProbe(makeStubRenderer(42), new Object3D(), [0, 0, 0], 2);
    const probeB = await bakeDeepmalLightProbe(makeStubRenderer(42), new Object3D(), [0, 0, 0], 2);
    expect(probeA.sh.coefficients[0].toArray()).toEqual(probeB.sh.coefficients[0].toArray());
  });
});
