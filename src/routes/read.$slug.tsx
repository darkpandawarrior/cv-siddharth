import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { pieceBySlug, printedPieces } from "../data/archiveText.ts";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

/**
 * Read a piece — the prose, not a photograph of the prose.
 *
 * /excelsior hosts 396 rendered magazine pages. That is a faithful artefact and
 * a bad way to read: the text is unselectable, unsearchable, invisible to
 * crawlers, and brutal on a phone. Ten thousand words of his actual writing sat
 * in a public repo the whole time while the site shipped pictures of paper.
 *
 * So the magazine becomes the EVIDENCE and this becomes the reading. Every
 * piece carries a link to the exact page it ran on, which is the part a
 * scrollytelling rebuild would have thrown away: you can read it properly AND
 * see that it was really printed.
 *
 * Deliberately plain. Measure capped for readability, generous line height, no
 * animation, no canvas. The most sophisticated thing a reading page can do is
 * get out of the way.
 */
export const Route = createFileRoute("/read/$slug")({
  loader: ({ params }) => {
    const piece = pieceBySlug(params.slug);
    if (!piece) throw notFound();
    return piece;
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.title} — Siddharth Pandalai` },
            { name: "description", content: loaderData.blurb },
            { property: "og:title", content: loaderData.title },
            { property: "og:description", content: loaderData.blurb },
            { property: "og:type", content: "article" },
          ],
        }
      : {},
  component: ReadPiece,
});

function ReadPiece() {
  // The loader throws notFound() for an unknown slug, so by the time this
  // renders the piece exists — but the inferred type does not know that.
  const piece = Route.useLoaderData()!;
  const others = printedPieces.filter((p) => p.slug !== piece.slug);

  return (
    <div className="ink-world min-h-screen">
      {/* The root skip link targets #main-content on every route; without it
          here, "Skip to content" went nowhere and the a11y gate timed out
          waiting for the selector. */}
      <main id="main-content" tabIndex={-1} className="section-y mx-auto max-w-2xl px-6">
        <Link to="/ink" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
          <ArrowLeft size={16} /> The Ink
        </Link>

        <article className="mt-8">
          {/* Four of these never ran anywhere, so there is no edition to name.
              Saying "First published here" is better than inventing a
              provenance, and it is also the more interesting claim. */}
          <p className="font-mono text-xs uppercase tracking-widest text-accent/80">
            {[
              piece.form,
              piece.page > 0 ? `Excelsior '${piece.year.slice(2)}` : piece.year ? `'${piece.year.slice(2)}` : null,
              piece.note,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="font-display mt-3 text-hero">{piece.title}</h1>
          <p className="mt-3 text-sm" style={{ color: "#a4978a" }}>
            {piece.words.toLocaleString()} words · about {Math.max(1, Math.round(piece.words / 220))} min
          </p>

          {/* Two things a reader cannot otherwise know, and both are the
              interesting part of the artefact. */}
          {piece.printWords > 0 && (
            <p className="mt-4 border-l-2 border-accent/40 pl-4 text-sm leading-relaxed" style={{ color: "#cfc3b2" }}>
              This is the draft. Roughly {piece.printWords.toLocaleString()} words of it ran in the
              magazine — about {Math.round((piece.printWords / piece.words) * 100)}% survived the page
              count, so most of what follows has never been read by anyone.{" "}
              <span style={{ color: "#a4978a" }}>(Print figure is approximate: counted from OCR of the scan.)</span>
            </p>
          )}
          {piece.note === "First published here" && (
            <p className="mt-4 border-l-2 border-accent/40 pl-4 text-sm leading-relaxed" style={{ color: "#cfc3b2" }}>
              Never submitted anywhere, so it was never cut to fit a page — and never had an editor
              either. This is the length it wanted to be.
            </p>
          )}

          {/* The provenance line. This is the whole reason not to have rebuilt
              the magazine as a scrolling microsite: you can read the prose here
              AND go see the page it was actually printed on. */}
          {piece.page > 0 ? (
            <Link
              to="/excelsior"
              search={{ year: Number(piece.year), page: piece.page }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              <BookOpen size={15} /> See it in print — page {piece.page}
            </Link>
          ) : piece.url ? (
            // Ran on the Editorial Board's blog, not in the magazine. That blog
            // bylines every post to the society account, so the link is the
            // publication record, not an authorship claim.
            <a
              href={piece.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              <BookOpen size={15} /> Read it where it ran{piece.published ? ` — ${piece.published}` : ""}
            </a>
          ) : null}

          <div className="piece-body mt-10">
            <ReactMarkdown>{piece.body}</ReactMarkdown>
          </div>
        </article>

        <nav className="mt-16 border-t border-line pt-8">
          <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "#a4978a" }}>
            More from the archive
          </p>
          <ul className="mt-4 divide-y divide-line">
            {others.map((p) => (
              <li key={p.slug}>
                <Link to="/read/$slug" params={{ slug: p.slug }} className="group flex items-baseline justify-between gap-4 py-3">
                  <span className="font-display text-base font-bold transition group-hover:text-accent">{p.title}</span>
                  <span className="shrink-0 font-mono text-[11px]" style={{ color: "#a4978a" }}>
                    {p.year ? `'${p.year.slice(2)} · ` : ""}{p.words.toLocaleString()}w
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
