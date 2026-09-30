import { useEffect, useRef } from "react";

/** Keep the first tap from opening a sheet over a double-tap's second tap. */
export function useMarkerClick() {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef<{ at: number; x: number; y: number } | null>(null);
  useEffect(() => () => { if (pending.current !== null) clearTimeout(pending.current); }, []);
  return (event: { clientX: number; clientY: number }, select: () => void) => {
    const now = performance.now();
    const last = previous.current;
    if (pending.current !== null) clearTimeout(pending.current);
    if (last && now - last.at < 350 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 40) {
      previous.current = null;
      pending.current = null;
      return;
    }
    previous.current = { at: now, x: event.clientX, y: event.clientY };
    pending.current = setTimeout(() => { pending.current = null; previous.current = null; select(); }, 350);
  };
}
