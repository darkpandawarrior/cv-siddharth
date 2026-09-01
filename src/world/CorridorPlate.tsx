import type { JSX } from "react";
import { corridorPlateMeta } from "./corridorPlate.ts";

/**
 * NIGHT SURVEY §11 — THE STATIC FALLBACK, the DOM half.
 *
 * `public/p/world/corridor.png` (`scripts/gen-world-plate.mjs`'s own doc
 * comment explains what it honestly is and isn't) is the terrain; this
 * component is everything §11 asks to sit ON TOP of it "in the DOM": the 8
 * year rules and the 4 lane monograms, both driven by the same committed
 * `corridorPlateMeta` the generator wrote — so neither this file nor the
 * baked image can drift from the other's numbers.
 *
 * Rendered by `src/Playground.tsx`'s `!worldCapable` branch, above the room
 * grid rather than instead of it — the grid is still the navigation, this is
 * the terrain those visitors would otherwise never see. `e2e/world-fallback`
 * covers it, and note the trap recorded there: Playwright's
 * `test.use({ reducedMotion })` does not reach matchMedia, so a test written
 * with it passes while exercising the 3D branch instead of this one.
 *
 * Alt text names the four strands and the date range — description, not
 * metaphor exposition (§11's own line, and this world's project law 1).
 *
 * It used to end "...because this browser cannot run the interactive 3D
 * version", which was true for every visitor it had while the call site was
 * gated on `!worldCapable`. It is no longer: the plate now renders for the
 * whole list branch, and the largest cohort there is someone whose browser
 * runs WebGL perfectly well and chose the list anyway. Telling that reader
 * their browser cannot do something it can is a false claim in the one string
 * a screen-reader user is given instead of the image — on a site whose whole
 * argument is that a claim has to stay true. The alt now describes what the
 * picture IS and leaves the reason to the branch that actually knows it.
 */
export function CorridorPlate(): JSX.Element {
  const meta = corridorPlateMeta;
  const laneNames = meta.lanes.map((l) => l.label).join(", ");
  const alt = `A terrain chart of four tracked strands of work — ${laneNames} — from ${meta.from} to ${meta.to}, baked as a static image from the same heightfield the drivable 3D version is built on.`;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-ink" style={{ aspectRatio: `${meta.width} / ${meta.height}` }}>
      <img src="/p/world/corridor.png" alt={alt} className="absolute inset-0 h-full w-full object-cover" />

      {/* The 8 year rules — one vertical line per real year boundary,
          at the exact fraction gen-world-plate.mjs computed off the same
          CITY.z0/MONTH_DEPTH the live ground shader's own year seams use. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {meta.years.map((y) => (
          <line
            key={y.year}
            x1={y.xFraction}
            y1={0}
            x2={y.xFraction}
            y2={1}
            stroke="#e8efe9"
            strokeOpacity={0.55}
            // A hairline in image-fraction units would be invisible at a
            // small render size and a solid bar at a large one —
            // vector-effect keeps it a constant ~1px regardless of how much
            // the SVG itself gets scaled by the aspect-ratio box above.
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Year numerals, one per rule — plain positioned text rather than
          SVG glyphs inside a 0..1 viewBox, so font size is a real CSS
          value at every viewport rather than a fraction that would need
          re-deriving per breakpoint. */}
      {meta.years.map((y) => (
        <span
          key={y.year}
          aria-hidden="true"
          className="absolute top-1 -translate-x-1/2 font-mono text-[10px] text-text/80 sm:text-xs"
          style={{ left: `${y.xFraction * 100}%` }}
        >
          {y.year}
        </span>
      ))}

      {/* The 4 lane monograms, each parked at its own lane's centreline. */}
      {meta.lanes.map((l) => (
        <span
          key={l.key}
          aria-hidden="true"
          className="absolute left-1 -translate-y-1/2 rounded border border-line/60 bg-ink/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest sm:text-xs"
          style={{ top: `${l.yFraction * 100}%`, color: l.color }}
        >
          {l.label}
        </span>
      ))}
    </div>
  );
}
