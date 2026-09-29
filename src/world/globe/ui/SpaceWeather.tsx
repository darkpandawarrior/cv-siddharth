import { useEffect } from "react";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useGlobe } from "../globeStore.ts";
import { publish } from "../feed.ts";
import {
  XRAY_URL,
  PROTON_URL,
  SOLAR_WIND_MAG_URL,
  SOLAR_WIND_SPEED_URL,
  SPACE_WEATHER_POLL_MS,
  parseLatestFlare,
  parseLatestProton,
  parseSolarWindSpeed,
  parseSolarWindMag,
  spaceWeatherDetail,
} from "../layers/solarFlare.ts";

/**
 * LANE S2 (wave 9, space weather): a compact readout beside the HUD's Pune
 * chip — X-ray flare class, proton radiation storm scale, solar-wind speed
 * and Bz, all sourced live from NOAA SWPC (the same host aurora.ts's own
 * OVATION/Kp calls already reach, per feedUrls.ts). Own poller, not
 * HazardLayer.tsx's (that file belongs to another lane this wave) — the
 * shared useLiveSignal bus means four independent `useLiveSignal` calls
 * here still cost one fetch per URL, same as any other caller of that bus.
 *
 * Gated on `timeOffsetMin === 0`, the same "hides unless offset is 0" rule
 * HazardLayer.tsx applies to the aurora nowcast: these are single-latest-
 * reading feeds with no per-reading timestamp to filter by, so scrubbing
 * the Time Machine to the past and still showing "now"'s flare class would
 * be exactly the stale-dressed-as-live case the house rule forbids.
 */
export default function SpaceWeather() {
  const live = useGlobe((s) => s.timeOffsetMin === 0);

  const xraySnap = useLiveSignal<unknown>(XRAY_URL, SPACE_WEATHER_POLL_MS);
  const protonSnap = useLiveSignal<unknown>(PROTON_URL, SPACE_WEATHER_POLL_MS);
  const windSnap = useLiveSignal<unknown>(SOLAR_WIND_SPEED_URL, SPACE_WEATHER_POLL_MS);
  const magSnap = useLiveSignal<unknown>(SOLAR_WIND_MAG_URL, SPACE_WEATHER_POLL_MS);

  const flare = xraySnap.error ? null : parseLatestFlare(xraySnap.data);
  const proton = protonSnap.error ? null : parseLatestProton(protonSnap.data);
  const wind = windSnap.error ? null : parseSolarWindSpeed(windSnap.data);
  const mag = magSnap.error ? null : parseSolarWindMag(magSnap.data);

  // Publish once per genuinely new flare reading (id keyed on the flare's
  // own time_tag — the feed store's own de-dup, same as HazardLayer.tsx's
  // Kp publisher, turns "still M-class on this poll" into "announced once"
  // rather than needing a tracked-id set here). Only M and X class, per the
  // brief — C-class and below are routine, not feed-worthy.
  useEffect(() => {
    if (!flare) return;
    const letter = flare.flareClass[0];
    if (letter !== "M" && letter !== "X") return;
    publish({
      id: `flare:${flare.timeIso}`,
      kind: "flare",
      title: `${flare.flareClass} X-ray flare`,
      detail: spaceWeatherDetail(flare, proton, wind, mag),
      whenMs: Date.parse(flare.timeIso),
      source: "NOAA SWPC",
      live,
      severity: letter === "X" ? "danger" : "warn",
    });
  }, [flare, proton, wind, mag, live]);

  // Loading (no data, no error yet on ALL four feeds): render nothing
  // rather than a "failed" flash before the first response lands.
  const allLoading = [xraySnap, protonSnap, windSnap, magSnap].every((s) => s.data === null && !s.error);
  const allFailed = [xraySnap, protonSnap, windSnap, magSnap].every((s) => s.error);
  if (!live || allLoading) return null;

  if (allFailed) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur">
        <span data-space-weather-status="failed">Space weather feed unreachable</span>
      </div>
    );
  }

  const detail = spaceWeatherDetail(flare, proton, wind, mag);
  if (!detail) return null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur">
      <span data-space-weather-status="live">{detail}</span>
    </div>
  );
}
