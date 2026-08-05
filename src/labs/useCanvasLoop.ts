import { useEffect, useRef } from "react";

type Size = { width: number; height: number };

export function useCanvasLoop(
  setup: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, getSize: () => Size) => {
    step: (dtMs: number) => void;
    draw: () => void;
  },
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const { step, draw } = setup(canvas, ctx, () => ({ width, height }));

    // The ResizeObserver's initial callback fires asynchronously, after this
    // effect body returns — always, even when the box didn't change size.
    // resize() resets the canvas bitmap, so in the reduced-motion branch
    // below (a single synchronous draw() and no rAF loop) that initial
    // callback used to wipe the one and only frame, leaving the canvas
    // permanently blank. Redrawing here too — and on every later resize —
    // keeps the frozen frame frozen instead of erased.
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    ro.observe(canvas);

    if (reduced) {
      for (let i = 0; i < 900; i++) step(16);
      draw();
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? now - last : 16;
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return canvasRef;
}
