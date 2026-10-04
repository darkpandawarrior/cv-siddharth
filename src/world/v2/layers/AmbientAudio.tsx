import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useSky, useWeather } from "../../../lib/useSky.ts";
import { deviceTier } from "../../deviceTier.ts";
import { disposeAudio, initAudio, isMuted, setAmbient, setAudioListener, toggleMuted } from "../../audio.ts";
import { riverDischargeIst } from "../live/liveBinding.ts";
import { riverX } from "../valley.ts";

export const layer = { id: "ambient-audio", order: 70 };

/** The existing weather bus supplies S4 and S6. No sound starts on mount. */
export default function AmbientAudio() {
  const sky = useSky();
  const { weather, river, rain6hMm } = useWeather();
  const gl = useThree((state) => state.gl);
  const [muted, setMuted] = useState(isMuted);
  const elapsed = useRef(0);
  const forward = useRef(new Vector3());
  const tier = deviceTier();

  useEffect(() => {
    gl.domElement.setAttribute("data-ambient-audio", "mounted");
    const gesture = (event: Event) => {
      if (event.isTrusted) initAudio();
    };
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("keydown", gesture);
    return () => {
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
      gl.domElement.removeAttribute("data-ambient-audio");
      disposeAudio();
    };
  }, [gl]);

  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.1) return;
    elapsed.current %= 0.1;
    camera.getWorldDirection(forward.current);
    setAudioListener(camera.position.toArray(), forward.current.toArray(), camera.up.toArray());
    const daypart = sky?.daypart === "golden"
      ? (sky.sun.azimuthDeg < 180 ? "dawn" : "dusk")
      : sky?.daypart ?? "day";
    setAmbient({
      dischargeM3s: river && sky ? riverDischargeIst(sky.now, river) : null,
      range7d: river?.range7d ?? null,
      windKmh: weather?.windKmh ?? null,
      rainMmH: weather?.precipMmH ?? null,
      rain6hMm,
      daypart,
      tier,
      waterPosition: [riverX(camera.position.z), 0, camera.position.z],
    });
  });

  // The canvas is aria-hidden. Its world container keeps the mute reachable.
  const container = gl.domElement.closest<HTMLElement>("[data-world]");
  return container ? <Html
    fullscreen
    portal={{ current: container }}
    calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
    style={{ pointerEvents: "none" }}
    zIndexRange={[20, 20]}
  >
    <button
      type="button"
      className="pointer-events-auto absolute right-3 top-16 z-20 rounded-full border border-line bg-card/90 px-3 py-2 text-xs text-ink"
      aria-label={muted ? "Unmute world sound" : "Mute world sound"}
      aria-pressed={muted}
      onClick={() => setMuted(toggleMuted())}
    >
      {muted ? "Sound off" : "Sound on"}
    </button>
  </Html> : null;
}
