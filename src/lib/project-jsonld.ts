import type { Project } from "../data/profile.ts";

const SITE_URL = "https://cv-siddharth.vercel.app";

// Stack entries are a mix of languages, frameworks and platforms (e.g.
// "Kotlin Multiplatform", "Ktor", "Android"). Only surface entries that
// actually name a programming language rather than guessing one — an absent
// programmingLanguage is more honest than a wrong one.
const LANGUAGE_HINTS = ["Kotlin", "GDScript", "Swift", "TypeScript", "JavaScript", "Java", "Python"];

/**
 * Builds the two per-project JSON-LD blocks for /project/$slug's head()
 * (the F2 follow-up). Pure and unit-testable — no DOM/router dependency.
 */
export function buildProjectJsonLd(p: Project) {
  const url = `${SITE_URL}/project/${p.slug}`;
  // Word-boundary match, not substring: "JavaScript".includes("Java") is true,
  // which would wrongly tag a JS project as also using Java. `\bJava\b` has no
  // boundary inside "JavaScript" (Java|Script), so it correctly won't match.
  const programmingLanguage = LANGUAGE_HINTS.filter((lang) =>
    p.stack.some((s) => new RegExp(`\\b${lang}\\b`).test(s)),
  );
  const repo = p.links.find((l) => /github\.com|gitlab\.com|bitbucket\.org/.test(l.url));

  const softwareSourceCode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: p.name,
    description: p.description,
    url,
    author: { "@type": "Person", name: "Siddharth Pandalai" },
  };
  if (programmingLanguage.length) softwareSourceCode.programmingLanguage = programmingLanguage;
  if (repo) softwareSourceCode.codeRepository = repo.url;

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Projects", item: `${SITE_URL}/#projects` },
      { "@type": "ListItem", position: 3, name: p.name, item: url },
    ],
  };

  // Only projects with a real write-up (ProjectDetailData.overview) have case-
  // study prose worth marking up — a project rendering only its tagline/stack
  // has nothing an Article schema would add over the SoftwareSourceCode above.
  const article = p.detail ? buildArticleJsonLd(p) : undefined;

  return { softwareSourceCode, breadcrumbList, ...(article ? { article } : {}) };
}

/**
 * Article JSON-LD for a project's case-study page (arch-L11, the answer
 * layer — "quotable on-page answers" extends to the case-study prose itself,
 * not only the FAQ block). `articleBody` is the project's own overview, never
 * retyped: this reads `p.detail.overview` rather than restating it, so the
 * prose can't drift from what the page actually renders.
 */
export function buildArticleJsonLd(p: Project) {
  if (!p.detail) return undefined;
  const url = `${SITE_URL}/project/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${p.name} — case study`,
    description: p.description,
    articleBody: p.detail.overview,
    author: { "@type": "Person", name: "Siddharth Pandalai" },
    url,
    mainEntityOfPage: url,
  };
}
