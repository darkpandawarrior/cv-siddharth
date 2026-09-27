import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { altitudeFor, focusHandoffUrl, type Altitude } from "./altitude.ts";
import { prefersReducedMotion } from "./reducedMotion.ts";
import { navigateWithViewTransition } from "../lib/viewTransition.ts";

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
  const here = altitudeFor(pathname);

  function go(target: Altitude) {
    if (target === here) return;
    const to = focusHandoffUrl(here, target);
    navigateWithViewTransition(() => navigate({ to }), prefersReducedMotion());
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
            className={`ctrl rounded-full px-2.5 py-1 font-mono ${
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
