import type { Experience } from "../data/profile.ts";
import { profile, experience } from "../data/profile.ts";

const SITE_URL = "https://cv-siddharth.vercel.app";

/**
 * Every entry whose period is still running. Shared by __root.tsx's Person
 * JSON-LD (worksFor) and buildResumeJsonLd below, so a role that finishes
 * only has to stop saying "Present" in profile.ts once, not be un-remembered
 * in two hand-written filters.
 */
export function currentRoles<T extends { period: string }>(list: readonly T[]): T[] {
  return list.filter((e) => e.period.trim().endsWith("Present"));
}

/**
 * Companies where a role is still "Present" — used so a skimming reader
 * never mistakes the newest résumé entry for having replaced the one below
 * it. Derived from the data, not hardcoded: a role rolling off "Present"
 * drops out of this list on its own, nothing to remember to update by hand.
 */
export function concurrentCompanies(list: readonly Pick<Experience, "company" | "period">[]): string[] {
  return currentRoles(list).map((e) => e.company);
}

/**
 * Person schema for /resume, built from the live profile/experience data —
 * so unlike __root.tsx's hand-typed PERSON_LD.worksFor, this can't drift
 * from what the page itself says.
 */
export function buildResumeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: `${SITE_URL}/resume`,
    jobTitle: profile.resumeTitle,
    worksFor: currentRoles(experience).map((e) => ({ "@type": "Organization", name: e.company })),
    email: `mailto:${profile.email}`,
    telephone: profile.phone,
    sameAs: [profile.linkedin, profile.github],
  };
}
