import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { projects } from "../data/profile.ts";
import { CursorAura } from "../CursorAura.tsx";
import { ProjectDetail } from "../ProjectDetail.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { buildProjectJsonLd } from "../lib/project-jsonld.ts";

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
    if (!projects.some((x) => x.slug === params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const p = projects.find((x) => x.slug === params.slug);
    const title = p ? `${p.name} — Siddharth Pandalai` : "Project — Siddharth Pandalai";
    const desc = p?.description ?? "A build from Siddharth Pandalai's portfolio.";
    // scripts/gen-og.mjs only rasterizes /p/<slug>/og.png for projects with a
    // `detail` case-study page (`projects.filter((p) => p.detail)`) — same
    // predicate reused here so this can't silently drift from what's on disk.
    // Everything else (e.g. the "portfolio" entry) falls back to the
    // site-default OG image, which always exists.
    const og = p?.detail
      ? `https://cv-siddharth.vercel.app/p/${params.slug}/og.png`
      : "https://cv-siddharth.vercel.app/og-image.png";
    // Guard: an unknown slug (p undefined) still needs valid meta above, but
    // gets no JSON-LD at all — schema.org data must describe a real project,
    // not a placeholder.
    const scripts = p
      ? Object.values(buildProjectJsonLd(p)).map((jsonLd) => ({ type: "application/ld+json", children: JSON.stringify(jsonLd) }))
      : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: og },
        { property: "og:url", content: `https://cv-siddharth.vercel.app/project/${params.slug}` },
        { name: "twitter:image", content: og },
      ],
      links: [{ rel: "canonical", href: `https://cv-siddharth.vercel.app/project/${params.slug}` }],
      scripts,
    };
  },
  component: ProjectPage,
});

function ProjectPage() {
  const { slug } = Route.useParams();
  return (
    <div className="min-h-screen">
      <CursorAura />
      <ProjectDetail slug={slug} />
      <FloatingChat />
    </div>
  );
}
