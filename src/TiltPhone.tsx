import { useEffect, useRef } from "react";
import type { PhoneShot } from "./Phone3DScene.tsx";

const MAX_TILT_DEG = 9;

/** The same shipped screen as the WebGL device, with no GPU dependency. */
export function TiltPhone({ shot }: { shot: PhoneShot }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    phoneRef.current?.style.setProperty("transform", reduced.current ? "none" : "rotateX(5deg) rotateY(-8deg)");
  }, []);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced.current) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || !phoneRef.current) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    phoneRef.current.style.transform = `rotateX(${((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(1)}deg) rotateY(${((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(1)}deg)`;
  }

  function onPointerLeave() {
    if (!reduced.current && phoneRef.current) phoneRef.current.style.transform = "rotateX(5deg) rotateY(-8deg)";
  }

  return (
    <div ref={frameRef} className="hero-device" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} aria-hidden>
      <div ref={phoneRef} className="hero-device-shell">
        <span className="hero-device-camera" />
        <img src={shot.src} alt="" className="hero-device-screen" decoding="async" />
      </div>
    </div>
  );
}
