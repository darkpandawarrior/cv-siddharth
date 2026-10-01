import type { Legend } from "../layers/gibsCatalog.ts";

/** Positions preserve the catalog's existing, equally spaced colour stops. */
export function legendTicks(legend: Legend) {
  return legend.stops.map((stop, i) => ({ ...stop, position: i / Math.max(1, legend.stops.length - 1) * 100 }));
}

export function legendGradient(legend: Legend): string {
  return `linear-gradient(to right, ${legendTicks(legend).map((tick) => `${tick.color} ${tick.position}%`).join(", ")})`;
}
