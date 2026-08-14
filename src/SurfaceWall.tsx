import { Link } from "@tanstack/react-router";
import { wallSurfaces, DEVICE, type DeviceFrame, type Surface } from "./data/surfaces.ts";
import { SURFACE_ICON } from "./rooms.tsx";
import { facets } from "./data/facets.ts";

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
 * ON THE DEVICE FRAMES. An iOS engineer's portfolio can render one iPhone and
 * be done. The claim this site exists to make is the other one — a single
 * Compose codebase adapting across phone, foldable, tablet, watch, TV, desktop
 * and web — so the wall renders the matrix instead of describing it. No copy
 * anywhere explains that; if it needed a sentence it would have failed.
 *
 * PERFORMANCE. Every poster is a ~22 kB webp, `loading="lazy"` and
 * `decoding="async"`, below the fold. The wall adds no JS beyond this file and
 * no third-party anything: the frames are borders and aspect ratios.
 */

/** Every frame is drawn inside a band of exactly this height. */
const BAND = "11rem";

/**
 * Proportion per device, sized by HEIGHT rather than width.
 *
 * Width-sizing was the obvious way and it was wrong: a 9/16 phone at 42% of a
 * card stands ~16rem tall while a 16/10 desktop at 92% is ~8rem, so labels
 * stopped aligning across a row and the grid grew a ragged baseline. Pinning
 * each device to a fraction of one fixed band makes rows line up AND makes the
 * form-factor comparison legible — a phone reads as tall-and-narrow against a
 * TV that reads wide-and-short, which is the entire argument the wall is here
 * to make.
 *
 * Only the presentational half lives here. The aspect and the label come from
 * DEVICE in the registry, because the capture script and the poster cropper
 * need the same numbers and cannot import this file — when they were separate,
 * every poster was cropped to 16:9 no matter which frame it landed in.
 */
const FRAME: Record<DeviceFrame, { height: string; radius?: string }> = {
  phone: { height: "100%" },
  foldable: { height: "84%" },
  tablet: { height: "88%" },
  watch: { height: "52%", radius: "1.9rem" },
  tv: { height: "72%", radius: "0.6rem" },
  desktop: { height: "76%", radius: "0.7rem" },
  browser: { height: "76%", radius: "0.7rem" },
  widget: { height: "42%", radius: "1.1rem" },
};

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
  const frame = FRAME[surface.device];
  const device = DEVICE[surface.device];
  const dates = stamp(surface);

  return (
    <Link
      to={surface.to}
      className="group flex flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-accent/50 focus-visible:border-accent/50"
    >
      {/* The frame. A surface with no capture skips this entirely and still
          renders a complete, legible tile — that degradation is the whole
          reason a new surface can ship the day it exists. */}
      {surface.poster && (
        <span
          className="mb-4 flex items-end justify-center"
          // One fixed band for every device, so rows line up no matter which
          // frame a tile wears.
          style={{ height: BAND }}
        >
          <span
            className="device block"
            style={{
              height: frame.height,
              aspectRatio: String(device.aspect),
              maxWidth: "100%",
              ...(frame.radius ? { borderRadius: frame.radius } : {}),
            }}
          >
            <img
              src={`/surfaces/${surface.poster}.webp`}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
            />
          </span>
        </span>
      )}

      <span className="flex items-center gap-2">
        {Icon && <Icon size={15} style={{ color: surface.tint }} aria-hidden />}
        <span className="font-display text-base font-bold text-zinc-100 transition group-hover:text-accent">
          {surface.label}
        </span>
      </span>

      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted">
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

export function SurfaceWall() {
  return (
    <div className="mt-10 space-y-12">
      {wallSurfaces.map((group) => (
        <section key={group.group} aria-labelledby={`wall-${group.group}`}>
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
            <h3 id={`wall-${group.group}`} className="font-display text-lg font-bold text-zinc-100">
              {group.label}
            </h3>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">{group.note}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((surface) => (
              <SurfaceTile key={surface.to} surface={surface} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
