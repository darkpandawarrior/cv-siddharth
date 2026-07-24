import { useEffect, useRef } from "react";

/**
 * A small 3D Android bugdroid pinned to the right edge that rides the
 * scrollbar: it travels down the viewport with scroll progress and swings
 * back and forth in 3D as you scroll. Built from CSS shapes — no assets.
 * Transforms are written directly to the DOM via rAF (no React re-renders),
 * and the whole thing is hidden on small screens and for reduced motion.
 */
export function ScrollBot() {
  const trackRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const lastY = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    const bot = botRef.current;
    if (!track || !bot) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const apply = () => {
      raf.current = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      const travel = doc.clientHeight - 140; // keep the bot inside the viewport
      const direction = window.scrollY >= lastY.current ? 1 : -1;
      lastY.current = window.scrollY;
      // Swing back and forth as the page scrolls; lean into the direction.
      const swing = Math.sin(window.scrollY / 120) * 38;
      track.style.transform = `translateY(${(progress * travel).toFixed(1)}px)`;
      bot.style.transform = `rotateY(${swing.toFixed(1)}deg) rotateZ(${direction * Math.min(Math.abs(swing) / 5, 7)}deg)`;
    };
    const schedule = () => {
      if (!raf.current) raf.current = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed right-3 top-6 z-30 hidden lg:block motion-reduce:hidden print:hidden"
      aria-hidden
    >
      <div ref={trackRef} style={{ willChange: "transform" }}>
        <div style={{ perspective: "300px" }}>
          <div
            ref={botRef}
            className="bot-bob relative h-[72px] w-[52px]"
            style={{ transformStyle: "preserve-3d", willChange: "transform" }}
          >
            {/* antennas */}
            <div className="absolute left-[13px] top-0 h-3 w-[2px] -rotate-[30deg] rounded-full bg-accent" />
            <div className="absolute right-[13px] top-0 h-3 w-[2px] rotate-[30deg] rounded-full bg-accent" />
            {/* head */}
            <div className="absolute left-1.5 top-2 h-[18px] w-[40px] rounded-t-full bg-accent">
              <div className="absolute left-[9px] top-[9px] h-[5px] w-[5px] rounded-full bg-ink" />
              <div className="absolute right-[9px] top-[9px] h-[5px] w-[5px] rounded-full bg-ink" />
            </div>
            {/* body */}
            <div className="absolute left-1.5 top-[22px] h-[26px] w-[40px] rounded-b-lg bg-accent/90" />
            {/* arms */}
            <div className="absolute left-0 top-[24px] h-[18px] w-[5px] rounded-full bg-accent/80" />
            <div className="absolute right-0 top-[24px] h-[18px] w-[5px] rounded-full bg-accent/80" />
            {/* legs */}
            <div className="absolute bottom-3 left-[15px] h-[12px] w-[5px] rounded-full bg-accent/80" />
            <div className="absolute bottom-3 right-[15px] h-[12px] w-[5px] rounded-full bg-accent/80" />
            {/* depth shadow */}
            <div className="absolute -bottom-1 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-accent/15 blur-[2px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
