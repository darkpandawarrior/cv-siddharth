import { useEffect, useRef } from "react";

/** Keep the first tap from opening a sheet over a double-tap's second tap. */
export function useMarkerClick(curated = false) {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef<{ at: number; x: number; y: number } | null>(null);
  useEffect(() => () => { if (pending.current !== null) clearTimeout(pending.current); }, []);
  return (event: { clientX: number; clientY: number }, select: () => void) => {
    if (!curated && claimGuideClick(event)) return;
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

export const GUIDE_CLICK_RADIUS_PX = 12;
export interface GuideClickTarget { x: number; y: number; priority?: number; select: (event: { clientX: number; clientY: number }) => void }
let guideTargets: (() => GuideClickTarget[]) | null = null;

export function registerGuideClickTargets(project: () => GuideClickTarget[]): () => void {
  guideTargets = project;
  return () => { if (guideTargets === project) guideTargets = null; };
}

export function nearestGuideClickTarget(targets: GuideClickTarget[], event: { clientX: number; clientY: number }): GuideClickTarget | undefined {
  let nearest: GuideClickTarget | undefined, distance = GUIDE_CLICK_RADIUS_PX;
  for (const target of targets) {
    const gap = Math.hypot(target.x - event.clientX, target.y - event.clientY);
    if (gap > GUIDE_CLICK_RADIUS_PX) continue;
    const priority = target.priority ?? 0, previousPriority = nearest?.priority ?? 0;
    if (!nearest || priority > previousPriority || (priority === previousPriority && gap < distance)) { nearest = target; distance = gap; }
  }
  return nearest;
}

/** Ambient geometry may be nearer on the ray than the curated surface pin. */
export function claimGuideClick(event: { clientX: number; clientY: number }): boolean {
  const target = nearestGuideClickTarget(guideTargets?.() ?? [], event);
  if (!target) return false;
  target.select(event);
  return true;
}

/** Dense columns can share a native pixel; choose their projected midpoint. */
export function nearestScreenPointIndex(points: readonly { x: number; y: number }[], point: { x: number; y: number }): number {
  let nearest = -1, distance = Infinity;
  points.forEach((target, index) => {
    const gap = (target.x - point.x) ** 2 + (target.y - point.y) ** 2;
    if (gap < distance) { nearest = index; distance = gap; }
  });
  return nearest;
}
