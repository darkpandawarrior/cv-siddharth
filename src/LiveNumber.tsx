import { useEffect, useRef, useState } from "react";

/**
 * A numeric/string readout that briefly flashes when the value actually
 * changes, instead of silently snapping — the financial-ticker convention
 * (a changed cell flashes, doesn't quietly update).
 *
 * Renders the value as plain text on first paint (SSR-safe, matches server
 * markup exactly — no hydration mismatch): the flash is something the mount
 * effect adds on top of an already-correct render, never a prerequisite for
 * seeing the number. Fixes a real, observed mismatch in feel: Pulse.tsx's
 * `Bar` already animates width over 700ms on a real live change, but the
 * number beside it snapped instantly — two representations of the same live
 * value disagreeing about whether anything moved.
 *
 * `prefers-reduced-motion: reduce` turns the flash off outright (index.css);
 * the number itself is never gated on it since it was never animated.
 */
export function LiveNumber({ value, className = "" }: { value: string | number; className?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 400);
    return () => clearTimeout(t);
  }, [value]);

  return <span className={`${flash ? "live-number-flash " : ""}${className}`}>{value}</span>;
}
