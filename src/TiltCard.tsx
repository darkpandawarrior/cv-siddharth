import { useRef } from "react";

/**
 * Subtle 3D hover tilt + pointer-tracked spotlight glow for cards. Writes
 * transforms and CSS vars straight to the DOM — pointer movement never
 * triggers a React render. Shared by case studies and project cards so the
 * "signature hover" feel is one implementation, not a copy per section.
 */
export function TiltCard({
  children,
  maxTilt = 5,
  glow = true,
}: {
  children: React.ReactNode;
  maxTilt?: number;
  glow?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = innerRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.transform = `rotateX(${((0.5 - py) * 2 * maxTilt).toFixed(2)}deg) rotateY(${((px - 0.5) * 2 * maxTilt).toFixed(2)}deg) translateZ(6px)`;
    glowRef.current?.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    glowRef.current?.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }

  function onPointerLeave() {
    if (innerRef.current) innerRef.current.style.transform = "";
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="group/tilt h-full motion-reduce:[&_*]:!transform-none"
      style={{ perspective: "900px" }}
    >
      <div
        ref={innerRef}
        className="relative h-full overflow-hidden rounded-2xl transition-transform duration-200 ease-out"
        style={{ transformStyle: "preserve-3d" }}
      >
        {glow && (
          <div
            ref={glowRef}
            aria-hidden
            className="tilt-glow pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
          />
        )}
        <div className="relative z-10 h-full">{children}</div>
      </div>
    </div>
  );
}
