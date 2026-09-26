// The one sky signal on every page (reality-spec.md#P7, spine F15/M58). A
// fixed 1px hairline under the route chrome (z-45: above route headers at
// z-40, below the palette/chat/launcher at z-50 — __root renders no nav and
// 13 of 35 routes have no header, so "under the nav border" from the spec's
// first draft became "fixed at the very top", M58) carrying one 6px dot at
// `progress * 100%` along it. Mounted once in __root.tsx.
import { useEffect } from "react";
import { useNow } from "./lib/useSky.ts";
import { skyState, type Daypart, type SkyState } from "./lib/sky.ts";

function istTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

/** Hidden only at night — the spec names amber (golden) and signal green
 *  (day) explicitly and leaves the two below-horizon twilight bands
 *  (dawn/dusk) unstated. Showing the dot through them, not just golden and
 *  day, reads truer to "hidden at night" as the one stated exception. */
export function dotVisible(daypart: Daypart): boolean {
  return daypart !== "night";
}

/** ponytail: dawn/dusk share golden's amber rather than getting a third hue
 *  — the spec calls out only golden (amber) and day (signal green); split
 *  them out if a future lane wants dawn/dusk visually distinct. */
export function dotColor(daypart: Daypart): string {
  return daypart === "day" ? "var(--color-signal)" : "var(--color-accent)";
}

/** `progress` runs outside [0,1] before sunrise and after sunset (sky.ts's
 *  own doc comment on `SkyState.progress`) — only reachable here through the
 *  dawn/dusk bands, where the dot is still shown; clamp it to the line. */
export function dotLeftPct(progress: number): number {
  return Math.max(0, Math.min(1, progress)) * 100;
}

/** `k.horizon` mixed 35% into `--color-line`, so the live hairline always
 *  reads inside the brand instead of showing a raw scene colour. `null`
 *  (pre-mount, SSR) is the plain `--color-line` fallback the per-route table
 *  names for `__root`. */
export function horizonBackground(sky: SkyState | null): string {
  if (!sky) return "var(--color-line)";
  return `color-mix(in srgb, ${sky.k.horizon} 35%, var(--color-line))`;
}

export function srSentence(sky: SkyState): string {
  return `Pune sun, altitude ${Math.round(sky.sun.altitudeDeg)}°, computed. Sunrise ${istTime(sky.times.sunrise)}, sunset ${istTime(sky.times.sunset)} IST.`;
}

/**
 * Sun position only — `skyState(now, null)`, not the shared `useSky()`.
 * P7 asks for daypart/progress/the dot, none of which read `weather`; the
 * hero caption (App.tsx) is the one surface that has to show a weather
 * label and pays for `useWeather()` there. SkyLine mounts in __root, above
 * every routed child, so it is the EARLIEST subscriber of whatever store it
 * reads — and `useLiveSignal`'s `getServerSnapshot` returning the same live,
 * mutable `store.snapshot` object it hands the client makes a second,
 * differently-timed subscriber of the SAME store tear during hydration
 * (React error #418, reproduced on every route once SkyLine also subscribed
 * to `/api/weather` alongside SiteFooter's own reader). `skyState(now, null)`
 * is the exact fallback `SkyLine.test.ts` already exercised and `/hire`'s
 * `PuneClocks` already ships for the same "I need the clock, not the live
 * weather bus" reason — not a new pattern.
 * ponytail: the hairline loses weather-tinted `k.horizon` (still varies by
 * daypart/sun altitude, just not rain/cloud); revisit once useLiveSignal's
 * getServerSnapshot stops sharing one mutable object across subscribers.
 */
export function useSkyLineState(): SkyState | null {
  const now = useNow();
  if (!now) return null;
  return skyState(now, null);
}

export function SkyLine() {
  const sky = useSkyLineState();

  // The one write-per-minute the spec asks for: `sky` itself only changes
  // when `useNow()` ticks, never per render.
  useEffect(() => {
    if (!sky) return;
    const root = document.documentElement;
    root.dataset.daypart = sky.daypart;
    root.style.setProperty("--sky-horizon", sky.k.horizon);
    root.style.setProperty("--sky-zenith", sky.k.zenith);
    root.style.setProperty("--sun-progress", String(sky.progress));
  }, [sky]);

  const sr = sky ? srSentence(sky) : null;

  return (
    <div
      data-sky-line
      data-daypart={sky?.daypart}
      data-sun-progress={sky ? sky.progress : undefined}
      title={sr ?? undefined}
      // role="region": mounted in __root outside every routed landmark
      // (header/main/nav), so the sr-only sentence below needs its own
      // landmark or axe's "region" rule flags it on every route (all 26
      // reproduced the same way — this is the shared root cause).
      role="region"
      aria-label="Sky status"
      // Decor, not chrome you can click: pointer-events:none keeps a 1px
      // strip across the very top of every route from ever intercepting a
      // tap meant for whatever sits at y=0 beneath it.
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-px"
      style={{ background: horizonBackground(sky) }}
    >
      {sr && <span className="sr-only">{sr}</span>}
      {sky && dotVisible(sky.daypart) && (
        // The dot jumps, it never tweens (spec: reduced motion AND full
        // motion both render this way — there is no transition class here
        // to begin with).
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${dotLeftPct(sky.progress)}%`, background: dotColor(sky.daypart) }}
        />
      )}
    </div>
  );
}
