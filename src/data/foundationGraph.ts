import { projects } from "./profile/projects.ts";
import { includeBuildPairs } from "./systemGraph.ts";

// Pure data only — no three.js/@react-three/* import here on purpose.
// FoundationGraph.tsx (the flat, always-SSR'd twin) imports this directly so
// it never drags @react-three/drei's Html into the server bundle the way
// importing it through FoundationGraphScene.tsx did (TanStack Start's
// import-protection plugin denies `@react-three/*` in the server
// environment, and a named value export forces the whole importing module,
// Html included, to evaluate for SSR). FoundationGraphScene.tsx imports the
// same slugs from here for its own node/edge layout.

/** The hub half of includeBuild's short node ids vs. systemGraph.ts's full repo ids. */
export const HUB_ID_BY_REPO: Record<string, string> = { "kmp-toolkit": "toolkit", "kmp-build-logic": "buildlogic" };

/**
 * App nodes, measured: every registry project with an includeBuild edge onto
 * either hub. kmp-app-template (a scaffold, not a registry project) and the
 * toolkit/build-logic pair itself fall out of the `projects.some(...)` filter
 * on their own, so this needs no hand-kept exclusion list — gaddi and
 * candidai land here the same way doori and paymentslab-kmp already did.
 */
export const FOUNDATION_APP_SLUGS: string[] = [
  ...new Set(
    includeBuildPairs
      .filter(([, to]) => to === "kmp-toolkit" || to === "kmp-build-logic")
      .map(([from]) => from)
      .filter((slug) => projects.some((p) => p.slug === slug)),
  ),
];

export interface FoundationAppNode {
  slug: string;
  label: string;
  url?: string;
}

/** The app half of the graph's data — the accessible/no-WebGL flat twin
 *  (FoundationGraph.tsx) renders exactly this set as real, always-present
 *  text, same idea as SkillsOrbit's flat chip cloud. */
export const FOUNDATION_APP_NODES: FoundationAppNode[] = FOUNDATION_APP_SLUGS.map((slug) => {
  const project = projects.find((p) => p.slug === slug)!;
  return {
    slug,
    label: project.name,
    url: project.links.find((l) => l.label === "GitHub")?.url ?? project.links[0]?.url,
  };
});

/** [from, hubId] edges — the hub id already mapped to the short "toolkit" /
 *  "buildlogic" form the 3D scene's own nodes use. */
export const FOUNDATION_APP_EDGES: [string, string][] = includeBuildPairs
  .filter(([from, to]) => FOUNDATION_APP_SLUGS.includes(from) && (to === "kmp-toolkit" || to === "kmp-build-logic"))
  .map(([from, to]) => [from, HUB_ID_BY_REPO[to]]);
