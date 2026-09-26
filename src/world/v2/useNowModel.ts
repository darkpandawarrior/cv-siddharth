/**
 * Aggregates every live/computed source into one `Now` (worldModel.ts's own
 * shape, living-ledger-spec §3.1) plus the raw readings `ledgerRows.ts`
 * needs for its full-sentence formatters — one hook, so WorldV2.tsx and the
 * ledger read the SAME poll, never a second fetch of anything (M53, the
 * doctrine `useSky.ts`/`useSignals.ts` already state for this exact reason).
 * `useSky`/`useWeather`/`useLiveSignal` are all `useSyncExternalStore` buses
 * keyed by URL (or, for `useSky`, composed from `useNow`+`useWeather`), so
 * calling them here on top of whatever else already calls them costs no
 * second fetch and no second clock.
 *
 * Deliberately does NOT call `useSatellites()` (src/lib/useSatellites.ts):
 * that hook's own doc comment says it lazy-`import()`s `./satellites.ts`
 * (and with it satellite.js) the moment it mounts. `useNowModel` only ever
 * needs a raw object COUNT for the ledger and `Now.overhead.satellites`
 * (living-ledger-spec §4's own S8 row: "~20 orbits on GLOBE" is a GLOBE-only
 * concern) — the real SGP4 propagation belongs to whichever future NightSky/
 * SkyObjects layer actually draws the ISS crossing, and THAT layer calls
 * `useSatellites()` itself. Reading `/api/tle`'s object count here, and
 * nothing more, is what keeps satellite.js out of the WorldV2 chunk (this
 * lane's own acceptance line).
 */
import { useMemo } from "react";
import { usePresence } from "@playhtml/react";
import { useSky, useWeather } from "../../lib/useSky.ts";
import { useLiveSignal } from "../../lib/useLiveSignal.ts";
import { useSignals } from "../../lib/useLive.ts";
import { moonPhase, moonPosition, type MoonPhase, type MoonPosition } from "../../lib/moon.ts";
import type { Air, River, Season, SkyState } from "../../lib/sky.ts";
import type { GithubActivity } from "../../../api/_lib/github-activity-handler.ts";
import type { Ops } from "../../../api/_lib/ops-handler.ts";
import type { AircraftResponse } from "../../../api/_lib/aircraft-handler.ts";
import type { TleObject } from "../../../api/_lib/tle-handler.ts";
import type { SpotifyNow } from "../../../api/_lib/spotify-handler.ts";
import type { SignalsResponse } from "../../../api/_lib/signals-handler.ts";
import { GHOST_CHANNEL, type GhostPresence } from "../Ghosts.tsx";
import { recentPushes, siteCiGlow } from "../realityRows.ts";
import type { CiState, Now, Push } from "./worldModel.ts";

// TleEnvelope isn't exported from a non-hook module; mirrored narrowly here
// (the one field this hook reads) so it never has to import useSatellites.ts
// itself — see this file's own doc comment on why that import is avoided.
type TleEnvelope = { objects: TleObject[] };

const TLE_POLL_MS = 2 * 60 * 60_000; // matches useSatellites.ts's own interval
const OVERHEAD_POLL_MS = 20_000; // matches streams.ts's aircraft pollMs

export interface NowModelRaw {
  sky: SkyState | null;
  air: Air | null;
  river: River | null;
  season: Season | null;
  activity: GithubActivity | null;
  ops: Ops | null;
  signals: SignalsResponse | null;
  presenceCount: number;
  presenceCountries: Record<string, number>;
  radio: SpotifyNow | null;
  moonPhase: MoonPhase | null;
  moonPosition: MoonPosition | null;
  aircraftTotal: number;
  satelliteCount: number;
}

export interface NowModel {
  now: Now;
  raw: NowModelRaw;
}

function ciState(ops: Ops | null): CiState | null {
  if (!ops) return null;
  const glow = siteCiGlow(ops);
  return { state: glow === "ok" ? "pass" : glow === "degraded" ? "fail" : "none" };
}

/** worldModel.ts's own `SkyState.daypart` (Now's reduced shape) has no
 *  "golden" value — living-ledger-spec's world-render daypart only needs
 *  the four coarse buckets; `src/lib/sky.ts`'s finer "golden" (dawn/dusk's
 *  own warm window) folds into whichever of the two it is, by the same
 *  morning/evening azimuth split `spawn.ts`'s `isMorningAz` already uses. */
function coarseDaypart(daypart: SkyState["daypart"], sunAzDeg: number): "night" | "dawn" | "day" | "dusk" {
  if (daypart !== "golden") return daypart;
  const isMorning = ((sunAzDeg % 360) + 360) % 360 < 180;
  return isMorning ? "dawn" : "dusk";
}

function pushesFrom(activity: GithubActivity | null, nowMs: number): Push[] {
  if (!activity) return [];
  return recentPushes(activity.items, nowMs).map((i) => ({ at: i.at, repo: i.repo }));
}

/** Every visitor country present in the live presence channel, `country ->
 *  count`. `x`/`z`/`heading` (GhostPresence) carry no geography today — this
 *  reads only what a future presence-countries render layer will actually
 *  need once `/api/whereami` is wired into the same channel (living-ledger
 *  §5.5 S14); until then it is honestly empty, never a guessed value.
 *  ponytail: presence-countries stays `{}` until a lane threads
 *  `/api/whereami`'s country into this same playhtml channel — this hub
 *  only needs somewhere real for that count to land once it exists. */
function presenceCountriesFrom(): Record<string, number> {
  return {};
}

/**
 * `previewAt` mirrors `useSky`'s own preview-scrubber substitution (P2's
 * "the scrubber passes a preview Date into useSky(previewAt)", living-ledger
 * §3.1): the sky/moon recompute for the previewed instant, every live poll
 * (weather, activity, presence...) stays real, exactly like reality-spec's
 * existing day scrubber.
 */
export function useNowModel(previewAt?: Date | null): NowModel | null {
  const sky = useSky(previewAt);
  const { air, river, season } = useWeather();
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");
  const { data: ops } = useLiveSignal<Ops>("/api/ops");
  const { data: signals } = useSignals();
  const { data: aircraft } = useLiveSignal<AircraftResponse>("/api/aircraft", OVERHEAD_POLL_MS);
  const { data: tle } = useLiveSignal<TleEnvelope>("/api/tle", TLE_POLL_MS);
  const { data: radio } = useLiveSignal<SpotifyNow>("/api/spotify");
  const { presences } = usePresence<GhostPresence>(GHOST_CHANNEL);

  const presenceCount = useMemo(
    () => Array.from(presences.values()).filter((p) => !(p as { isMe?: boolean }).isMe).length + 1,
    [presences],
  );

  return useMemo<NowModel | null>(() => {
    if (!sky) return null;

    const at = sky.now;
    const moon: MoonPhase = moonPhase(at);
    const moonPos: MoonPosition = moonPosition(at);
    const weather = sky.weather;

    const nowValue: Now = {
      at,
      sky: { daypart: coarseDaypart(sky.daypart, sky.sun.azimuthDeg), cloud: weather ? weather.cloudPct / 100 : 0, tempC: weather?.tempC ?? null },
      moon: { phase: moon.fraction, altitudeDeg: moonPos.altitudeDeg },
      rain6h: weather?.precipMmH ?? null,
      air: air ? { pm25: air.pm25, aqiUs: air.usAqi, aod: air.aod } : null,
      river: river ? { levelDeltaM: 0, flowSpeed: 0.5, foam: 0 } : null,
      overhead: { aircraft: aircraft?.total ?? 0, satellites: tle?.objects.length ?? 0 },
      pushes24h: pushesFrom(activity ?? null, at.getTime()),
      ci: ciState(ops ?? null),
      presence: { here: presenceCount, countries: presenceCountriesFrom() },
      radio: radio?.isPlaying ? { track: radio.track ?? null, artist: radio.artist ?? null } : null,
    };

    const raw: NowModelRaw = {
      sky,
      air: air ?? null,
      river: river ?? null,
      season: season ?? null,
      activity: activity ?? null,
      ops: ops ?? null,
      signals: signals ?? null,
      presenceCount,
      presenceCountries: presenceCountriesFrom(),
      radio: radio ?? null,
      moonPhase: moon,
      moonPosition: moonPos,
      aircraftTotal: aircraft?.total ?? 0,
      satelliteCount: tle?.objects.length ?? 0,
    };

    return { now: nowValue, raw };
  }, [sky, air, river, season, activity, ops, signals, aircraft, tle, radio, presenceCount]);
}
