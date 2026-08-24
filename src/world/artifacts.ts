import { metrics, projects } from "../data/profile.ts";
import { projectStats } from "../data/projectStats.ts";
import { chess } from "../data/chess.ts";
import { weeb } from "../data/weeb.ts";
import { TERRAIN, PLACEMENTS } from "./worldData.ts";
import { CITY } from "./city.ts";

/**
 * The collectibles — and the reason this world is worth driving rather than
 * looking at.
 *
 * Every artifact is a REAL fact, read from the same data the rest of the site
 * renders: a shipped project and its module count, a production metric, the
 * chess corpus, the archive. Nothing here is invented flavour text. That is the
 * entire point — a portfolio whose 3D world is generic crates is a tech demo
 * bolted onto a CV, whereas one whose collectibles ARE the CV makes exploring
 * it the same act as reading it.
 *
 * They are spread the length of the whole boulevard on purpose: collecting
 * the set is what takes a visitor past every room and every era, which is the
 * only reason a hub needs a collectible at all.
 */


export type Artifact = {
  id: string;
  /** Short name shown on the pickup toast. */
  label: string;
  /** The fact itself. */
  detail: string;
  position: [number, number, number];
};


/**
 * Deterministic placement on the city's approach apron — `|x|` between the
 * boulevard's kerb and `CITY.buildInner`, the corridor the design doc's own
 * lateral-band table reserves for "nothing district-scale, ever" (see
 * city.ts / districtWest.ts / corpusData.ts, none of which ever site a
 * structure at `|x| < CITY.buildInner`). That makes it the one strip on
 * either flank an artifact can sit in without risking a visual collision with
 * an employer block, a project tower or a corpus pillar — the old disc-shaped
 * scatter (a phyllotaxis spiral over the whole 21m-wide desk) would now
 * regularly land ON one of those.
 *
 * Still fully deterministic — no `Math.random` — so the same artifact is
 * always in the same place across reloads; "I know there's one behind the
 * lab" is the feeling worth protecting. The golden-angle spread that used to
 * walk a disc now walks the apron's width instead, and z is spread evenly the
 * length of the whole 168m boulevard rather than clustered near the old 30m
 * desk's centre.
 */
/** 137.5° — the angle that gives a phyllotaxis-style spread with no two
 *  successive values landing close together. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Clear of the boulevard (`CITY.laneHalf`, always-resolved and never built
 *  on) at the inner edge, clear of `CITY.buildInner` — where district
 *  geometry is allowed to start — at the outer one. */
const APRON_X_MIN = CITY.laneHalf + 1.5;
const APRON_X_MAX = CITY.buildInner - 1;

/** How far an artifact's z is nudged, and how many times, when it lands
 *  inside a pavilion's own approach sensor — see `place()` below. Matches
 *  Pavilions.tsx's sensor half-extent (4.8m) plus a margin, so one nudge is
 *  always enough in practice; the loop just bounds the pathological case. */
const ROOM_Z_CLEARANCE = 6.5;
const MAX_NUDGES = 8;

function place(index: number, total: number): [number, number, number] {
  const { z0, z1, groundY } = TERRAIN.mainland;
  const side = index % 2 === 0 ? -1 : 1;

  // Evenly down the whole boulevard, margined off both kerbs — this alone
  // keeps same-side neighbours (index, index+2) roughly 2*span/total apart,
  // comfortably past ARTIFACT_PICKUP_RADIUS for the ~19 artifacts this file
  // actually seeds.
  const marginZ = 6;
  const usableZ = z1 - z0 - marginZ * 2;
  let z = z0 + marginZ + (index / Math.max(1, total - 1)) * usableZ;

  // A collectible sitting inside a pavilion's approach volume reads as
  // buried in the doorway rather than found, so nudge south until clear of
  // every room's z — cheap because there are only eight of them, and
  // deterministic because the nudge step is fixed, not randomised.
  for (let tries = 0; tries < MAX_NUDGES; tries++) {
    const blocked = PLACEMENTS.some((p) => Math.abs(p.position[2] - z) < ROOM_Z_CLEARANCE);
    if (!blocked) break;
    z += ROOM_Z_CLEARANCE;
  }

  // Golden-angle walk across the apron's width, same low-discrepancy idea the
  // old phyllotaxis spiral used, just bounded to a corridor instead of a disc.
  const spread = ((index * GOLDEN_ANGLE) % 1 + 1) % 1;
  const x = side * (APRON_X_MIN + spread * (APRON_X_MAX - APRON_X_MIN));

  return [x, groundY + 1.2, z];
}

type Seed = { id: string; label: string; detail: string };

/** Built from the site's own data modules — see this file's header. */
function seeds(): Seed[] {
  const out: Seed[] = [];

  // Shipped work — every project, not the first five. The slice silently
  // dropped whatever was authored last, and `place()` already takes the final
  // count and redistributes the whole boulevard around it, so there was never
  // a spacing reason to cap it.
  for (const p of projects) {
    out.push({ id: `project-${p.slug}`, label: p.name, detail: p.status });
  }

  // Production numbers — the ones the homepage leads with.
  for (const m of metrics) {
    out.push({
      id: `metric-${m.label.replace(/\s+/g, "-")}`,
      label: m.value,
      detail: `${m.label} — ${m.detail}`,
    });
  }

  // Repo scale: the numbers that only mean something once you know the
  // codebase.
  for (const [slug, stat] of Object.entries(projectStats)) {
    const modules = "modules" in stat ? stat.modules : undefined;
    const screenshots = "screenshots" in stat ? stat.screenshots : undefined;
    out.push({
      id: `stat-${slug}`,
      label: slug,
      detail: [modules && `${modules} modules`, screenshots && `${screenshots} screenshots`]
        .filter(Boolean)
        .join(" · "),
    });
  }

  // The side corpora, matching the east flank's chess ridge and weeb field.
  // Shapes read from the generated files themselves, not assumed: chess keys
  // its counts under `totals`, weeb under `anime`. Both are regenerated by
  // npm scripts, so these numbers move on their own.
  out.push({
    id: "chess-corpus",
    label: "Chess corpus",
    detail: `${chess.totals.games.toLocaleString()} games · ${chess.totals.wins.toLocaleString()} wins`,
  });
  out.push({
    id: "weeb-corpus",
    label: "Weeb Central",
    detail: `${weeb.anime.total} titles logged, ${weeb.anime.matched} matched`,
  });

  // The two facts least visible from a CV: what this site actually is, and
  // that it keeps changing.
  out.push({
    id: "orbit-site",
    label: "This site",
    detail: "A running program, not a PDF with a pulse",
  });
  out.push({
    id: "orbit-loop",
    label: "Still shipping",
    detail: "The archive grows backwards as well as forwards",
  });

  return out;
}

export const ARTIFACTS: Artifact[] = seeds().map((s, i, all) => ({
  ...s,
  position: place(i, all.length),
}));

/** How close the craft has to get. Generous — hunting a collectible should be
 *  about finding it, not about threading a hitbox. */
export const ARTIFACT_PICKUP_RADIUS = 3.2;
