import { useEffect, useRef } from "react";

/**
 * Site-wide pointer aura — a soft radial glow that trails the cursor with
 * damped easing, blended over every section's background so the whole page
 * feels lit by the visitor's presence. Fine-pointer desktops only; renders
 * nothing for touch, reduced motion, or small screens. Pure CSS gradient on
 * one fixed div, moved from rAF — no layout, no paint storms.
 */
export function CursorAura() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ok =
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;

    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 3;
    let x = tx;
    let y = ty;
    let visible = false;

    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.background = `radial-gradient(420px circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(61, 220, 132, 0.07), rgba(94, 230, 255, 0.04) 45%, transparent 70%)`;
      if (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        el.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      visible = false;
      el.style.opacity = "0";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-0 transition-opacity duration-500"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
