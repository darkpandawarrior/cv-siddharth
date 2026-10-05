import { useEffect, useRef } from "react";
import { useReducedMotion } from "../../SceneActivity.tsx";

/** Pointer attraction preserves the element's existing transform and keyboard behavior. */
export function useMagnetic<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = ref.current;
    if (!element || reduced) return;
    const fine = window.matchMedia("(pointer: fine)");
    let frame = 0, x = 0, y = 0, tx = 0, ty = 0, vx = 0, vy = 0, hovering = false;
    const original = element.style.translate;
    const tick = () => {
      if (hovering) {
        x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      } else {
        vx = (vx - x * 0.12) * 0.72; vy = (vy - y * 0.12) * 0.72;
        x += vx; y += vy;
      }
      element.style.translate = `${x}px ${y}px`;
      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > 0.05) frame = requestAnimationFrame(tick);
      else { frame = 0; if (!hovering) element.style.translate = original; }
    };
    const start = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch") return;
      const box = element.getBoundingClientRect();
      tx = (event.clientX - box.left - box.width / 2 + x) * 0.35;
      ty = (event.clientY - box.top - box.height / 2 + y) * 0.35;
      hovering = true; vx = vy = 0; start();
    };
    const leave = () => { hovering = false; tx = ty = 0; start(); };
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0; x = y = tx = ty = vx = vy = 0;
      hovering = false; element.style.translate = original;
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", leave);
    fine.addEventListener("change", reset);
    return () => {
      reset();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", leave);
      fine.removeEventListener("change", reset);
    };
  }, [reduced]);
  return ref;
}
