import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { altitudeFor, focusHandoffUrl, type Altitude } from "./altitude.ts";
import { useReducedMotion } from "../SceneActivity.tsx";
import "./altitude.css";

const STOPS: { altitude: Altitude; label: string }[] = [
  { altitude: "street", label: "STREET" },
  { altitude: "orbit", label: "ORBIT" },
  { altitude: "globe", label: "GLOBE" },
];

/** One rail for STREET, ORBIT and GLOBE, with directional route snapshots. */
export function AltitudeRail() {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const search = location.search as { focus?: unknown; at?: unknown };
  const candidate = pathname.startsWith("/playground") ? search.at : search.focus;
  const slug = typeof candidate === "string" ? candidate : undefined;
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const here = altitudeFor(pathname);

  function go(target: Altitude) {
    if (target === here) return;
    const to = focusHandoffUrl(here, target, slug);
    const type = STOPS.findIndex((s) => s.altitude === target) > STOPS.findIndex((s) => s.altitude === here)
      ? "altitude-up" : "altitude-down";
    if (reduced || typeof document.startViewTransition === "function") {
      void navigate({ to, viewTransition: reduced ? false : { types: [type] } });
      return;
    }
    const root = document.documentElement;
    const duration = Number.parseFloat(getComputedStyle(root).getPropertyValue("--dur-fast")) * 1000;
    const animation = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: "forwards" });
    void animation.finished.then(async () => {
      try { await navigate({ to, viewTransition: false }); }
      finally {
        animation.cancel();
        root.animate([{ opacity: 0 }, { opacity: 1 }], { duration });
      }
    });
  }

  return (
    <div role="group" aria-label="Altitude" data-altitude={here} className="flex items-center gap-0 rounded-full border border-line bg-ink/60 p-0 text-xs sm:gap-1">
      {STOPS.map((stop) => {
        const active = stop.altitude === here;
        // A real <Link> (real href, crawlable, keyboard-activatable) rather
        // than a <button>: the click is intercepted only to run the three-
        // tier transition above instead of the router's own instant nav.
        return (
          <Link
            key={stop.altitude}
            to={focusHandoffUrl(here, stop.altitude, slug)}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              go(stop.altitude);
            }}
            aria-current={active ? "true" : undefined}
            data-altitude-stop={stop.altitude}
            className={`ctrl flex min-h-11 min-w-11 items-center justify-center rounded-full px-1 py-1 font-mono sm:px-2.5 ${
              active ? "bg-accent text-ink" : "text-muted hover:text-zinc-100"
            }`}
          >
            <span aria-hidden className="sm:hidden">{stop.label[0]}</span>
            <span className="sr-only sm:not-sr-only">{stop.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
