export type FrameLoop = "always" | "demand" | "never";
export interface CaptureApi {
  pause(): Promise<void>;
  resume(): void;
}
export interface CaptureHost {
  __WORLD_CAPTURE_TEST__?: boolean;
  __WORLD_CAPTURE__?: CaptureApi;
}

declare global {
  interface Window {
    __WORLD_CAPTURE_TEST__?: boolean;
    __WORLD_CAPTURE__?: CaptureApi;
  }
}

/** Only Playwright opts in. A capture waits for two complete terrain frames. */
export function installCaptureControl(host: CaptureHost, getMode: () => FrameLoop, setMode: (mode: FrameLoop) => void) {
  if (host.__WORLD_CAPTURE_TEST__ !== true) return null;
  let previous: FrameLoop | null = null;
  let frames = 0;
  let resolvePause: (() => void) | null = null;
  const api: CaptureApi = {
    pause: () => {
      if (previous !== null) return Promise.resolve();
      frames = 0;
      return new Promise<void>((resolve) => { resolvePause = resolve; });
    },
    resume: () => {
      if (previous !== null) setMode(previous);
      previous = null;
      resolvePause?.();
      resolvePause = null;
    },
  };
  host.__WORLD_CAPTURE__ = api;
  return {
    frame(terrainReady: boolean) {
      if (!resolvePause || !terrainReady) return;
      if (++frames < 2) return;
      previous = getMode();
      setMode("never");
      resolvePause();
      resolvePause = null;
    },
    dispose() {
      api.resume();
      if (host.__WORLD_CAPTURE__ === api) delete host.__WORLD_CAPTURE__;
    },
  };
}
