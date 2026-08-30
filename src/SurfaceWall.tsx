import { Link } from "@tanstack/react-router";
import { surfaces, wallSurfaces, DEVICE, type Surface } from "./data/surfaces.ts";
import { SURFACE_ICON } from "./rooms.tsx";
import { facets } from "./data/facets.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { openLauncher } from "./Launcher.tsx";

/**
 * The homepage wall: every navigable surface on this site, grouped, each in the
 * device chrome it is best seen in.
 *
 * Replaces the flat chip row that listed the eight rooms and nothing else —
 * /hire, /resume, /shipped, /pulse, /blueprint, /forge, /terminal, /map and
 * /weeb were all finished and all unlinked from this page. The list comes from
 * `data/surfaces.ts`; `surfaces.test.ts` fails the build if a route is missing
 * from it, so this wall cannot silently go stale the way the chip row did.
 *
 * WHY THERE ARE NO DEVICE POSTERS ANY MORE. Every tile used to open with a
 * 176px band holding a static webp inside a drawn device frame, arguing that
 * one Compose codebase adapts across phone, foldable, watch, TV and web. That
 * is the same claim DeviceMorph (#morph) makes further up this page, live,
 * with a running build instead of a static poster, as the docstring here
 * conceded while the band was still in place. Ten tiles spending 1,760px to
 * restate a section that proves it is a trade the page cannot afford, and the
 * argument is not lost: the device NAME is still on every tile, and the one
 * line at the top of this component is the link up to the running version.
 */

/** Year-pair for a surface the rail has dates for, e.g. "2021 :: 2026". */
function stamp(surface: Surface): string | null {
  const facet = surface.railId ? facets.find((f) => f.id === surface.railId) : undefined;
  if (!facet) return null;
  const [made, found] = [facet.authored.slice(0, 4), facet.discovered.slice(0, 4)];
  // Equal years mean nothing was recovered — a stamp there would be noise.
  return made === found ? null : `${made} :: ${found}`;
}

function SurfaceTile({ surface }: { surface: Surface }) {
  const Icon = SURFACE_ICON[surface.to];
  const device = DEVICE[surface.device];
  const dates = stamp(surface);

  return (
    <Link
      to={surface.to}
      className="panel group flex flex-col p-4 transition hover:border-accent/50 focus-visible:border-accent/50"
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={15} style={{ color: surface.tint }} aria-hidden />}
        <span className="font-display text-base font-bold text-zinc-100 transition group-hover:text-accent">
          {surface.label}
        </span>
      </span>

      <span className="kicker mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{surface.tag}</span>
        <span aria-hidden>·</span>
        <span>{device.label}</span>
        {dates && (
          <>
            <span aria-hidden>·</span>
            {/* Made, then found. The gap is the point; nothing labels it. */}
            <span className="tabular-nums" style={{ color: surface.tint }}>{dates}</span>
          </>
        )}
      </span>

      <span className="mt-2 text-sm leading-relaxed text-zinc-400">{surface.blurb}</span>
    </Link>
  );
}

/** Tiles per group on the homepage — exactly one row at the lg breakpoint. */
const PER_GROUP = 3;

export function SurfaceWall() {
  const { goToSection } = useSectionNav();
  return (
    <div className="mt-10 space-y-12">
      <p className="kicker mb-2">
        <button
          type="button"
          onClick={() => goToSection("morph")}
          className="kicker-accent transition hover:opacity-80"
        >
          ↑ Same one codebase, running live above
        </button>
      </p>
      {/* ── One row per group, not all sixteen ─────────────────────────────
          The full wall ran to seven grid rows and 3,404px — the single tallest
          thing on a homepage whose length was the complaint. It is also not
          the only way to reach any of this: Launcher.tsx renders THIS EXACT
          `wallSurfaces` data ("the homepage wall, available from anywhere")
          behind the Surfaces button that sits in the nav on every page, and
          ⌘K reaches every route by name.

          So the wall stays, ungated and content-forward as SIDOS-VISION.md
          requires — the groups, the device frames, the blurbs are all still
          here and still readable without clicking anything. It just shows one
          row of each chapter instead of every tile, and says plainly where the
          rest are. Nothing became undiscoverable; the page stopped spending a
          fifth of its height on a grid the nav already offers. */}
      {/* The writing group is not here: InkDoorway, the very next section on
          the page, is the same door wearing the ink threshold and the sepia
          palette that make it read as the seam between the two worlds. Every
          writing route stays reachable: from that section, from the launcher
          below, from the footer's whole Writing column and from ⌘K. */}
      {wallSurfaces.filter((g) => g.group !== "writing").map((group) => {
        const shown = group.items.slice(0, PER_GROUP);
        const rest = group.items.length - shown.length;
        return (
          <section key={group.group} aria-labelledby={`wall-${group.group}`}>
            <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
              <h3 id={`wall-${group.group}`} className="font-display text-lg font-bold text-zinc-100">
                {group.label}
              </h3>
              <p className="kicker">{group.note}</p>
              {rest > 0 && (
                <button
                  type="button"
                  onClick={openLauncher}
                  className="kicker-accent ml-auto transition hover:opacity-80"
                >
                  +{rest} more →
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((surface) => (
                <SurfaceTile key={surface.to} surface={surface} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-2 text-center">
        <button
          type="button"
          onClick={openLauncher}
          className="panel-sm inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-accent/50 hover:text-accent"
        >
          Open the full wall, all {surfaces.length} surfaces
        </button>
      </p>
    </div>
  );
}
