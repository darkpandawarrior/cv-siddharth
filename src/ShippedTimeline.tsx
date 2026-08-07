import { lastShipped, fleetStats } from "./data/store.ts";

/**
 * When each app last shipped a build, by year.
 *
 * This chart exists to answer one specific and entirely fair objection: how can
 * a list of apps be *his* when the platform is older than his time on it? The
 * answer is that it can't, so the shelf only counts an app when the store itself
 * shows a build going out on or after the month he arrived — and the chart draws
 * exactly the dates that rule is applied to. There is nothing to the left of the
 * marker because nothing to the left of it was counted.
 *
 * Green is what you can still install; hollow is what was pulled. Reading it
 * left to right: the clients that died mostly died in 2021–23, and the ones that
 * survived are still shipping.
 */
export function ShippedTimeline() {
  const peak = Math.max(...lastShipped.map((y) => y.live + y.gone), 1);
  const joinYear = Number(fleetStats.joined.slice(0, 4));

  return (
    <figure className="mt-8 rounded-2xl border border-line bg-card/40 p-5">
      <figcaption className="text-sm font-semibold text-zinc-300">
        Last build shipped, by year
      </figcaption>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Nothing before {joinYear}, because nothing before {joinYear} is counted.
      </p>

      <div className="mt-6 flex items-end gap-3">
        {lastShipped.map((y) => {
          const total = y.live + y.gone;
          return (
            <div key={y.year} className="flex flex-1 flex-col items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-muted">{total}</span>
              {/* One column, two stacked segments, height in % of the tallest
                  year. Heights are inline because they are data, not design. */}
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t"
                style={{ height: 120 }}
              >
                <div
                  className="w-full rounded-t border border-b-0 border-dashed border-line"
                  style={{ height: `${(y.gone / peak) * 100}%` }}
                  title={`${y.gone} no longer on the store`}
                />
                <div
                  className="w-full bg-accent/80"
                  style={{ height: `${(y.live / peak) * 100}%` }}
                  title={`${y.live} still on the store`}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-zinc-500">{y.year}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent/80" /> still installable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm border border-dashed border-line" /> pulled since
        </span>
      </div>
    </figure>
  );
}
