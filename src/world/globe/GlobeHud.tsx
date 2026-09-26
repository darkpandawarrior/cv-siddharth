import { useSyncExternalStore } from "react";
import { WMO_LABEL, type SkyState } from "../../lib/sky.ts";

// Restated from SceneActivity.tsx's own useReducedMotion rather than
// imported: that file also exports SceneActivity, which statically imports
// @react-three/fiber, and this component is SSR-rendered (GlobePanel's own
// "SSR renders the same facts" contract) - a plain import of any name from
// that module drags the r3f import into the server bundle too, which the
// import-protection plugin denies outright (verified: `npx vite build`
// fails with "Import denied in server environment... @react-three/fiber").
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export interface GlobeHudProps {
  sky: SkyState | null;
  tier: 1 | 2 | 3;
  hasWebGL: boolean;
}

/**
 * GLOBE's origin chip (living-ledger-spec.md#6.3 task 2): "Pune origin lit
 * by useSky().daypart... with today's weather glyph." The "glyph" is a
 * plain WMO_LABEL word (sky.ts, the same table SiteFooter's own weather chip
 * reads) rather than an emoji - "no emoji as data" (G8) rules that out even
 * for decorative chrome.
 *
 * Also carries `data-autorotate` - whether OrbitControls is actually
 * spinning right now (off under reduced motion or at T3, "ambient off at
 * T3, auto-rotate frozen at T3") - the one flag e2e/globe.spec.ts reads for
 * that acceptance line. Rendered in both the WebGL and the no-WebGL branch
 * (Globe.tsx): there is always a Pune reading, even when there is nothing
 * to orbit.
 */
export function GlobeHud({ sky, tier, hasWebGL }: GlobeHudProps) {
  const reducedMotion = useReducedMotion();
  const autoRotate = hasWebGL && !reducedMotion && tier !== 3;
  const daypart = sky?.daypart ?? null;
  const tempC = sky?.weather?.tempC;
  const weatherLabel = sky?.weather ? WMO_LABEL[sky.weather.code] : undefined;

  return (
    <div
      data-autorotate={autoRotate ? "on" : "off"}
      className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur"
    >
      <span>
        Pune{daypart ? ` · ${daypart}` : ""}
        {weatherLabel ? ` · ${weatherLabel}` : ""}
        {tempC != null ? ` · ${Math.round(tempC)}°C` : ""}
      </span>
      {hasWebGL && <span className="hidden text-muted sm:inline">{"· drag to orbit"}</span>}
    </div>
  );
}
