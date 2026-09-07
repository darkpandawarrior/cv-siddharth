import { Link } from "@tanstack/react-router";
import { ArrowLeft, Rows3 } from "lucide-react";
import { useSectionNav } from "./lib/navigation.ts";
import { LauncherButton } from "./Launcher.tsx";
import { SiteFooter } from "./SiteFooter.tsx";
import { Reveal } from "./Reveal.tsx";
import { lanes, laneMonths } from "./data/lanes.ts";

/**
 * /lanes — the four-lane activity view the Profile README already draws
 * (assets/lanes-*.svg) and nothing on this site had an equivalent of: work
 * delivered, open source merged, writing published, chess played, month by
 * month since 2019, on one shared axis.
 *
 * The point is the same one the Profile repo's gen-lanes.mjs docstring makes:
 * a list of interests reads as scatter, four lanes moving at once reads as
 * range. This renders the exact same lanes.ts the Profile strip is built
 * from, live, instead of a static image.
 */

const CELL = 9; // px, square

function Grid({ lane }: { lane: (typeof lanes)[number] }) {
  const max = Math.max(...laneMonths.map((m) => lane.months[m] ?? 0), 1);
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-28 shrink-0 text-right font-mono text-[11px] font-semibold"
        style={{ color: `var(${lane.hueVar})` }}
      >
        {lane.label}
      </span>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${laneMonths.length}, ${CELL}px)` }}
      >
        {laneMonths.map((m) => {
          const v = lane.months[m] ?? 0;
          const t = v === 0 ? 0 : 0.22 + 0.78 * (v / max);
          return (
            <div
              key={m}
              title={`${m}: ${v} ${lane.unit}`}
              className="rounded-[2px]"
              style={{
                width: CELL,
                height: CELL,
                background: v === 0 ? "var(--color-line)" : `var(${lane.hueVar})`,
                opacity: v === 0 ? 1 : t,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function Lanes() {
  const { goToSection } = useSectionNav();
  const years = [...new Set(laneMonths.map((m) => m.slice(0, 4)))];

  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <LauncherButton />
            <button
              type="button"
              onClick={() => goToSection("top")}
              className="flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
            >
              <ArrowLeft size={14} /> <span className="label-wide">Portfolio</span>
            </button>
          </div>
          <span className="kicker flex min-w-0 items-center gap-2">
            <Rows3 size={13} className="shrink-0 text-accent" />
            <span className="truncate">Four Lanes</span>
          </span>
          <div className="w-[86px] sm:w-[110px]" aria-hidden="true" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="section-y mx-auto w-full max-w-5xl flex-1 px-6">
        <p className="section-eyebrow mb-2">// four lanes</p>
        <h1 className="font-display text-hero font-bold tracking-tight">Four things at once</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-zinc-400">
          Work delivered, open source merged, writing published, chess played, every month since 2019.
          Listed separately they read as four interests. Run in parallel they read as what they were:
          the same seven years, moving on every lane at once.
        </p>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
          Same grid this profile's README already draws (github.com/darkpandawarrior), rendered live
          here instead of as a fetched image. Hover a cell for its month and count.
        </p>

        <h2 className="sr-only">The four lanes</h2>
        <Reveal>
          <div
            className="mt-10 overflow-x-auto pb-2"
            tabIndex={0}
            role="region"
            aria-label="Four lanes of activity by month, scrollable horizontally"
          >
            <div className="flex flex-col gap-3">
              {lanes.map((lane) => (
                <Grid key={lane.key} lane={lane} />
              ))}
              <div
                className="grid gap-[2px] pl-[124px]"
                style={{ gridTemplateColumns: `repeat(${laneMonths.length}, ${CELL}px)` }}
              >
                {laneMonths.map((m) => (
                  <span key={m} className="relative">
                    {m.endsWith("-01") && (
                      <span className="absolute -bottom-4 left-0 font-mono text-[9px] text-muted">
                        {m.slice(0, 4)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {lanes.map((lane) => (
            <div key={lane.key} className="card-elevated rounded-2xl border border-line bg-surface p-4">
              <p className="font-mono text-[10px] font-semibold" style={{ color: `var(${lane.hueVar})` }}>
                {lane.label}
              </p>
              <p className="mt-1 font-display text-xl font-bold tracking-tight">
                {lane.total.toLocaleString("en-US")} <span className="text-sm font-normal text-muted">{lane.unit}</span>
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted">peak {lane.peak.ym}: {lane.peak.v.toLocaleString("en-US")}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
          {years.length} calendar years on one axis. Each lane states its own unit because they are not
          the same kind of count: {lanes.map((l) => l.unit).join(", ")}. The writing lane is plotted at
          year resolution, most pieces carry a year but no month, so read it by year rather than by
          cell. Chess and writing each have their own room with the full sourcing:{" "}
          <Link to="/chess" className="underline hover:text-accent">/chess</Link>,{" "}
          <Link to="/loopdown" className="underline hover:text-accent">/loopdown</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
