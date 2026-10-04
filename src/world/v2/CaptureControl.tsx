import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { installCaptureControl } from "./captureControl.ts";

export function CaptureControl() {
  const get = useThree((state) => state.get);
  const control = useRef<ReturnType<typeof installCaptureControl>>(null);
  useEffect(() => {
    const installed = installCaptureControl(window, () => get().frameloop, (mode) => get().setFrameloop(mode));
    control.current = installed;
    return () => { installed?.dispose(); control.current = null; };
  }, [get]);
  useFrame(({ gl }) => control.current?.frame(gl.domElement.dataset.terrainReady === "true"));
  return null;
}
