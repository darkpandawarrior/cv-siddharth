import { useRef, useState } from "react";
import { MapPin, Navigation, Zap } from "lucide-react";

const MAX_TILT_DEG = 14;

/**
 * 3D pointer-tracked Android phone mockup for the hero. Pure CSS
 * perspective transforms — no WebGL payload for a decorative element.
 */
export function TiltPhone() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("rotateX(8deg) rotateY(-12deg)");
  const [glare, setGlare] = useState({ x: 30, y: 20, opacity: 0.12 });

  function onPointerMove(e: React.PointerEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * 2 * MAX_TILT_DEG;
    const rx = (0.5 - py) * 2 * MAX_TILT_DEG;
    setTransform(`rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg)`);
    setGlare({ x: px * 100, y: py * 100, opacity: 0.2 });
  }

  function onPointerLeave() {
    setTransform("rotateX(8deg) rotateY(-12deg)");
    setGlare({ x: 30, y: 20, opacity: 0.12 });
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="hidden select-none justify-center lg:flex"
      style={{ perspective: "1100px" }}
      aria-hidden
    >
      <div
        className="relative h-[420px] w-[210px] rounded-[2rem] border border-line bg-card shadow-2xl shadow-accent/10 transition-transform duration-150 ease-out"
        style={{ transform, transformStyle: "preserve-3d" }}
      >
        {/* glare */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[2rem]"
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity}), transparent 60%)`,
          }}
        />
        {/* punch-hole camera */}
        <div className="absolute left-1/2 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-ink" />

        {/* screen */}
        <div className="absolute inset-2 top-8 flex flex-col gap-2.5 overflow-hidden rounded-[1.4rem] bg-surface p-3">
          <p className="font-display text-[11px] font-bold text-zinc-400">
            sid<span className="text-accent">.</span>android
          </p>

          <div className="rounded-xl bg-card p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-accent">
              <Navigation size={11} /> Live trip · dead reckoning
            </div>
            {/* fake GPS track */}
            <svg viewBox="0 0 160 56" className="mt-1.5 w-full">
              <path
                d="M4 48 C 30 40, 38 18, 64 22 S 110 44, 132 26 S 152 10, 156 8"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="156" cy="8" r="4" fill="var(--color-accent)" />
            </svg>
            <p className="mt-1 text-[9px] text-zinc-500">accuracy 95% · spike-filtered</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-card p-2.5">
              <p className="font-display text-base font-bold text-accent">50k+</p>
              <p className="text-[9px] leading-tight text-zinc-500">monthly users</p>
            </div>
            <div className="rounded-xl bg-card p-2.5">
              <p className="font-display text-base font-bold text-accent">-80%</p>
              <p className="text-[9px] leading-tight text-zinc-500">crashes</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl bg-card p-2.5 text-[10px] text-zinc-400">
            <Zap size={11} className="shrink-0 text-accent" /> 92% Jetpack Compose
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-card p-2.5 text-[10px] text-zinc-400">
            <MapPin size={11} className="shrink-0 text-accent" /> Foreground service · floating bubble
          </div>
        </div>
      </div>
    </div>
  );
}
