/**
 * Barrel over src/data/profile/ — split along its export seams (arch-L15)
 * so a route that needs one section (e.g. /hire: profile+metrics+caseStudies
 * +projectCards) never pulls in the whole ~226 KB monolith this file used to
 * be. Every existing importer keeps compiling against this same path; Rollup
 * resolves re-exports through to the real module for chunking, so nothing
 * here costs a byte on its own.
 *
 * Adding a section: put it in its own src/data/profile/<name>.ts file and
 * re-export it below. Do not add data literals to THIS file — that recreates
 * the monolith one export at a time.
 */
export { profile, education, metrics, resumeMetrics, competencies, languages } from "./profile/core.ts";
export type { ExperiencePoint, Experience } from "./profile/experience.ts";
export { experience } from "./profile/experience.ts";
export type { CaseStudy } from "./profile/caseStudies.ts";
export { caseStudies } from "./profile/caseStudies.ts";
export { skills, resumeSkills } from "./profile/skills.ts";
export type {
  ProjectDetailSection,
  ProjectVideo,
  ProjectDetailData,
  ProjectTarget,
  Project,
} from "./profile/projects.ts";
export { projects, projectBySlug, providerCount, upstreamStars } from "./profile/projects.ts";
export type { ProjectCard } from "./profile/projectCards.ts";
export { projectCards } from "./profile/projectCards.ts";
export type { SharedLib, Contribution, GrowthItem } from "./profile/openSource.ts";
export { sharedFoundation, upstreamMergedPRs, openSource, recentGrowth } from "./profile/openSource.ts";
export { cardMedia } from "./profile/cardMedia.ts";

/* ── The site's own interactive surfaces ──────────────────────────────────
 * MOVED to src/data/surfaces.ts, which is now the single registry of every
 * navigable route — rooms and ordinary pages alike. The split that used to
 * live here (rooms in profile.ts, everything else in routeHead.ts's NON_ROOM)
 * is exactly what let nine finished routes go unlinked from the homepage.
 *
 * Re-exported so the eleven existing importers keep compiling unchanged.
 */
export { siteRooms, type Surface, type Surface as SiteRoom } from "./surfaces.ts";
