import { useEffect } from "react";
import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
// projectCards, not the ../data/profile.ts barrel's `projects`: `beforeLoad`/
// `head` can't be code-split (see project-jsonld.ts's own comment on why),
// so whatever they import lands in every route's shared eager entry, not
// just /project/*'s. ProjectDetail.tsx (the split `component`, below) reads
// the full `projects` array itself, unaffected — it's already lazy.
import { projectCards } from "../data/profile/projectCards.ts";
// Type-only: erased at compile time, costs nothing in the bundle (same
// reasoning as project-jsonld.ts's own `import type { Project }`).
import type { Project } from "../data/profile.ts";
import { CursorAura } from "../CursorAura.tsx";
import { ProjectDetail } from "../ProjectDetail.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { buildProjectJsonLd } from "../lib/project-jsonld.ts";
import { heavy } from "../lib/assetBase.ts";
import { touch } from "../lib/sessionRipple.ts";

/**
 * Slugs that used to be their own project and now live inside another one. They stay resolvable
 * forever: they were in the sitemap and are the kind of URL that ends up in a message to a
 * recruiter, and a 404 there is worse than a redirect nobody notices.
 *
 * cv-siddharth-kmp merged into `portfolio` — the two were separate entries where one bounced you
 * to the live site you were already on and the other bounced you to GitHub, so neither ever
 * explained what it was.
 */
const PROJECT_SLUG_ALIASES: Record<string, string> = {
  "cv-siddharth-kmp": "portfolio",
};

export const Route = createFileRoute("/project/$slug")({
  // Unknown slug → the designed 404 (real 404 status + noindex + landmarks),
  // not a bare 200 "not found" div. Reuses the root notFoundComponent (C1).
  beforeLoad: ({ params }) => {
    const alias = PROJECT_SLUG_ALIASES[params.slug];
    if (alias) throw redirect({ to: "/project/$slug", params: { slug: alias }, statusCode: 301 });
    if (!projectCards.some((x) => x.slug === params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const p = projectCards.find((x) => x.slug === params.slug);
    const title = p ? `${p.name} — Siddharth Pandalai` : "Project — Siddharth Pandalai";
    const desc = p?.description ?? "A build from Siddharth Pandalai's portfolio.";
    // scripts/gen-og.mjs only rasterizes /p/<slug>/og.png for projects with a
    // `detail` case-study page (`projects.filter((p) => p.detail)`) — same
    // predicate reused here so this can't silently drift from what's on disk.
    // Everything else (e.g. the "portfolio" entry) falls back to the
    // site-default OG image, which always exists.
    const og = p?.hasDetail
      ? heavy(`/p/${params.slug}/og.png`)
      : "https://siddharth-pandalai.vercel.app/og-image.png";
    // Guard: an unknown slug (p undefined) still needs valid meta above, but
    // gets no JSON-LD at all — schema.org data must describe a real project,
    // not a placeholder. `links`/`detail` are reassembled from the card's own
    // repoUrl/overview (project-jsonld.ts only reads the one matching repo
    // link and detail.overview) — see this file's import comment.
    const scripts = p
      ? Object.values(
          buildProjectJsonLd({
            slug: p.slug,
            name: p.name,
            description: p.description,
            stack: p.stack,
            links: p.repoUrl ? [{ label: "GitHub", url: p.repoUrl }] : [],
            detail: p.hasDetail ? ({ overview: p.overview ?? "" } as Project["detail"]) : undefined,
          }),
        ).map((jsonLd) => ({ type: "application/ld+json", children: JSON.stringify(jsonLd) }))
      : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: og },
        { property: "og:url", content: `https://siddharth-pandalai.vercel.app/project/${params.slug}` },
        { name: "twitter:image", content: og },
      ],
      links: [{ rel: "canonical", href: `https://siddharth-pandalai.vercel.app/project/${params.slug}` }],
      scripts,
    };
  },
  component: ProjectPage,
});

// getRouteApi: see src/routes/map.tsx's comment — `Route.useParams()` inside
// a split component re-imports the whole route module (here, `projects`,
// the heavy full project data `beforeLoad`/`head` genuinely need eagerly for
// THIS route — the bug was that leaking into every OTHER route too).
const route = getRouteApi("/project/$slug");

function ProjectPage() {
  const { slug } = route.useParams();
  // Records the visit for /map's "your path" (sessionRipple.ts, P5), a
  // client effect only, module-scope state that never persists or leaves
  // the browser. ProjectDetail.tsx itself is not touched (phase 1 scope).
  useEffect(() => {
    touch(slug);
  }, [slug]);
  return (
    <div className="min-h-screen">
      <CursorAura />
      <ProjectDetail slug={slug} />
      {/* Every other route closes with the site footer; project pages ended on
          the chat's FAQ block with no way onward except "Back to all projects". */}
      <SiteFooter />
    </div>
  );
}
