import type { WebGLRenderer } from "three";
import { resetDeviceTierForTest } from "../deviceTier.ts";

let tier: 2 | null = null;
let presenting = false;
let previousOverride: Window["__DEVICE_TIER_TEST__"];
const listeners = new Set<() => void>();
export function getXRTier(): 2 | null { return tier; }
export function getXRPresenting(): boolean { return presenting; }
export function subscribeXRTier(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function prepareXR(): void {
  if (tier === 2) return;
  previousOverride = window.__DEVICE_TIER_TEST__;
  window.__DEVICE_TIER_TEST__ = 2;
  resetDeviceTierForTest();
  tier = 2;
  for (const listener of listeners) listener();
}
export function cancelXR(): void {
  if (tier === null) return;
  window.__DEVICE_TIER_TEST__ = previousOverride;
  resetDeviceTierForTest();
  tier = null;
  presenting = false;
  for (const listener of listeners) listener();
}

export async function supportsVR(): Promise<boolean> {
  try { return typeof navigator !== "undefined" && await navigator.xr?.isSessionSupported("immersive-vr") === true; }
  catch { return false; }
}

/** Post subscribes to these native events, with no per-frame polling. */
export function subscribePresenting(xr: WebGLRenderer["xr"], listener: () => void): () => void {
  xr.addEventListener("sessionstart", listener);
  xr.addEventListener("sessionend", listener);
  return () => {
    xr.removeEventListener("sessionstart", listener);
    xr.removeEventListener("sessionend", listener);
  };
}

let enter: (() => Promise<void>) | null = null;
export function registerXR(action: () => Promise<void>): () => void {
  enter = action;
  return () => { if (enter === action) enter = null; };
}
export async function enterVR(): Promise<void> {
  if (!enter) throw new Error("The valley is still loading.");
  await enter();
}

/** Called directly by the button gesture, before yielding to the headset. */
export async function startXR(gl: WebGLRenderer): Promise<void> {
  if (gl.xr.isPresenting) return;
  const wasEnabled = gl.xr.enabled;
  const restore = () => {
    gl.xr.enabled = wasEnabled;
    cancelXR();
  };
  let session: XRSession | undefined;
  try {
    if (!navigator.xr) throw new Error("VR is unavailable in this browser.");
    session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    gl.xr.enabled = true;
    session.addEventListener("end", restore, { once: true });
    await gl.xr.setSession(session);
    presenting = true;
    for (const listener of listeners) listener();
  }
  catch (error) {
    restore();
    await session?.end().catch(() => {});
    throw error;
  }
}
