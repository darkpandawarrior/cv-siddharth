import { profile, projects, sharedFoundation, type Project } from "./profile.ts";

export type ResourceKind = "case study" | "source" | "API docs" | "live demo" | "showcase" | "install";
export type Resource = { kind: ResourceKind; label: string; url: string };
export type ResourceRow = { project: Pick<Project, "slug" | "name" | "tagline">; resources: Resource[] };

// Verified published Dokka sites, keyed to the existing library registry.
const DOCS: Record<string, string> = {
  "kmp-toolkit": "https://darkpandawarrior.github.io/kmp-toolkit/",
  "kmp-build-logic": "https://darkpandawarrior.github.io/kmp-build-logic/",
};
const SHOWCASE = new Set(projects.filter((p) => p.showcase).map((p) => p.slug));
const PAGES: Record<string, string> = {
  doori: "https://darkpandawarrior.github.io/Doori/",
  gaddi: "https://darkpandawarrior.github.io/Gaddi/",
  "paymentslab-kmp": "https://darkpandawarrior.github.io/PaymentsLab-KMP/",
};
// Public repositories without a portfolio case study retain their actual scope.
const OTHER_PUBLIC_REPOS = [
  { slug: "GithubRepoFinder", name: "GitHub Repo Finder", tagline: "Android prototype · repository search" },
  { slug: "dee-yes-yay-neetcode-submissions", name: "Algorithm submissions", tagline: "Practice archive · NeetCode solutions" },
  { slug: "darkpandawarrior", name: "GitHub profile", tagline: "Profile README · engineering overview" },
  { slug: "darkpandawarrior.github.io", name: "Portfolio asset host", tagline: "Site infrastructure · static assets and downloads" },
];
const PUBLIC_SOURCE_REPOS = new Set([
  "Doori", "Gaddi", "PaymentsLab-KMP", "SINC-P", "kmp-toolkit",
  "kmp-build-logic", "kmp-app-template", "cv-siddharth", "cv-siddharth-kmp", "the-loopdown",
]);

/** Merge equivalent destinations while preserving distinct anchors and query values. */
export function uniqueResources(resources: Resource[]): Resource[] {
  const seen = new Set<string>();
  return resources.filter(resource => {
    const url = new URL(resource.url, profile.portfolio);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    const key = url.href;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resourceRows(): ResourceRow[] {
  const curated: ResourceRow[] = projects.map((project) => {
    const resources: Resource[] = [];
    if (project.detail) resources.push({ kind: "case study", label: "Case study", url: `/project/${project.slug}` });
    for (const link of project.links) {
      const repo = /^https:\/\/github\.com\/darkpandawarrior\/([^/?#]+)(?:\/|$)/.exec(link.url)?.[1];
      if (repo && PUBLIC_SOURCE_REPOS.has(repo)) {
        resources.push({ kind: "source", label: link.label === "GitHub" ? "Source" : link.label, url: link.url });
      }
    }
    if (project.slug === "kmp-family") {
      for (const lib of sharedFoundation.libs) {
        const url = DOCS[lib.name];
        if (url) resources.push({ kind: "API docs", label: `${lib.name} KDocs`, url });
      }
    }
    for (const target of project.targets ?? []) {
      if (target.liveUrl) resources.push({ kind: "live demo", label: "Live build", url: target.liveUrl });
    }
    if (PAGES[project.slug]) resources.push({ kind: "live demo", label: "GitHub Pages", url: PAGES[project.slug] });
    if (SHOWCASE.has(project.slug)) {
      resources.push({ kind: "showcase", label: "Narrated showcase", url: `/project/${project.slug}#showcase-${project.slug}` });
    }
    const install = project.deployments?.find((deployment) => deployment.channel === "F-Droid" && deployment.url)?.url;
    if (install) resources.push({ kind: "install", label: "F-Droid", url: install });
    return { project, resources: uniqueResources(resources) };
  });
  return [...curated, ...OTHER_PUBLIC_REPOS.map(project => ({
    project,
    resources: [{ kind: "source" as const, label: "Source and README", url: `https://github.com/darkpandawarrior/${project.slug}` }],
  }))];
}
