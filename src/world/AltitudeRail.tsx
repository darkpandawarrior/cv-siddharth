import { useSyncExternalStore } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { altitudeFor, focusHandoffUrl, type Altitude } from "./altitude.ts";

// Restated from SceneActivity.tsx rather than imported (same reasoning as
// GlobeHud.tsx's own copy of this hook): that file also statically imports
// @react-three/fiber, and AltitudeRail mounts from RoomFrame (rooms.tsx),
// which every room route pulls in (chess, weeb, forge, terminal included),
// none of which otherwise touch r3f. A plain import of any name from
// SceneActivity.tsx would drag r3f's import chain into all of them.
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

const STOPS: { altitude: Altitude; label: string }[] = [
  { altitude: "street", label: "STREET" },
  { altitude: "orbit", label: "ORBIT" },
  { altitude: "globe", label: "GLOBE" },
];

/**
 * The three-stop altitude switcher (living-ledger-spec.md#6.2): STREET
 * (`/playground`), ORBIT (`/map`) and GLOBE (`/globe`), with the focus
 * hand-off table (altitude.ts) deciding where the camera arrives.
 *
 * Mounted two ways, never duplicated:
 *   - `RoomFrame` (rooms.tsx) renders it directly for /map and /globe.
 *   - `AltitudeRailV2.tsx` re-exports it as a STREET-side world-v2 HUD layer
 *     (P2-19's `hud/*.tsx` glob), so Playground's world-v2 HUD gets the same
 *     rail without either file editing the other.
 *
 * Navigation prefers `document.startViewTransition` (Chromium), falls back
 * to a plain 180 ms opacity swap done with inline styles (no shared CSS file
 * is owned by this lane), and cuts instantly under reduced motion: exactly
 * the three-tier contract the spec names, and the one place it is decided so
 * neither mount duplicates it.
 */
export function AltitudeRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const here = altitudeFor(pathname);

  function go(target: Altitude) {
    if (target === here) return;
    const to = focusHandoffUrl(here, target);
    if (reducedMotion) {
      navigate({ to });
      return;
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => navigate({ to }));
      return;
    }
    const root = document.documentElement;
    root.style.transition = "opacity 180ms ease";
    root.style.opacity = "0";
    window.setTimeout(() => {
      navigate({ to });
      requestAnimationFrame(() => {
        root.style.opacity = "1";
      });
    }, 180);
  }

  return (
    <div role="group" aria-label="Altitude" data-altitude={here} className="flex items-center gap-1 rounded-full border border-line bg-ink/60 p-1 text-xs">
      {STOPS.map((stop) => {
        const active = stop.altitude === here;
        // A real <Link> (real href, crawlable, keyboard-activatable) rather
        // than a <button>: the click is intercepted only to run the three-
        // tier transition above instead of the router's own instant nav.
        return (
          <Link
            key={stop.altitude}
            to={focusHandoffUrl(here, stop.altitude)}
            onClick={(e) => {
              e.preventDefault();
              go(stop.altitude);
            }}
            aria-current={active ? "true" : undefined}
            data-altitude-stop={stop.altitude}
            className={`rounded-full px-2.5 py-1 font-mono transition ${
              active ? "bg-accent text-ink" : "text-muted hover:text-zinc-100"
            }`}
          >
            {stop.label}
          </Link>
        );
      })}
    </div>
  );
}
