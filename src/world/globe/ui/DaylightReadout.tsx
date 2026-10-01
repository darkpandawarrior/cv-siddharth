import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sunrise, Sunset } from "lucide-react";
import { risingAndSettingCities, type DaylightCityStatus } from "../layers/daylight.ts";
import { simTime, useGlobe, type Selection } from "../globeStore.ts";

/** Re-runs risingAndSettingCities on the sim clock (offset changes
 *  immediately with the scrubber; the real-time tick keeps the list honest
 *  between scrubs, same cadence family as FeedRail's own 5s "relative time"
 *  tick, widened here since the band a city sits in only meaningfully moves
 *  every few minutes, not every few seconds). */
function useSimNowTicking(): Date {
  const offset = useGlobe((s) => s.timeOffsetMin);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is a pure re-run trigger, its value is never read
  return useMemo(() => simTime(offset), [offset, tick]);
}

function selectionFor(status: DaylightCityStatus): Selection {
  const { city, altitudeDeg, phase } = status;
  return {
    id: `daylight:${city.name}`,
    kind: "daylight-city",
    title: city.name,
    rows: [
      { label: "sun", value: `${phase}, ${altitudeDeg >= 0 ? "+" : ""}${altitudeDeg.toFixed(1)}° altitude` },
      { label: "population", value: city.pop.toLocaleString("en-US") },
    ],
    source: "Natural Earth 110m populated places, public domain, sun position computed for the simulated time",
    live: false,
    focus: { kind: "latlon", lat: city.lat, lon: city.lon },
  };
}

function CityRow({ status, onPick }: { status: DaylightCityStatus; onPick: (status: DaylightCityStatus) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(status)}
        className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 truncate">{status.city.name}</span>
        <span className="shrink-0 whitespace-nowrap text-xs text-zinc-500">
          {status.altitudeDeg >= 0 ? "+" : ""}
          {status.altitudeDeg.toFixed(1)}°
        </span>
      </button>
    </li>
  );
}

/**
 * WAVE 8 LANE C4 ("Living daylight"): "a small readout listing up to five
 * sizeable cities where the sun is setting right now and five where it is
 * rising ... each clickable to fly there. It follows the time scrubber."
 * Self-contained like ui/HoverReadout.tsx (own store reads, own effects,
 * no props) -- GlobeHud.tsx only needs to mount it, the same
 * lazy()+ClientOnly wrapping that file already gives HoverReadout.
 *
 * Collapses to one glass pill in the shared top row (globe-lanes.md's
 * composed-layout spec reserves that row for exactly this kind of chip);
 * the city list opens as a popover BELOW the pill.
 *
 * The pill itself mounts inline (GlobeHud -> the topbar's own `relative
 * z-20` div in src/Globe.tsx), but that div is a stacking context of its
 * own, so no z-index the popover declares as a normal descendant could ever
 * outrank a sibling like Inspector's z-30 card or ExploreBar's z-30 search
 * box, which sit outside that context entirely -- the same trap
 * CompareDivider.tsx and StreetView.tsx already document and fix. Body-level
 * `createPortal` escapes it; the popover tracks the pill's own
 * getBoundingClientRect so it still opens directly under the pill.
 */
export default function DaylightReadout() {
  const enabled = useGlobe((s) => s.layers.daylight);
  const select = useGlobe((s) => s.select);
  const flyTo = useGlobe((s) => s.flyTo);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const now = useSimNowTicking();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setAnchor({ left: rect.left, top: rect.bottom + 8 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!enabled) return null;

  const { rising, setting } = risingAndSettingCities(now, undefined, 5);

  function onPick(status: DaylightCityStatus) {
    flyTo({ kind: "latlon", lat: status.city.lat, lon: status.city.lon });
    select(selectionFor(status));
    setOpen(false);
  }

  return (
    <div className="pointer-events-auto relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full glass-panel px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-accent"
      >
        <span className="sr-only">Cities rising and setting right now: </span>
        <Sunrise size={13} aria-hidden />
        {rising.length}
        <span className="sr-only"> rising, </span>
        <Sunset size={13} aria-hidden />
        {setting.length}
        <span className="sr-only"> setting</span>
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            role="dialog"
            aria-label="Cities rising and setting right now"
            // z-50, body-level portal: outranks every in-flow z-30/z-40
            // panel (Inspector, ExploreBar, GlobeTour, ...) regardless of
            // which stacking context they render in, same as
            // CompareDivider's fixed z-50 root.
            style={{ left: anchor.left, top: anchor.top }}
            className="fixed z-50 w-56 rounded-lg glass-panel p-2 font-mono text-xs text-zinc-300"
          >
            <div className="mb-1 flex items-center gap-1 text-muted">
              <Sunrise size={12} aria-hidden />
              <span>Rising</span>
            </div>
            {rising.length === 0 ? (
              <p className="px-1 py-1 text-zinc-500">No sizeable city near sunrise right now</p>
            ) : (
              <ul>
                {rising.map((s) => (
                  <CityRow key={s.city.name} status={s} onPick={onPick} />
                ))}
              </ul>
            )}
            <div className="mb-1 mt-2 flex items-center gap-1 text-muted">
              <Sunset size={12} aria-hidden />
              <span>Setting</span>
            </div>
            {setting.length === 0 ? (
              <p className="px-1 py-1 text-zinc-500">No sizeable city near sunset right now</p>
            ) : (
              <ul>
                {setting.map((s) => (
                  <CityRow key={s.city.name} status={s} onPick={onPick} />
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
