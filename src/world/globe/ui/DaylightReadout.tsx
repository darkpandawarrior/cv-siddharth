import { useEffect, useMemo, useState } from "react";
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
    source: "Natural Earth 110m populated places, public domain — sun position computed for the simulated time",
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
 * the city list opens as a popover BELOW the pill rather than a docked
 * panel, so it never contests the right-column LayerPanel or left-slot
 * Inspector/tour real estate e2e/globe-U1.spec.ts guards.
 */
export default function DaylightReadout() {
  const enabled = useGlobe((s) => s.layers.daylight);
  const select = useGlobe((s) => s.select);
  const flyTo = useGlobe((s) => s.flyTo);
  const [open, setOpen] = useState(false);
  const now = useSimNowTicking();

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Cities rising and setting right now"
        className="flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur hover:text-accent"
      >
        <Sunrise size={13} aria-hidden />
        {rising.length}
        <Sunset size={13} aria-hidden />
        {setting.length}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Cities rising and setting right now"
          // z-40: above ExploreBar's search overlay (z-30) -- both are
          // transient floating surfaces anchored independently in the top
          // row, and the one a visitor just opened should never render
          // underneath the other.
          className="absolute left-0 top-full z-40 mt-2 w-56 rounded-lg border border-line bg-ink/90 p-2 font-mono text-xs text-zinc-300 backdrop-blur"
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
        </div>
      )}
    </div>
  );
}
