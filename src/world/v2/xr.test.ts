import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceTier, resetDeviceTierForTest } from "../deviceTier.ts";
import { cancelXR, enterVR, getXRPresenting, getXRTier, prepareXR, registerXR, startXR, subscribePresenting, subscribeXRTier, supportsVR } from "./xr.ts";
import { Post } from "./Post.tsx";

const mocks = vi.hoisted(() => ({ xr: { isPresenting: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }, composer: vi.fn() }));
vi.mock("@react-three/fiber", () => ({ useThree: (select: (state: unknown) => unknown) => select({ gl: { xr: mocks.xr } }) }));
vi.mock("@react-three/postprocessing", () => ({ EffectComposer: mocks.composer, Bloom: () => null, SMAA: () => null }));

beforeEach(() => { vi.clearAllMocks(); mocks.xr.isPresenting = false; resetDeviceTierForTest(); });
afterEach(() => { cancelXR(); vi.unstubAllGlobals(); resetDeviceTierForTest(); });

describe("native XR entry and composer bypass", () => {
  it.each([1, 2, 3] as const)("does not mount the composer while XR presents on tier %s", (tier) => {
    mocks.xr.isPresenting = true;
    expect(renderToString(createElement(Post, { tier, look: "golden" }))).toBe("");
    expect(mocks.composer).not.toHaveBeenCalled();
    mocks.xr.isPresenting = false;
    renderToString(createElement(Post, { tier, look: "golden" }));
    expect(mocks.composer).toHaveBeenCalledOnce();
  });
  it("subscribes and detaches the renderer session events", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePresenting(mocks.xr as unknown as WebGLRenderer["xr"], listener);
    expect(mocks.xr.addEventListener.mock.calls).toEqual([["sessionstart", listener], ["sessionend", listener]]);
    unsubscribe();
    expect(mocks.xr.removeEventListener.mock.calls).toEqual(mocks.xr.addEventListener.mock.calls);
  });
  it("exposes VR only after an affirmative capability result", async () => {
    vi.stubGlobal("navigator", {});
    expect(await supportsVR()).toBe(false);
    const support = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { xr: { isSessionSupported: support } });
    expect(await supportsVR()).toBe(false);
    support.mockResolvedValue(true);
    expect(await supportsVR()).toBe(true);
    expect(support).toHaveBeenLastCalledWith("immersive-vr");
    support.mockRejectedValue(new Error("denied"));
    expect(await supportsVR()).toBe(false);
  });
  it("requests a session on the gesture and restores the tier after exit", async () => {
    vi.stubGlobal("window", { __DEVICE_TIER_TEST__: 1 });
    expect(deviceTier()).toBe(1);
    prepareXR();
    const session = new EventTarget();
    const requestSession = vi.fn().mockResolvedValue(session);
    const setSession = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { xr: { requestSession } });
    const gl = { xr: { enabled: false, setSession } } as unknown as WebGLRenderer;
    await startXR(gl);
    expect(requestSession).toHaveBeenCalledWith("immersive-vr", { optionalFeatures: ["local-floor"] });
    expect(gl.xr.enabled).toBe(true);
    expect(setSession).toHaveBeenCalledWith(session);
    expect(deviceTier()).toBe(2);
    expect(getXRTier()).toBe(2);
    expect(getXRPresenting()).toBe(true);
    session.dispatchEvent(new Event("end"));
    expect(gl.xr.enabled).toBe(false);
    expect(deviceTier()).toBe(1);
    expect(getXRTier()).toBeNull();
    expect(getXRPresenting()).toBe(false);
  });
  it("cleans up a session that the renderer cannot attach", async () => {
    vi.stubGlobal("window", { __DEVICE_TIER_TEST__: 1 });
    prepareXR();
    const session = Object.assign(new EventTarget(), { end: vi.fn().mockResolvedValue(undefined) });
    vi.stubGlobal("navigator", { xr: { requestSession: vi.fn().mockResolvedValue(session) } });
    const gl = { xr: { enabled: false, setSession: vi.fn().mockRejectedValue(new Error("attach failed")) } } as unknown as WebGLRenderer;
    await expect(startXR(gl)).rejects.toThrow("attach failed");
    expect(gl.xr.enabled).toBe(false);
    expect(deviceTier()).toBe(1);
    expect(session.end).toHaveBeenCalledOnce();
    expect(getXRTier()).toBeNull();
  });
  it("publishes T2 preparation once and restores the original tier on cancellation", () => {
    vi.stubGlobal("window", { __DEVICE_TIER_TEST__: 3 });
    const listener = vi.fn();
    const unsubscribe = subscribeXRTier(listener);
    prepareXR(); prepareXR();
    expect(listener).toHaveBeenCalledOnce();
    expect(getXRTier()).toBe(2);
    expect(deviceTier()).toBe(2);
    cancelXR(); cancelXR();
    expect(getXRTier()).toBeNull();
    expect(deviceTier()).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("clears the prepared tier when the headset refuses requestSession", async () => {
    vi.stubGlobal("window", { __DEVICE_TIER_TEST__: 1 });
    vi.stubGlobal("navigator", { xr: { requestSession: vi.fn().mockRejectedValue(new Error("denied")) } });
    prepareXR();
    const gl = { xr: { enabled: false, setSession: vi.fn() } } as unknown as WebGLRenderer;
    await expect(startXR(gl)).rejects.toThrow("denied");
    expect(getXRTier()).toBeNull();
    expect(deviceTier()).toBe(1);
    expect(gl.xr.enabled).toBe(false);
  });
  it("connects the HUD action only while its canvas controller exists", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const unregister = registerXR(action);
    await enterVR();
    expect(action).toHaveBeenCalledOnce();
    unregister();
    await expect(enterVR()).rejects.toThrow("still loading");
  });
});
