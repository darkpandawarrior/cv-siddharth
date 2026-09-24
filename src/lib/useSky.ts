import { useEffect, useMemo, useState } from "react";
import { skyState, type Air, type River, type Season, type SkyState, type Weather } from "./sky";
import { useLiveSignal } from "./useLiveSignal";

/** Minute-boundary tick, lifted verbatim from NavClock (App.tsx:251) — R2
 *  moves NavClock onto this hook so there is exactly one clock in the site,
 *  not two that can drift. `null` until mount: SSR and the first client
 *  render both emit nothing (a clock read on the server is milliseconds off
 *  the one read on the client, which React reports as a hydration
 *  mismatch), then the first client effect fills it in. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

export type WeatherHookState = "live" | "unavailable" | "pending";
/** The full /api/weather response (M7): weather, air and river are each
 *  independently nullable even while `connected` is true. */
export type WeatherEnvelope = {
  connected: boolean;
  weather: Weather | null;
  air: Air | null;
  river: River | null;
  season: Season | null;
  rain6hMm: number | null;
};
export type WeatherReading = {
  weather: Weather | null;
  air: Air | null;
  river: River | null;
  season: Season | null;
  rain6hMm: number | null;
  state: WeatherHookState;
};

const EMPTY_READING: Omit<WeatherReading, "state"> = { weather: null, air: null, river: null, season: null, rain6hMm: null };

/**
 * Pure classifier behind `useWeather`, extracted so the null-vs-stale
 * distinction is testable without `renderHook` (no `@testing-library/react`
 * dependency, same pattern as `fetchLiveSignal`/`subscribeLiveSignal`).
 *
 * On `error`, this returns every field null even if `data` still holds a
 * last-good reading — P2's "no weather fallback file" rule. The shared
 * `useLiveSignal` bus keeps stale data around for callers that want it
 * (github-activity, ops); the weather chip is not one of them, because a
 * week-old temperature dressed as live was exactly the defect this spec
 * dropped (design-brief §0(c)).
 */
export function classifyWeather(data: WeatherEnvelope | null, error: boolean): WeatherReading {
  if (error) return { ...EMPTY_READING, state: "unavailable" };
  if (!data) return { ...EMPTY_READING, state: "pending" };
  if (!data.connected) return { ...EMPTY_READING, state: "unavailable" };
  return { weather: data.weather, air: data.air, river: data.river, season: data.season, rain6hMm: data.rain6hMm, state: "live" };
}

/** Open-Meteo's own refresh interval is 900s (P3) — polling faster would
 *  just re-serve the edge cache. The one /api/weather poll shared by
 *  SiteFooter, /pulse, StudioRig, the v1 ledger and the v2 useNowModel — no
 *  lane adds a second weather hook (M53). */
const WEATHER_INTERVAL_MS = 900_000;

export function useWeather(): WeatherReading {
  const { data, error } = useLiveSignal<WeatherEnvelope>("/api/weather", WEATHER_INTERVAL_MS);
  return classifyWeather(data, error);
}

/**
 * Pure "now + weather + preview -> SkyState" combinator behind `useSky`,
 * extracted for the same testability reason as `classifyWeather` above.
 * `null` until `now` is mounted; `previewAt` (the day scrubber, section 4.3)
 * substitutes the clock only, weather stays live during preview.
 */
export function computeSkyState(now: Date | null, weather: Weather | null, previewAt?: Date | null): SkyState | null {
  if (!now) return null;
  const effectiveNow = previewAt ?? now;
  return skyState(effectiveNow, weather, previewAt != null);
}

/**
 * P2 — the one sky every page reads. `null` until mount (SSR renders the
 * static floor; see useNow), then recomputed once a minute as `useNow`
 * ticks — never per frame. Nothing that mounts this may add its own clock
 * or its own weather fetch (design doc §4: "the world has no its own clock,
 * its own fetch or its own weather").
 */
export function useSky(previewAt?: Date | null): SkyState | null {
  const now = useNow();
  const { weather } = useWeather();
  const nowMs = now?.getTime() ?? null;
  const previewMs = previewAt?.getTime() ?? null;
  // Deliberately keyed on nowMs/previewMs, not the now/previewAt Date
  // objects: a Date is a fresh reference every render regardless of whether
  // the instant it holds changed, which would recompute every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeSkyState(now, weather, previewAt), [nowMs, weather, previewMs]);
}
