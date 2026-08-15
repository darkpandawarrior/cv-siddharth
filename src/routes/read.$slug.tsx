import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pieceBySlug, printedPieces } from "../data/archiveText.ts";
import type { PrintedPiece } from "../data/archiveText.ts";
import { anthology, entriesOfSeason, entryBySlug } from "../data/anthology.ts";
import type { AnthologyEntry } from "../data/anthology.ts";
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
 * This page also serves the Morkinstar Journals, which never ran anywhere and
 * carry no page number — their "evidence" is a starmap, not a magazine spread,
 * so the provenance link points back to /anthology instead of /excelsior. Two
 * corpora, one reading experience: PrintedPiece and AnthologyEntry already
 * share the five fields (slug, title, blurb, words, body) that this page
 * actually reads, so a slug is resolved against archiveText first — the
 * older, printed set — and only falls through to the anthology if nothing
 * printed claims it.
 *
 * Deliberately plain. Measure capped for readability, generous line height, no
 * animation, no canvas. The most sophisticated thing a reading page can do is
 * get out of the way.
 */

// A discriminated union, not two separate components, because the shared
// fields (title, blurb, body, words, slug) are the entire reading experience
// and only the byline/provenance differ. Keeping one component means that
// "deliberately plain" stays enforced in exactly one place instead of two
// copies quietly drifting apart.
type ReadView = ({ kind: "printed" } & PrintedPiece) | ({ kind: "anthology" } & AnthologyEntry);

export const Route = createFileRoute("/read/$slug")({
  loader: ({ params }): ReadView => {
    // archiveText is the older, printed set, so it resolves first — a slug
    // that somehow existed in both would always mean "this ran on paper."
    const printed = pieceBySlug(params.slug);
    if (printed) return { kind: "printed", ...printed };
    const entry = entryBySlug(params.slug);
    if (entry) return { kind: "anthology", ...entry };
    throw notFound();
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
          {piece.kind === "printed" ? (
            // Four of these never ran anywhere, so there is no edition to name.
            // Saying "First published here" is better than inventing a
            // provenance, and it is also the more interesting claim.
            <p className="font-mono text-xs uppercase tracking-widest text-accent/80">
              {[
                piece.form,
                piece.page > 0 ? `Excelsior '${piece.year.slice(2)}` : piece.year ? `'${piece.year.slice(2)}` : null,
                piece.note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : (
            // The Directory numbers by journal entry, The Ninety-One Pages
            // numbers by page out of 91 — the two seasons don't share a
            // counting scheme, so the byline has to ask which season it is
            // before it can say which number.
            <p className="font-mono text-xs uppercase tracking-widest text-accent/80">
              {[
                anthology.seasons.find((s) => s.n === piece.season)?.title,
                piece.season === 1 ? `Journal Entry #${piece.entry}` : `Page ${piece.page} of 91`,
                piece.planet ? (piece.system ? `${piece.planet}, ${piece.system}` : piece.planet) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <h1 className="font-display mt-3 text-hero">
            {piece.title}
            {piece.kind === "anthology" && piece.sigil && (
              // Build-time generated from our own repo (scripts/gen-anthology.mjs
              // hashes it from the entity the entry is about), never user
              // input, so dangerouslySetInnerHTML is safe here.
              <span
                aria-hidden
                className="ml-3 inline-block h-8 w-8 align-middle text-accent"
                dangerouslySetInnerHTML={{ __html: piece.sigil }}
              />
            )}
          </h1>
          <p className="mt-3 text-sm" style={{ color: "#a4978a" }}>
            {piece.words.toLocaleString()} words · about {Math.max(1, Math.round(piece.words / 220))} min
          </p>

          {/* Two things a reader cannot otherwise know, and both are the
              interesting part of the artefact. Anthology entries have no
              print cut and no submission history, so neither callout applies
              to them. */}
          {piece.kind === "printed" && piece.printWords > 0 && (
            <p className="mt-4 border-l-2 border-accent/40 pl-4 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              This is the draft. Roughly {piece.printWords.toLocaleString()} words of it ran in the
              magazine — about {Math.round((piece.printWords / piece.words) * 100)}% survived the page
              count, so most of what follows has never been read by anyone.{" "}
              <span style={{ color: "#a4978a" }}>(Print figure is approximate: counted from OCR of the scan.)</span>
            </p>
          )}
          {piece.kind === "printed" && piece.note === "First published here" && (
            <p className="mt-4 border-l-2 border-accent/40 pl-4 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              Never submitted anywhere, so it was never cut to fit a page — and never had an editor
              either. This is the length it wanted to be.
            </p>
          )}

          {/* The provenance line. For a printed piece that means the exact page
              it ran on, which is the whole reason not to have rebuilt the
              magazine as a scrolling microsite. An anthology entry has no page
              to point at — its evidence is the starmap, not a scan — so the
              link goes back to the collection it came from instead. */}
          {piece.kind === "printed" ? (
            piece.page > 0 ? (
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
            ) : null
          ) : (
            // The anthology route ships from its own starmap page rather than
            // this one, so this is a plain anchor rather than a typed Link —
            // it works the moment that route lands without this file needing
            // to know or care about that landing order.
            <a
              href="/anthology"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              <BookOpen size={15} /> Back to The Morkinstar Journals
            </a>
          )}

          {/* The field plate, when the fetch that generated it actually landed
              one. Explicit width/height (every plate in public/ is 600x780)
              so the layout doesn't jump once the image arrives, and empty alt
              because the title, blurb and byline already say what this is —
              a plate with real alt text would just be reading the page back
              to a screen-reader user a second time. */}
          {piece.kind === "anthology" && piece.plate && (
            <img
              src={piece.plate}
              alt=""
              width={600}
              height={780}
              loading="lazy"
              className="mt-8 h-auto w-full rounded-xl border border-line"
            />
          )}

          <div className="piece-body mt-10">
            <ReactMarkdown
              // GFM is not optional for these. Three of the twenty entries carry
              // real tables, and in two of them the table IS the entry: page
              // thirty is a weighing whose whole point is a difference column
              // that climbs, and page ninety one is the charter schedule where
              // an interval that never had a length finally has one. Without
              // this plugin react-markdown does not parse tables at all, and
              // those pages shipped as one mangled line of pipes.
              remarkPlugins={[remarkGfm]}
              components={{
                // A horizontal rule inside an anthology entry becomes the mark:
                // Tveggi's single vertical scratch from Entry #2250, the name
                // with no sound that a mouth with no hands could never reach.
                // So the thing dividing the parts of a story is the object that
                // made writing possible in the first place. Build-time SVG from
                // our own repo, never user input.
                hr: () =>
                  piece.kind === "anthology" && anthology.mark ? (
                    <div
                      aria-hidden
                      className="mx-auto my-12 h-14 w-5 text-accent/70"
                      dangerouslySetInnerHTML={{ __html: anthology.mark }}
                    />
                  ) : (
                    <hr className="my-10 border-line" />
                  ),
              }}
            >
              {piece.body}
            </ReactMarkdown>
          </div>

          {/* The reason the story exists, framed as an aside rather than
              folded into the prose above — this is a person the correspondent
              met, not a character in the legend he filed. */}
          {piece.kind === "anthology" && piece.witness && (
            <aside aria-label="The teller" className="mt-10 flex gap-4 rounded-xl border border-line bg-void/40 p-4">
              <img
                src={piece.witness.art}
                alt={`${piece.witness.name}. ${piece.witness.did}`}
                loading="lazy"
                width={1100}
                height={600}
                className="h-24 w-40 shrink-0 rounded-lg object-cover"
              />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">The teller</p>
                <p className="font-display mt-1 text-base font-bold">{piece.witness.name}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                  {piece.witness.did}
                </p>
              </div>
            </aside>
          )}
        </article>

        <nav className="mt-16 border-t border-line pt-8">
          {piece.kind === "printed" ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "#a4978a" }}>
                More from the archive
              </p>
              <ul className="mt-4 divide-y divide-line">
                {printedPieces
                  .filter((p) => p.slug !== piece.slug)
                  .map((p) => (
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
            </>
          ) : (
            <>
              <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "#a4978a" }}>
                More from {anthology.seasons.find((s) => s.n === piece.season)?.title}
              </p>
              <ul className="mt-4 divide-y divide-line">
                {entriesOfSeason(piece.season)
                  .filter((e) => e.slug !== piece.slug)
                  .map((e) => (
                    <li key={e.slug}>
                      <Link to="/read/$slug" params={{ slug: e.slug }} className="group flex items-baseline justify-between gap-4 py-3">
                        <span className="font-display text-base font-bold transition group-hover:text-accent">{e.title}</span>
                        <span className="shrink-0 font-mono text-[11px]" style={{ color: "#a4978a" }}>
                          {e.season === 1 ? `#${e.entry}` : `p.${e.page}`}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </nav>
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
