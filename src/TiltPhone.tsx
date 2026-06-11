import { useEffect, useRef } from "react";
import { MapPin, Navigation, Zap } from "lucide-react";

const MAX_TILT_DEG = 14;
const BASE = { rx: 8, ry: -12 };

/**
 * 3D Android phone mockup for the hero. Pure CSS perspective transforms —
 * no WebGL payload for a decorative element. Three motion sources compose:
 * an idle float (CSS keyframes on the wrapper), scroll-driven sway, and
 * pointer tilt — the latter two write transforms directly to the DOM via
 * rAF so scrolling never re-renders React.
 */
export function TiltPhone() {
  const frameRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ rx: number; ry: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const apply = () => {
      raf.current = 0;
      // Pointer wins while hovering; otherwise sway back and forth with scroll.
      const sway = Math.sin(window.scrollY / 180) * 10;
      const { rx, ry } = pointer.current ?? { rx: BASE.rx, ry: BASE.ry + sway };
      phone.style.transform = `rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg)`;
    };
    const schedule = () => {
      if (!raf.current) raf.current = requestAnimationFrame(apply);
    };

    apply();
    if (reduced) return;
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    pointer.current = {
      rx: (0.5 - py) * 2 * MAX_TILT_DEG,
      ry: (px - 0.5) * 2 * MAX_TILT_DEG,
    };
    if (phoneRef.current) {
      phoneRef.current.style.transform = `rotateX(${pointer.current.rx.toFixed(1)}deg) rotateY(${pointer.current.ry.toFixed(1)}deg)`;
    }
    if (glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.2), transparent 60%)`;
    }
  }

  function onPointerLeave() {
    pointer.current = null;
    if (phoneRef.current) {
      phoneRef.current.style.transform = `rotateX(${BASE.rx}deg) rotateY(${BASE.ry}deg)`;
    }
    if (glareRef.current) {
      glareRef.current.style.background =
        "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 60%)";
    }
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="phone-float hidden select-none justify-center lg:flex"
      style={{ perspective: "1100px" }}
      aria-hidden
    >
      <div
        ref={phoneRef}
        className="relative h-[420px] w-[210px] rounded-[2rem] border border-line bg-card shadow-2xl shadow-accent/10 transition-transform duration-150 ease-out"
        style={{ transform: `rotateX(${BASE.rx}deg) rotateY(${BASE.ry}deg)`, transformStyle: "preserve-3d" }}
      >
        {/* glare */}
        <div
          ref={glareRef}
          className="pointer-events-none absolute inset-0 rounded-[2rem]"
          style={{
            background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 60%)",
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
              <Navigation size={11} className="nav-wiggle" /> Live trip · dead reckoning
            </div>
            {/* GPS track draws itself in a loop */}
            <svg viewBox="0 0 160 56" className="mt-1.5 w-full">
              <path
                d="M4 48 C 30 40, 38 18, 64 22 S 110 44, 132 26 S 152 10, 156 8"
                fill="none"
                stroke="var(--color-line)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                className="gps-draw"
                d="M4 48 C 30 40, 38 18, 64 22 S 110 44, 132 26 S 152 10, 156 8"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle className="gps-pulse" cx="156" cy="8" r="4" fill="var(--color-accent)" />
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
