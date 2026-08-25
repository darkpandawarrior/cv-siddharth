import { Children, cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { pieceBySlug, printedPieces } from "../data/archiveText.ts";
import type { PrintedPiece } from "../data/archiveText.ts";
import { anthology, entriesOfSeason, entryBySlug } from "../data/anthology.ts";
import type { AnthologyEntry } from "../data/anthology.ts";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { entryTheme, KINDLING_FINALE } from "../lib/seasonTheme.ts";
import { MarginNotes } from "../play/MarginNotes.tsx";
import { DeferredPlayRoom } from "../play/DeferredPlayRoom.tsx";

/**
 * Read a piece — the prose, not a photograph of the prose.
 *
 * /excelsior hosts the magazine as rendered page images. That is a faithful
 * artefact and a bad way to read: the text is unselectable, unsearchable,
 * invisible to crawlers, and brutal on a phone. Ten thousand words of his
 * actual writing sat in a public repo the whole time while the site shipped
 * pictures of paper.
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

// Every generated entry closes with exactly one "\n\n---\n\n" before its
// Terminologies block (src/data/anthology.test.ts guards the shape this
// depends on), so splitting on it is a safe way to render the story and the
// tape separately without the generator needing to mark that boundary itself.
const TERMINOLOGIES_DIVIDER = "\n\n---\n\n";

// react-markdown hands a table row's cells to us as elements, not text, and
// the row-marking rule below has to read that text to work at all — walking
// the tree once here is cheaper than teaching every caller to do it.
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

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

  // Entry #2300 is filed incomplete on purpose: its own frontmatter says so,
  // and its last sentence has no closing punctuation because the Directory
  // never got one. This check is generic — any anthology entry whose story
  // (everything before the Terminologies divider) ends without terminal
  // punctuation gets the treatment — so it stays correct if the corpus ever
  // grows a second entry that stops the same way, without a hardcoded slug.
  const dividerIndex = piece.kind === "anthology" ? piece.body.indexOf(TERMINOLOGIES_DIVIDER) : -1;
  const storyBody = dividerIndex >= 0 ? piece.body.slice(0, dividerIndex) : piece.body;
  const terminologiesBody = dividerIndex >= 0 ? piece.body.slice(dividerIndex + TERMINOLOGIES_DIVIDER.length) : null;
  const trimmedStory = storyBody.trim();
  const endsMidSentence = piece.kind === "anthology" && !/[.!?"'”’)\]]$/.test(trimmedStory);
  // The cut line renders outside ReactMarkdown, as its own paragraph, rather
  // than wrapping the whole story in an extra element to hang a CSS hook
  // off — that wrapper would sit between .piece-body and every other
  // paragraph and quietly break the Terminologies block's :last-of-type
  // selector further down in this file, for every entry, not just this one.
  const lastParagraphBreak = endsMidSentence ? trimmedStory.lastIndexOf("\n\n") : -1;
  const storyBeforeCut = lastParagraphBreak >= 0 ? trimmedStory.slice(0, lastParagraphBreak) : storyBody;
  const cutLine = lastParagraphBreak >= 0 ? trimmedStory.slice(lastParagraphBreak + 2).trim() : null;

  // Shared by the story half and the Terminologies half so the mark and the
  // row-marking rule below behave identically on both sides of the split.
  const markdownComponents: Components = {
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
    // The charter table in s2-10 has one row where a "not yet required"
    // interval finally got a length (see the Standard Intervals table:
    // Elysheim and Vænheim are the two founding-blank rows, told apart from
    // the six that were assigned from day one because their Interval and
    // Realm columns repeat the same name). Marking it this way reads the
    // row's own cells rather than a row index, so it keeps working if the
    // source ever reorders the table or adds another reserved interval.
    tr: ({ children }) => {
      if (piece.kind !== "anthology") return <tr>{children}</tr>;
      const cells = Children.toArray(children);
      const texts = cells.map((cell) => nodeText(cell).trim());
      const isReservedInterval = cells.length >= 3 && texts[0].length > 0 && texts[0] === texts[1];
      const length = texts[texts.length - 1];
      const isNewlyAssigned = isReservedInterval && length.length > 0 && !/not yet required/i.test(length);
      if (!isNewlyAssigned) return <tr>{children}</tr>;
      const lastIndex = cells.length - 1;
      return (
        <tr className="anthology-row-changed">
          {cells.map((cell, i) => {
            if (i !== lastIndex || !isValidElement(cell)) return cell;
            const td = cell as ReactElement<{ children?: ReactNode }>;
            return cloneElement(td, { key: td.key ?? i }, [
              td.props.children,
              <span key="changed-note" className="sr-only">
                . Assigned for the first time since the founding.
              </span>,
            ]);
          })}
        </tr>
      );
    },
  };

  // Which season this is, and therefore which chrome, which numbering and
  // which tokens — asked once, of the entry, not of the season number. The
  // page he keeps is an exception inside season three's own row over there
  // (page 0, no scorch, its own palette), so nothing about it leaks into a
  // branch here. Printed pieces are not part of that scheme at all and keep
  // this page exactly as it was.
  const theme = piece.kind === "anthology" ? entryTheme(piece) : null;
  const vars = theme?.vars;

  // Season three swaps --color-accent to ember and carries --scorch; both
  // only work if they sit ABOVE the byline and the prose, so the vars go on
  // the article and every var() underneath re-resolves. Ember is #d97a3d
  // (--color-warn), 6.14:1 on the ink ground.
  //
  // The kept page goes further: its palette is measured against paper
  // (#e9dfc9), not against the ink ground this world otherwise paints. Laying
  // those tokens down without also laying the paper down would put #1f1a12
  // ink on a near-black ground at 1.10:1 — invisible, and the exact way this
  // season already shipped a badge at 1.4:1 once. So when a theme brings its
  // own --color-card, the article paints it and the ratios seasonTheme states
  // hold as measured: text 13.06:1, dim 5.87:1, accent 5.09:1 on that paper.
  const onPaper = Boolean(vars && "--color-card" in vars);

  return (
    <DeferredPlayRoom>
    <div className="ink-world min-h-screen">
      {/* The root skip link targets #main-content on every route; without it
          here, "Skip to content" went nowhere and the a11y gate timed out
          waiting for the selector. */}
      <main id="main-content" tabIndex={-1} className="section-y mx-auto max-w-2xl px-6">
        <Link to="/ink" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
          <ArrowLeft size={16} /> The Ink
        </Link>

        <article
          className={`mt-8${onPaper ? " rounded-xl p-6 sm:p-8" : ""}`}
          // color is restated, not inherited: .ink-world sets it on itself, so
          // without this the paper page would keep the cream it inherited.
          style={onPaper ? { ...vars, backgroundColor: "var(--color-card)", color: "var(--color-text)" } : vars}
        >
          {piece.kind === "printed" ? (
            // Four of these never ran anywhere, so there is no edition to name.
            // Saying "First published here" is better than inventing a
            // provenance, and it is also the more interesting claim.
            <p className="kicker-accent">
              {[
                piece.form,
                piece.page > 0 ? `Excelsior '${piece.year.slice(2)}` : piece.year ? `'${piece.year.slice(2)}` : null,
                piece.note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : (
            // The seasons do not share a counting scheme — the Directory
            // numbers by journal entry, The Ninety-One Pages by page out of
            // 91, and the page he keeps has no number at all — so this page
            // no longer formats one. theme.label is the single place that
            // knows, which is also why "PAGE 0 OF 91" can no longer be
            // reached from here: the kept row answers "THE PAGE HE KEEPS".
            <p className="kicker-accent">
              {[
                anthology.seasons.find((s) => s.n === piece.season)?.title,
                theme?.label,
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
          {/* The token, not the literal it happens to equal. --color-muted IS
              #a4978a inside .ink-world (7.1:1 on ink), so this is a no-op for
              every page but the one whose theme repaints the ground: there it
              becomes #6b6153 on paper, 4.58:1, instead of #a4978a on paper,
              which is 2.15:1 and fails. */}
          <p className="mt-3 text-sm" style={{ color: "var(--color-muted)" }}>
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
              <span style={{ color: "var(--color-muted)" }}>(Print figure is approximate: counted from OCR of the scan.)</span>
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

          <div className={`piece-body mt-10${theme?.body ? ` ${theme.body}` : ""}`}>
            {/* Season 1 filed through a rig and reached the reader — this is
                that arrival, logged. Season 2 stops filing (see the season
                blurb), so its chrome is "none" and nothing renders here: the
                absence is the tell, not a hidden or greyed-out state. Season
                3 is neither: he is withdrawing a page, not receiving or
                refusing one, so it gets its own quiet marker instead. Which
                of the three is seasonTheme's call, not this page's. */}
            {piece.kind === "anthology" && theme?.chrome === "relay" && <RelayHeader entry={piece} />}
            {piece.kind === "anthology" && theme?.chrome === "withdrawn" && <WithdrawnMarker entry={piece} />}
            <ReactMarkdown
              // GFM is not optional for these. Some entries carry real tables,
              // and in a couple of them the table IS the entry: page thirty is
              // a weighing whose whole point is a difference column that
              // climbs, and page ninety one is the charter schedule where an
              // interval that never had a length finally has one. Without
              // this plugin react-markdown does not parse tables at all, and
              // those pages shipped as one mangled line of pipes.
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {endsMidSentence ? storyBeforeCut : storyBody}
            </ReactMarkdown>

            {/* Entry #2300 stops mid-sentence and is filed that way on
                purpose — the fiction never gets to finish it, so this never
                completes the sentence for it. The last line is pulled out of
                ReactMarkdown and rendered by hand so the cut mark can sit
                right against the real last word; the status line under it is
                the Directory's own sign-off for a transmission that didn't
                arrive, in the same institutional register as RelayHeader. */}
            {endsMidSentence && cutLine && (
              <>
                <p className="piece-body__cut-line">
                  {cutLine}
                  <span aria-hidden="true" className="piece-body__cut-mark" />
                </p>
                <div className="transmission-terminated">
                  <p className="transmission-terminated__status">
                    <span aria-hidden="true">RELAY ENDS. NO FURTHER PACKET RECEIVED. ENTRY FILED INCOMPLETE.</span>
                    <span className="sr-only">
                      The transmission cuts off here, mid-sentence. This entry was filed incomplete, and the
                      sentence is never finished.
                    </span>
                  </p>
                </div>
              </>
            )}

            {terminologiesBody !== null && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {`---\n\n${terminologiesBody}`}
              </ReactMarkdown>
            )}
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
                <p className="kicker-accent">The teller</p>
                <p className="font-display mt-1 text-base font-bold">{piece.witness.name}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                  {piece.witness.did}
                </p>
              </div>
            </aside>
          )}
        </article>

        <MarginNotes pieceSlug={piece.slug} />

        <nav className="mt-16 border-t border-line pt-8">
          {piece.kind === "printed" ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                More from the archive
              </p>
              <ul className="mt-4 divide-y divide-line">
                {printedPieces
                  .filter((p) => p.slug !== piece.slug)
                  .map((p) => (
                    <li key={p.slug}>
                      <Link to="/read/$slug" params={{ slug: p.slug }} className="group flex items-baseline justify-between gap-4 py-3">
                        <span className="font-display text-base font-bold transition group-hover:text-accent">{p.title}</span>
                        <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
                          {p.year ? `'${p.year.slice(2)} · ` : ""}{p.words.toLocaleString()}w
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <>
              <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                More from {anthology.seasons.find((s) => s.n === piece.season)?.title}
              </p>
              <ul className="mt-4 divide-y divide-line">
                {entriesOfSeason(piece.season)
                  .filter((e) => e.slug !== piece.slug)
                  .map((e) => (
                    <li key={e.slug}>
                      <Link to="/read/$slug" params={{ slug: e.slug }} className="group flex items-baseline justify-between gap-4 py-3">
                        <span className="font-display text-base font-bold transition group-hover:text-accent">{e.title}</span>
                        {/* Each row wears its OWN season's short form, not
                            this page's: #12, p.30, p.7 ✕, kept. */}
                        <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
                          {entryTheme(e).short}
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
    </DeferredPlayRoom>
  );
}

// The transmission chrome, and only for season one. A restrained telex stamp
// ahead of the transcript, not a sci-fi HUD: which entry, where it sits in
// the ten he filed, which system it came from, and that the signal actually
// arrived. `entry.idx` is already the Directory's own 1-based filing order
// for the season, so it doubles as the position without a second lookup.
function RelayHeader({ entry }: { entry: AnthologyEntry }) {
  const total = entriesOfSeason(1).length;
  const line = [
    `ENTRY №${entry.entry}`,
    `POSITION ${entry.idx} OF ${total}`,
    entry.system ? `${entry.system.toUpperCase()} SYSTEM` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relay-header">
      <p>RELAY · GALACTIC DIRECTORY</p>
      <p>{line}</p>
      <p>STATUS · RECEIVED</p>
    </div>
  );
}

// The withdrawal, in place of RelayHeader's arrival. Season 3 numbers by the
// same page-of-91 scheme season 2 established (entry.page), so no new
// numbering is invented here — only the verb changes, from filed to
// withdrawn. Piece 14 withdraws nothing; it is the one page kept, so it
// gets the bible's own line for that instead of a "page 0 withdrawn" that
// would otherwise fall out of the general case.
function WithdrawnMarker({ entry }: { entry: AnthologyEntry }) {
  const line = entry.kindling === KINDLING_FINALE ? "one page kept" : `page ${entry.page} withdrawn`;
  return <p className="withdrawn-marker">&gt; Kindling · {line}</p>;
}
