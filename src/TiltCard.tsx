import { useRef } from "react";

/**
 * Subtle 3D hover tilt for cards. Writes transforms straight to the DOM —
 * pointer movement never triggers a React render.
 */
export function TiltCard({ children, maxTilt = 5 }: { children: React.ReactNode; maxTilt?: number }) {
  const innerRef = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = innerRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.transform = `rotateX(${((0.5 - py) * 2 * maxTilt).toFixed(2)}deg) rotateY(${((px - 0.5) * 2 * maxTilt).toFixed(2)}deg) translateZ(6px)`;
  }

  function onPointerLeave() {
    if (innerRef.current) innerRef.current.style.transform = "";
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="h-full motion-reduce:[&>*]:!transform-none"
      style={{ perspective: "900px" }}
    >
      <div ref={innerRef} className="h-full transition-transform duration-200 ease-out" style={{ transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}
