import { useEffect, useRef, useState } from "react";
import { SANGAM, type GeoPoint } from "./lookAngles.ts";
import { useLiveSignal } from "./useLiveSignal.ts";
import type { SatelliteVisibility, SatLookAngles, VisiblePass } from "./satellites.ts";
import type { TleObject } from "../../api/_lib/tle-handler.ts";

/** The shape of `/api/tle`'s response (api/_lib/tle-handler.ts's
 *  `TleResponse`, mirrored so this client module never imports a value from
 *  a server file — only the type, which is erased at build). */
export type TleEnvelope = {
  connected: boolean;
  stale: boolean;
  at: string | null;
  epochNewest: string | null;
  source: string;
  sourceUrl: string;
  objects: TleObject[];
};

// open-data-spec.md §3 A2: "fetches once per session. The useLiveSignal
// interval is 2 h" — matches CelesTrak's own ~2 h GP refresh.
const TLE_POLL_MS = 2 * 60 * 60_000;
// "Every 10 s: propagate all 158 objects and keep those above the horizon" —
// a dedicated sweep, deliberately not the site's shared one-minute clock
// (useSky's useNow), because nothing else on the site needs sub-minute time.
const SWEEP_MS = 10_000;
const ISS_NORAD = "25544";

export type SatelliteReading = { object: TleObject; look: SatLookAngles; state: SatelliteVisibility };

export type SatellitesState = {
  /** `false` until both `/api/tle` has answered and the lazy satellites.ts
   *  chunk has loaded. */
  ready: boolean;
  /** Objects above the horizon as of the last 10 s sweep. */
  visible: SatelliteReading[];
  sunlitCount: number;
  /** The ISS's own reading, or `null` while below the horizon or not yet
   *  ready. */
  iss: SatelliteReading | null;
  /** The ISS's next eye-visible pass (idle-scanned once per session), or
   *  `undefined` while still computing, `null` if none in the next 7 days. */
  issNextPass: VisiblePass | null | undefined;
};

const INITIAL_STATE: SatellitesState = { ready: false, visible: [], sunlitCount: 0, iss: null, issNextPass: undefined };

/**
 * Loads the SGP4 math (`./satellites.ts`, and with it satellite.js) only
 * through `import()` — never statically — so the 158-object catalogue and
 * its ~11 KB gzip library stay out of every route's initial bundle and load
 * only once a consumer (the Survey lens, /globe, /terminal) actually mounts
 * this hook (M10; open-data-spec.md §3 A2's "lazy chunk").
 */
export function useSatellites(observer: GeoPoint = SANGAM): SatellitesState {
  const { data } = useLiveSignal<TleEnvelope>("/api/tle", TLE_POLL_MS);
  const [satellites, setSatellites] = useState<typeof import("./satellites.ts") | null>(null);
  const [state, setState] = useState<SatellitesState>(INITIAL_STATE);
  const passRequestedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("./satellites.ts").then((mod) => {
      if (!cancelled) setSatellites(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!satellites || !data?.objects.length) return;
    const objects = data.objects;

    const sweep = () => {
      const now = new Date();
      const visible: SatelliteReading[] = [];
      let sunlitCount = 0;
      let iss: SatelliteReading | null = null;
      for (const object of objects) {
        const look = satellites.lookAnglesFor(object, now, observer);
        if (!look || look.elDeg <= 0) continue;
        const visibility = satellites.classify(object, now, observer);
        const reading: SatelliteReading = { object, look, state: visibility };
        if (visibility === "eye" || visibility === "daylight") sunlitCount++;
        visible.push(reading);
        if (object.norad === ISS_NORAD) iss = reading;
      }
      setState((prev) => ({ ...prev, ready: true, visible, sunlitCount, iss }));
    };

    sweep();
    const timer = window.setInterval(sweep, SWEEP_MS);
    return () => window.clearInterval(timer);
  }, [satellites, data, observer]);

  useEffect(() => {
    if (!satellites || !data?.objects.length) return;
    const iss = data.objects.find((o) => o.norad === ISS_NORAD);
    if (!iss || passRequestedFor.current === iss.l1) return;
    passRequestedFor.current = iss.l1;
    satellites.nextVisiblePass(iss, new Date(), observer).then((pass) => {
      setState((prev) => ({ ...prev, issNextPass: pass }));
    });
  }, [satellites, data, observer]);

  return state;
}
