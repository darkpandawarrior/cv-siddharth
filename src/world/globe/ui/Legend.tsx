import type { Legend as LegendDefinition } from "../layers/gibsCatalog.ts";
import { legendGradient, legendTicks } from "./legendTicks.ts";

export function Legend({ legend }: { legend: LegendDefinition }) {
  const ticks = legendTicks(legend);
  const categorical = legend.stops.every((stop) => !/\d/.test(stop.label));
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
