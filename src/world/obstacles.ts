import { employerBlocks, caseStudyMonuments, projectTowers } from "./districtWest.ts";
import { excelsiorEditionBlocks, EDITION_FOOTPRINT } from "./corpusData.ts";
import type { Obstacle } from "./drive.ts";

/**
 * EVERY SOLID THING IN THE WORLD, IN ONE DERIVED LIST.
 *
 * This replaces the four `*Colliders` components that used to hang off
 * Monuments.tsx and Corpus.tsx. Those existed only to hand Rapier a body per
 * structure; with the vehicle kinematic (see drive.ts) the physics is a list
 * of footprints and nothing needs to be a component at all.
 *
 * It is DERIVED, never hand-kept. This repo's recurring defect is a
 * hand-maintained list that mirrors a generated one and silently falls behind
 * — HASH_ROUTES, the palette's route rows, SECTION_ID_LIST and gen-sitemap's
 * PAGES have all done it, and SiteFooter's COLUMNS is doing it right now.
 * A collider list is the same shape of hazard with a worse failure: a tower
 * added to districtWest.ts but forgotten here would be a building you drive
 * straight through. So this calls the same four functions the renderers call.
 * Add a structure and its footprint appears here for free.
 *
 * Pavilions are deliberately absent. They carry an approach volume, not a
 * wall — a room you can drive into the middle of is the point, and that was
 * true under Rapier too (Pavilions.tsx: "there is no solid collider").
 */
export function worldObstacles(): Obstacle[] {
  const out: Obstacle[] = [];

  for (const b of employerBlocks()) {
    out.push({ id: `employer:${b.company}`, x: b.x, z: b.zMid, rx: b.width / 2, rz: b.span / 2 });
  }

  // Case-study monuments are cylinders. A square footprint of the same radius
  // is the honest approximation for an axis-aligned test: it can only ever be
  // MORE solid than the art, never less, so the car cannot clip a corner that
  // looks solid. Under Rapier the mismatch went the other way and a glancing
  // hit on the round edge was what threw the car hardest.
  for (const m of caseStudyMonuments()) {
    out.push({ id: `case:${m.slug}`, x: m.x, z: m.z, rx: m.radius, rz: m.radius });
  }

  for (const t of projectTowers()) {
    out.push({ id: `project:${t.slug}`, x: t.x, z: t.z, rx: t.width / 2, rz: t.width / 2 });
  }

  for (const e of excelsiorEditionBlocks()) {
    out.push({ id: `edition:${e.year}`, x: e.x, z: e.z, rx: EDITION_FOOTPRINT / 2, rz: EDITION_FOOTPRINT / 2 });
  }

  return out;
}
