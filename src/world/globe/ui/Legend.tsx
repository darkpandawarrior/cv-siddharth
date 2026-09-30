import { useSyncExternalStore } from "react";
import { getHazardKeys, subscribeHazardKeys, EMBER, VOLCANO, STORM, ALERT_WARN, ALERT_DANGER, LAUNCH, LAUNCH_BEAM, AURORA_RGB, rgbHex } from "../layers/layerKeys.ts";
import { QUAKE_DEPTH_LEGEND } from "../layers/quake.ts";
import type { Legend as LegendDefinition } from "../layers/gibsCatalog.ts";
import { legendGradient, legendTicks } from "./legendTicks.ts";

export function Legend({ legend }: { legend: LegendDefinition }) {
  const ticks = legendTicks(legend);
  const categorical = legend.stops.every((stop) => !/^[-+]?\d/.test(stop.label));
  return (
    <div data-globe-legend className="mt-2 text-xs font-mono text-muted">
      {!categorical && <div aria-hidden className="relative h-2 rounded-full" style={{ background: legendGradient(legend) }}>
        {ticks.map((tick) => <span key={tick.label} className="absolute top-0 h-3 border-l border-zinc-400" style={{ left: `${tick.position}%` }} />)}
      </div>}
      <ul aria-label={`Legend, ${legend.unit}`} className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {ticks.map((tick) => <li key={tick.label} className="flex min-w-0 items-center gap-1 break-words">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: tick.color }} />
          <span>{tick.label} {legend.unit}</span>
        </li>)}
      </ul>
    </div>
  );
}

export function HazardLegend() {
  const shown = useSyncExternalStore(subscribeHazardKeys, getHazardKeys, getHazardKeys);
  const keys = [
    { count: shown.fires, color: EMBER, label: "Fires: ember dots (NASA EONET)" },
    { count: shown.storms, color: STORM, label: "Storms: rings and tracks (NASA EONET)" },
    { count: shown.volcanoes, color: VOLCANO, label: "Volcanoes: cones (EONET / Smithsonian GVP / USGS)" },
    { count: shown.alerts, color: ALERT_WARN, label: "Alerts: orange / red halos (GDACS severity)" },
    { count: shown.alerts, color: ALERT_DANGER, label: "Red = severe alert" },
    { count: shown.launches, color: LAUNCH, label: "Launches: chevrons (Launch Library 2)" },
    { count: shown.launches, color: LAUNCH_BEAM, label: "Launch beam: within 24 hours" },
    { count: shown.cones, color: ALERT_WARN, label: "NHC cones: forecast uncertainty, orange / red with GDACS severity" },
    { count: Number(shown.aurora), color: rgbHex(AURORA_RGB), label: `Aurora: brighter = higher probability (NOAA OVATION nowcast), Kp ${shown.kp === null ? "unavailable" : shown.kp.toFixed(2)}` },
  ].filter((key) => key.count > 0);
  return <>
    {shown.quakes > 0 && <Legend legend={QUAKE_DEPTH_LEGEND} />}
    {keys.length > 0 && <Legend legend={{ unit: "", stops: keys }} />}
  </>;
}
