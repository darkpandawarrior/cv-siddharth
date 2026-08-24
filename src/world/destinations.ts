import { CITY } from "./city.ts";
import { CAR_RADIUS } from "./drive.ts";
import { projectTowers, caseStudyMonuments, type ProjectTower, type CaseStudyMonument } from "./districtWest.ts";
import { projects, caseStudies, type Project, type CaseStudy } from "../data/profile.ts";
import { PLACEMENTS } from "./worldData.ts";
import { SENSOR_HALF_EXTENTS } from "./pavilionGeometry.ts";
import { ROOMS } from "../rooms.tsx";

/**
 * EVERY ENTERABLE THING IN THE WORLD, IN ONE DERIVED LIST.
 *
 * Substrate design doc §5: "one derived registry ... No hand-kept list —
 * that is the drift class this repo has been bitten by repeatedly." Rooms
 * come from `../rooms.tsx` (itself `src/data/surfaces.ts`'s `siteRooms`,
 * paired with `worldData.ts`'s derived `PLACEMENTS`); projects and case
 * studies come from `../data/profile.ts`, positioned by `districtWest.ts`'s
 * own derivation off the same data. Nothing here re-states a position or a
 * piece of content that already lives somewhere else — add a project to
 * profile.ts and it has a footprint (obstacles.ts), a tower (Monuments.tsx)
 * and a destination (this file) for free.
 *
 * Rooms already have their own approach mechanism (Pavilions.tsx, driving
 * PLACEMENTS/ROOMS directly) and are included here only so "every enterable
 * thing" is answerable from one module rather than two. Landmarks.tsx — the
 * project/case-study equivalent of Pavilions.tsx — filters this list to
 * `kind !== "room"`.
 */

export type DestinationKind = "room" | "project" | "case-study";

/**
 * Where "the full case study" (or the room itself) actually lives.
 * Mirrors /hire's own fallback exactly (src/routes/hire.tsx): a case study
 * that is ALSO a project gets `/project/$slug`; one that only exists in
 * `caseStudies` (gps-accuracy, crash-reduction, compose-migration,
 * white-label) has no detail route of its own and falls back to its anchor
 * on the homepage. Two case studies on /hire linked straight to
 * /project/$slug before that fallback existed and 404'd — this is the same
 * fix, reused rather than re-derived.
 */
export type DetailLink =
  | { kind: "project"; slug: string }
  | { kind: "home-anchor"; hash: string }
  | { kind: "route"; to: string };

export interface Destination {
  /** Stable, unique across the whole list. */
  key: string;
  kind: DestinationKind;
  slug: string;
  label: string;
  tagline?: string;
  /** One-line summary for the panel header. */
  summary: string;
  /** Paragraph(s)/bullets for the panel body — never invented, always a
   *  direct read of profile.ts's own approach/highlights arrays. */
  bullets: string[];
  tags: string[];
  /** Case studies only. */
  metric?: string;
  externalLinks: { label: string; url: string }[];
  position: [number, number, number];
  /** Half-extents (metres) of the approach volume — the same AABB test
   *  Pavilions.tsx runs, sized so it clears the structure's own solid
   *  footprint (obstacles.ts) plus the car's resting distance against it. */
  approachHalf: [number, number, number];
  detailLink: DetailLink;
}

// Beyond the solid footprint's resting distance (rx/rz + CAR_RADIUS — see
// drive.ts's resolveCollisions), so a car parked against the structure is
// already inside the approach box rather than forever "still approaching" a
// wall it physically cannot get any closer to.
const APPROACH_MARGIN = 1.6;
const APPROACH_HALF_Y = 3.2; // generous vertical range — same order as Pavilions' SENSOR_HALF_EXTENTS

const projectSlugs = new Set(projects.map((p) => p.slug));

/** /hire's exact fallback, reused rather than re-derived — see DetailLink's
 *  own doc comment for the 404 it fixes. */
function caseStudyDetailLink(slug: string): DetailLink {
  return projectSlugs.has(slug) ? { kind: "project", slug } : { kind: "home-anchor", hash: slug };
}

function projectDestination(p: Project, t: ProjectTower): Destination {
  const half = t.width / 2 + CAR_RADIUS + APPROACH_MARGIN;
  return {
    key: `project:${p.slug}`,
    kind: "project",
    slug: p.slug,
    label: p.name,
    tagline: p.tagline,
    summary: p.description,
    bullets: p.highlights,
    tags: p.badges,
    externalLinks: p.links,
    position: [t.x, CITY.groundY, t.z],
    approachHalf: [half, APPROACH_HALF_Y, half],
    detailLink: { kind: "project", slug: p.slug },
  };
}

function caseStudyDestination(cs: CaseStudy, m: CaseStudyMonument): Destination {
  const half = m.radius + CAR_RADIUS + APPROACH_MARGIN;
  return {
    key: `case:${cs.slug}`,
    kind: "case-study",
    slug: cs.slug,
    label: cs.title.split(" — ")[0], // full title is a paragraph — see hire.tsx's identical split
    summary: cs.summary,
    bullets: cs.approach,
    tags: cs.tags,
    metric: cs.metric,
    externalLinks: [],
    position: [m.x, CITY.groundY, m.z],
    approachHalf: [half, APPROACH_HALF_Y, half],
    detailLink: caseStudyDetailLink(cs.slug),
  };
}

function roomDestination(to: string, position: [number, number, number], half: readonly [number, number, number]): Destination | null {
  const room = ROOMS.find((r) => r.to === to);
  if (!room) return null; // never happens once worldData.test.ts's registry invariant is green
  return {
    key: `room:${to}`,
    kind: "room",
    slug: to.slice(1),
    label: room.label,
    summary: room.blurb,
    bullets: [],
    tags: [room.tag],
    externalLinks: [],
    position,
    approachHalf: [half[0], half[1], half[2]],
    detailLink: { kind: "route", to },
  };
}

/** Every project, one per `profile.projects` entry — positioned by
 *  `districtWest.ts`'s `projectTowers()`, which is itself derived off the
 *  same `profile.projects` array, so the two can never disagree on count or
 *  order. */
export function projectDestinations(): Destination[] {
  const towers = projectTowers();
  return projects.map((p, i) => projectDestination(p, towers[i]));
}

/** Every case study, one per `profile.caseStudies` entry — positioned by
 *  `districtWest.ts`'s `caseStudyMonuments()`, same pairing-by-index
 *  guarantee as above (both iterate `caseStudies` in the same order). */
export function caseStudyDestinations(): Destination[] {
  const monuments = caseStudyMonuments();
  return caseStudies.map((cs, i) => caseStudyDestination(cs, monuments[i]));
}

/** Every room, straight off the registry Pavilions.tsx already trusts. */
export function roomDestinations(): Destination[] {
  return PLACEMENTS.map((p) => roomDestination(p.to, p.position, SENSOR_HALF_EXTENTS[p.shape])).filter(
    (d): d is Destination => d !== null,
  );
}

/** Every enterable thing in the world. */
export function destinations(): Destination[] {
  return [...roomDestinations(), ...projectDestinations(), ...caseStudyDestinations()];
}

/** The subset Landmarks.tsx approaches — everything that isn't already
 *  handled by Pavilions.tsx's own room mechanism. */
export function landmarkDestinations(): Destination[] {
  return [...projectDestinations(), ...caseStudyDestinations()];
}
