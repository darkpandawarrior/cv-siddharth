import { createFileRoute } from "@tanstack/react-router";
import { projects } from "../data/profile.ts";
import { CursorAura } from "../CursorAura.tsx";
import { ProjectDetail } from "../ProjectDetail.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { buildProjectJsonLd } from "../lib/project-jsonld.ts";

export const Route = createFileRoute("/project/$slug")({
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
