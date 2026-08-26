import { Children, cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { pieceBySlug, printedPieces } from "../data/archiveText.ts";
import type { PrintedPiece } from "../data/archiveText.ts";
import { anthology, entriesOfSeason, entryBySlug, unfiledBySlug, siblingBySlug, type UnfiledPiece, type SiblingEntry, type SiblingSeries } from "../data/anthology.ts";
import type { AnthologyEntry } from "../data/anthology.ts";
import { registerLines, tellersOf } from "../data/crossnav.ts";
import type { AnthologySearch, RegisterLine } from "../data/crossnav.ts";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { splitDocket } from "../lib/docket.ts";
import { Rendering } from "../Rendering.tsx";
import { describes, endsMidSentence, storyOf } from "../lib/describes.ts";
import { entryTheme, type EntryTheme } from "../lib/seasonTheme.ts";
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
/**
 * The three things this route can render.
 *
 * "unfiled" is fiction in this universe with no season, no series and no
 * designation. It is deliberately NOT an AnthologyEntry: four seasons and
 * forty-eight entries are printed on four pages and asserted by guards on both
 * sides of the registry hop, and an unfiled piece is not one of the
 * forty-eight. It is also deliberately not a PrintedPiece, because that type
 * carries an era, a magazine page and a print word count, and filing a 2026
 * piece under those would claim a provenance it does not have.
 */
type ReadView =
  | ({ kind: "printed" } & PrintedPiece)
  | ({ kind: "anthology" } & AnthologyEntry)
  | ({ kind: "unfiled" } & UnfiledPiece)
  | ({ kind: "sibling"; series: SiblingSeries } & SiblingEntry);

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

/**
 * The lib rules, narrowed to what this route may apply them to.
 *
 * The mid-sentence treatment is for ANTHOLOGY ENTRIES ONLY, and that condition
 * used to be folded inside endsMidSentence itself. Moving the rule to lib/ for
 * the feed to share meant the condition had to come back out and be stated
 * here, or a printed piece whose last line happens to end without punctuation
 * would start rendering a cut mark and a RELAY ENDS banner.
 */
const cutsOff = (v: ReadView): boolean => v.kind === "anthology" && endsMidSentence(v.body);
const describesView = (v: ReadView): string | null =>
  cutsOff(v) ? describes(v) : v.blurb.trim() || null;

// storyOf / endsMidSentence / describes now live in ../lib/describes.ts, with
// one implementation and two callers: this page's meta tags and the anthology
// feed generator. They were written here, and a second copy in the feed is
// exactly how this repo already shipped a guard that stayed green against a
// reintroduced defect. See that file's header.

export const Route = createFileRoute("/read/$slug")({
  loader: ({ params }): ReadView => {
    // archiveText is the older, printed set, so it resolves first — a slug
    // that somehow existed in both would always mean "this ran on paper."
    const printed = pieceBySlug(params.slug);
    if (printed) return { kind: "printed", ...printed };
    const entry = entryBySlug(params.slug);
    if (entry) return { kind: "anthology", ...entry };
    const loose = unfiledBySlug(params.slug);
    if (loose) return { kind: "unfiled", ...loose };
    const sib = siblingBySlug(params.slug);
    if (sib) return { kind: "sibling", series: sib.series, ...sib.entry };
    throw notFound();
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    // One call, two tags, so description and og:description cannot drift into
    // disagreeing about what this page is willing to say it ends with.
    const description = describesView(loaderData);
    return {
      meta: [
        { title: `${loaderData.title} — Siddharth Pandalai` },
        ...(description
          ? [
              { name: "description", content: description },
              { property: "og:description", content: description },
            ]
          : []),
        { property: "og:title", content: loaderData.title },
        { property: "og:type", content: "article" },
      ],
    };
  },
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
  // storyOf() splits at the first "\n\n---\n\n", which in the four seasons is
  // the Terminologies foot and nowhere else. A SIBLING SERIES does not share
  // that convention: the Dark Directory's medium is a retrieval file and its
  // rule is a document boundary, so its first horizontal rule sits two lines in
  // and every piece rendered as its header line alone, 46 characters of a two
  // thousand word entry, with no error anywhere. Caught by counting words on
  // the rendered page, not by a test.
  //
  // The split is a fact about the parent's format, so it is applied only to the
  // parent's records. `dividerIndex` above already guards this way; this line
  // did not.
  const storyBody = piece.kind === "anthology" ? storyOf(piece.body) : piece.body;
  const terminologiesBody = dividerIndex >= 0 ? piece.body.slice(dividerIndex + TERMINOLOGIES_DIVIDER.length) : null;
  // The docket comes off the story before anything else measures it, so the
  // cut-line arithmetic below and the markdown pass both see the prose alone.
  // storyOf() is deliberately NOT changed: it feeds describes() and the
  // meta-tag fingerprint, which are about what this page is willing to say a
  // piece contains, and that question is unaffected by where the line is set.
  const { docket, rest: proseBody } = piece.kind === "anthology" ? splitDocket(storyBody) : { docket: null, rest: storyBody };
  const trimmedStory = proseBody.trim();
  const cutMidSentence = cutsOff(piece);
  // The cut line renders outside ReactMarkdown, as its own paragraph, rather
  // than wrapping the whole story in an extra element to hang a CSS hook
  // off — that wrapper would sit between .piece-body and every other
  // paragraph and quietly break the Terminologies block's :last-of-type
  // selector further down in this file, for every entry, not just this one.
  const lastParagraphBreak = cutMidSentence ? trimmedStory.lastIndexOf("\n\n") : -1;
  const storyBeforeCut = lastParagraphBreak >= 0 ? trimmedStory.slice(0, lastParagraphBreak) : proseBody;
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
    // A GFM table is the Directory's own paperwork inside the prose, and on
    // three pages the table IS the entry. It gets its own scroll box because
    // the page root sets `overflow-x: hidden`: a wide table on a 390px phone
    // was not scrolling, it was being CLIPPED, and page thirty's whole point
    // is a Difference column that climbs — the column at the far right, the
    // first thing a hidden overflow eats. tabIndex makes the box reachable by
    // keyboard, which is required the moment a region scrolls; the sitewide
    // :focus-visible rule already draws the ring.
    table: ({ children }) => (
      <div className="piece-table" tabIndex={0} role="region" aria-label="Table">
        <table>{children}</table>
      </div>
    ),
    // The asides. Eight paragraphs across the corpus open "[Page Fact-" or
    // "[Fun Fact" and the bible calls them a second, smaller sheet: he is
    // stepping out of the report to tell you something he could not file. They
    // are the only rhythm the prose itself contains, and the page was setting
    // them as more prose. Indent and a hair smaller — the colour does NOT
    // change, because a fact he wanted you to have is not small print.
    // Detected on the paragraph's own opening text, so a piece that grows a
    // ninth needs no edit here. Two more are mid-sentence rather than their own
    // paragraph and correctly stay inline: an aside inside a sentence is a
    // sentence.
    p: ({ children }) => {
      const isAside = /^\[(Page|Fun) Fact/.test(nodeText(children).trimStart());
      return isAside ? <p className="piece-aside">{children}</p> : <p>{children}</p>;
    },
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

  // Every teller of this record, not the first one that matched. The generated
  // `witness` field is singular because the generator ran .find(), which kept
  // the first and dropped the rest on the two pages that have two, so the
  // reading page asserted a false thing about its own subject. tellersOf
  // filters the roster instead, so those two come out right the moment the
  // registry upstream is regenerated, with no edit here.
  const tellers = piece.kind === "anthology" ? tellersOf(piece) : [];

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
          ) : piece.kind === "sibling" ? (
            <p className="kicker-accent">
              {piece.series.title} · Request {String(piece.idx).padStart(2, "0")}
            </p>
          ) : piece.kind === "unfiled" ? (
            // An unfiled piece has no season, no world and no counting scheme,
            // so there is nothing here to format but the designation its own
            // frontmatter carries. Printed, never resolved: the corpus uses
            // square brackets for a value a form requires and nobody has filled
            // in, so "[unassigned]" IS the answer. This branch is explicit
            // rather than folded into the one below, because "not printed" used
            // to mean "anthology" here and tsc caught it the moment it stopped
            // being true.
            <p className="kicker-accent">{piece.series}</p>
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
          {piece.kind === "sibling" && piece.plate && (
            <img
              src={piece.plate}
              alt=""
              width={600}
              height={780}
              loading="lazy"
              className="mt-8 h-auto w-full rounded-xl border border-line"
            />
          )}

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

          {/* The instrument, between the byline and the prose. Anthology only:
              the printed pieces ran in a magazine and were never transmitted,
              rendered or posted, so there is no in-world channel to play them
              through and inventing one would be the fifth medium nobody
              designed. See src/lib/rendering.ts. */}
          {piece.kind === "anthology" && (
            <Rendering body={piece.body} season={piece.season} kindling={piece.kindling} />
          )}

          <div className={`piece-body mt-10${theme?.body ? ` ${theme.body}` : ""}`}>
            {/* The entry's own first line, set as the masthead of its medium.
                Which of the four is seasonTheme's call, not this page's, and
                the words are always the correspondent's — the site no longer
                invents a line, and no longer prints his twice. */}
            {docket && theme && <Docket docket={theme.docket} line={docket} />}
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
              {cutMidSentence ? storyBeforeCut : proseBody}
            </ReactMarkdown>

            {/* Entry #2300 stops mid-sentence and is filed that way on
                purpose — the fiction never gets to finish it, so this never
                completes the sentence for it. The last line is pulled out of
                ReactMarkdown and rendered by hand so the cut mark can sit
                right against the real last word; the status line under it is
                the Directory's own sign-off for a transmission that didn't
                arrive, in the same institutional register as the relay docket. */}
            {cutMidSentence && cutLine && (
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

            {/* The apparatus. Already its own render pass; what it never had
                was its own container, so it was styled by
                `.piece-body ul:last-of-type` — a selector that can only see a
                LIST. Twenty-three feet in the corpus are bulleted and it found
                those. Twelve are authored as paragraphs and it could not, so
                they rendered at full body size: ten of season four's fourteen
                Notice-conditions blocks, statutory small print impersonating
                the story, including the finale, whose whole design turns on a
                reader noticing 397 against a threshold of 400 in exactly that
                block. Nobody authored that. A wrapper sees all forty-eight
                regardless of what the markdown underneath happens to be. */}
            {terminologiesBody !== null && (
              <div className="piece-apparatus">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {`---\n\n${terminologiesBody}`}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* The reason the story exists, framed as an aside rather than
              folded into the prose above — this is a person the correspondent
              met, not a character in the legend he filed.

              One landmark, however many tellers. Two asides both labelled "The
              teller" would be two complementary landmarks with the same
              accessible name, which is the axe landmark-unique rule, so the
              cards go inside one aside rather than one aside going round each
              card. */}
          {tellers.length > 0 && (
            <aside aria-label={tellers.length > 1 ? "The tellers" : "The teller"} className="mt-10 space-y-4">
              {tellers.map((w) => (
                <div key={w.id} className="flex gap-4 rounded-xl border border-line bg-void/40 p-4">
                  <img
                    src={w.art}
                    alt={`${w.name}. ${w.did}`}
                    loading="lazy"
                    width={1100}
                    height={600}
                    className="h-24 w-40 shrink-0 rounded-lg object-cover"
                  />
                  <div>
                    <p className="kicker-accent">The teller</p>
                    {/* The record to its teller's slot on the roll. The name
                        becomes the link and nothing else changes: no extra
                        row, no chevron, no card. The portrait stays outside
                        the anchor so the accessible name is the name rather
                        than the whole caption. */}
                    <p className="font-display mt-1 text-base font-bold">
                      <a
                        href={anthologyHref({ search: { layer: "tellers" }, hash: `teller-${w.id}` })}
                        className="text-accent underline-offset-2 hover:underline focus-visible:underline"
                      >
                        {w.name}
                      </a>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                      {w.did}
                    </p>
                  </div>
                </div>
              ))}
            </aside>
          )}

          {/* What later happened to this record. Last thing inside the
              article, after the teller, before the season list, and OUTSIDE
              .piece-body on purpose, see DamageRegister. */}
          {piece.kind === "anthology" && <DamageRegister entry={piece} />}
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
          ) : piece.kind === "sibling" ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                More from {piece.series.title}
              </p>
              <ul className="mt-4 divide-y divide-line">
                {piece.series.entries
                  .filter((e) => e.slug !== piece.slug)
                  .map((e) => (
                    <li key={e.slug}>
                      <Link to="/read/$slug" params={{ slug: e.slug }} className="group flex items-baseline justify-between gap-4 py-3">
                        <span className="font-display text-base font-bold transition group-hover:text-accent">{e.title}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--color-muted)" }}>
                          {String(e.idx).padStart(2, "0")}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </>
          ) : piece.kind === "unfiled" ? (
            // No season to offer "more from", and no sibling list either: this
            // lane holds one piece and a "more from Unfiled" heading over a
            // grid of one would be a widget describing its own emptiness. The
            // door back to the collection is the pill above the prose; the only
            // honest thing to add here is nothing.
            null
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

/**
 * The entry's first line, set as the masthead of the medium it names.
 *
 * The words are never this component's. They are the line the correspondent
 * wrote, handed in by splitDocket, and every branch below only decides how it
 * is set. That is the whole change: two of the four seasons are fixed by
 * DELETION, and the season with the loudest medium is the only one that gains
 * anything.
 *
 * relay      Season one arrived. The stamp around the line stays, because
 *            arrival IS the season's medium claim, but the site's own
 *            POSITION n OF 10 is gone: it was the site's count of what shipped
 *            printed directly above the Directory's own "Series 7 of 16", two
 *            registers disagreeing on one screen, and only one of them is
 *            canon.
 * folio      Season two was never sent, so nothing institutional may frame it.
 *            No border, no mono, no caps: a page number in the reading serif,
 *            because that is what it is. This is the season the old blockquote
 *            style hurt most — a bordered mono quote box around a number a man
 *            wrote on his own paper and transmitted to nobody.
 * withdrawn  Season three's line, once. WithdrawnMarker used to print this
 *            exact string above a body that already carried it, on all
 *            fourteen pages.
 * posted     Season four is signage, and the s4 bible gives signage right of
 *            way. The district gets one step up in scale and into
 *            --color-coverage (9.71:1 on the ink ground, measured, not
 *            inherited from a comment); the clearance term stays small print,
 *            because the term is the thing the piece is quietly counting. The
 *            district is hard-capped below the h1: a notice is posted under a
 *            title, never over it.
 */
function Docket({ docket, line }: { docket: EntryTheme["docket"]; line: string }) {
  if (docket === "relay") {
    return (
      <div className="piece-docket piece-docket--relay">
        <p>RELAY · GALACTIC DIRECTORY</p>
        <p>{line}</p>
        <p>STATUS · RECEIVED</p>
      </div>
    );
  }
  if (docket === "posted") {
    // "Posted · THE RETURNS HALL · cleared in 12 ticks". Split on the
    // separator the entries themselves use; anything that does not come apart
    // into three falls through to one flat line rather than guessing, so a
    // fifteenth notice with a different shape degrades instead of breaking.
    const parts = line.split(" · ");
    if (parts.length === 3) {
      return (
        <div className="piece-docket piece-docket--posted">
          <p className="piece-docket__district">{parts[1]}</p>
          <p>
            {parts[0]} · {parts[2]}
          </p>
        </div>
      );
    }
  }
  return <p className={`piece-docket piece-docket--${docket}`}>{line}</p>;
}

// /anthology keeps its layer in useState today, so a typed <Link search={...}>
// has nothing to validate against and would not compile. The URL is the same
// string either way, and it is the URL the register is actually promising.
// ponytail: swap both call sites for <Link to="/anthology" search hash> the day
// that route grows validateSearch, and delete this.
function anthologyHref(to: { search: AnthologySearch; hash?: string }): string {
  const q = new URLSearchParams();
  if (to.search.layer) q.set("layer", to.search.layer);
  if (to.search.world) q.set("world", to.search.world);
  if (to.search.at !== undefined) q.set("at", String(to.search.at));
  return `/anthology?${q.toString()}${to.hash ? `#${to.hash}` : ""}`;
}

// One fact from the register, as an anchor or as flat text.
//
// `to === null` is Law A made structural: it renders the label with no element
// round it at all, not a disabled link and not a styled span, so there is
// nothing for a later hover state, a crawler or a well-meaning refactor to turn
// back into an anchor. Every Season Three fate arrives here null. An anchor
// from the ash back to the intact page would refund the fire.
function RegisterFact({ line }: { line: RegisterLine }) {
  if (line.to === null) return <>{line.label}</>;
  // An empty lead means the fate IS the destination, so the whole line is the
  // anchor and has no sibling text to be told apart from: it may hold its
  // underline back until hover, which is what the ruling asks for. A number
  // sitting inside a sentence is a link in a text block and carries its
  // underline permanently. See index.css for the ratio that forces that.
  const cls = line.lead ? "notice-conditions__link--inline" : "notice-conditions__link";
  return line.to.kind === "read" ? (
    <Link to="/read/$slug" params={{ slug: line.to.slug }} className={cls}>
      {line.label}
    </Link>
  ) : (
    <a href={anthologyHref(line.to)} className={cls}>
      {line.label}
    </a>
  );
}

/**
 * The Damage Register: what later happened to this record, and nothing else.
 *
 * It composes nothing. `registerLines` walks a fixed four-kind order and asks
 * each kind once, so the cap and the order are arithmetic in the data layer and
 * this component physically cannot exceed them or reorder them. That is the
 * whole reason the join lives over there: a footer that could assemble its own
 * lines is a related-links box that has not been written yet.
 *
 * It sits inside <article> but OUTSIDE .piece-body, which is load-bearing
 * twice. No scraper ingests it as prose, and it stays clear of
 * `.piece-body ul:last-of-type`, the selector that styles the Terminologies
 * block. A <footer> scoped to an article is not a contentinfo landmark, so it
 * does not collide with SiteFooter.
 *
 * Nothing renders when nothing is true. Nine of the ten Season One pages carry
 * no register at all, and neither terminal page carries one: #2300 ends at
 * ENTRY FILED INCOMPLETE and the kept page ends at blank paper, and small print
 * annotating blank paper is the site talking over the one undamaged object in
 * the season. There is no "none recorded" placeholder, because absence is the
 * tell and Season Two's chrome: "none" is already that doctrine.
 */
function DamageRegister({ entry }: { entry: AnthologyEntry }) {
  const lines = registerLines(entry);
  if (lines.length === 0) return null;

  return (
    <footer className="notice-conditions">
      {/* Literal caps in the DOM rather than text-transform, matching
          the relay docket's own stamp two functions up. Not a heading: this is a
          label on a filing block, and giving it an <h*> would put it in the
          document outline as a section of the story. */}
      <p className="notice-conditions__kicker">NOTICE-CONDITIONS</p>
      {lines.map((line) => (
        <p key={line.kind} className="notice-conditions__line">
          {line.lead}
          <RegisterFact line={line} />
        </p>
      ))}
    </footer>
  );
}
