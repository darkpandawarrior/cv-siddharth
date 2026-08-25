import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { WorldSwitch } from "../WorldSwitch.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { Reveal } from "../Reveal.tsx";
import { Picture } from "../Picture.tsx";
import { ChapterWord, GiantCTA } from "../Editorial.tsx";
import { anthology } from "../data/anthology.ts";
import {
  AFTERLIVES_NOTE,
  CANON_SOURCES,
  CANON_SOURCE_BASE,
  COUNT_LEDGER,
  MILGALAXAL_NOTE,
  NAMED_THIRTEEN,
  OUTSIDE_THE_FICTION,
  RENDERINGS,
  RENDERING_DOCTRINE,
  RIG_CONSTRAINTS,
  RIG_CONSTRAINTS_NOTE,
  SEASON_CANON,
  STANDARD_INTERVALS,
  TETHER,
  TETHER_DOCTRINE,
} from "../data/canonLore.ts";

/**
 * /canon, the reference the fiction keeps about itself.
 *
 * This used to be a fourth tab on /anthology holding one paragraph, seven
 * one-line glosses and a table. A tab has no URL, so it could not be linked,
 * shared, bookmarked or returned to after a reload, and the strongest material
 * in the project (the Rendering doctrine) was on disk and on no page anywhere.
 *
 * The section order is an argument, not a list. The reader arrives knowing
 * nothing, is handed the one fact all 34 entries assume they already have, is
 * then told the fact that reframes every image on the site, and is only then
 * offered the parts that spoil.
 *
 * DATA vs PRESENTATION. Every fact is in `src/data/canonLore.ts`. This file
 * holds layout only, and it never compares a season number to a literal: the
 * open/gated partition reads `spoils`, so a fourth season picks its own side of
 * the line by writing one field.
 *
 * COLOUR. Everything below is an existing ink-world token, and each one states
 * its measured ratio against the ground it sits on at the point of use, because
 * lighthouserc.json asserts accessibility 1.00 on this kind of page and a badge
 * once shipped here at 1.4:1 because it was styled by eye. Card grounds are
 * bg-void/40 over the ink ground, which computes to #0e0d0a.
 *
 * MOTION. Nothing new moves. Reveal, ChapterWord and GiantCTA each carry their
 * own prefers-reduced-motion rule in index.css already.
 */
export const Route = createFileRoute("/canon")({
  head: () => roomHead("/canon"),
  component: CanonRoute,
});

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * The ghost ordinal behind a law card.
 *
 * SVG, not a styled span, and the reason is written down one component over:
 * Editorial's ChapterWord docstring records that a giant near-ink word rendered
 * as DOM text is flagged serious/color-contrast by axe "and it deserves to be,
 * because an automated check can't tell decorative type from content", while as
 * an SVG graphic it is classified as what it actually is. This route is meant
 * to hold accessibility at 1.00, so that is the difference between shipping and
 * not.
 *
 * Fill goes through var(--color-accent) rather than a hardcoded hex so the
 * numeral follows whatever ground it is dropped on. At 13% it is a watermark,
 * which is why it must not be text.
 */
function GhostNumeral({ n }: { n: number }) {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-0 h-20 w-20"
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
    >
      <text
        x="62"
        y="52"
        textAnchor="end"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 54,
          fontWeight: 700,
          fill: "var(--color-accent)",
          fillOpacity: 0.13,
        }}
      >
        {ROMAN[n] ?? String(n)}
      </text>
    </svg>
  );
}

/**
 * Tveggi's scratch from Entry #2250, used as the seam between sections exactly
 * as /read/$slug uses it. The thing dividing the parts of a story is the object
 * that made writing possible in the first place. Build-time SVG from our own
 * repo, never user input.
 */
function Mark() {
  return (
    <div
      aria-hidden
      className="mx-auto my-14 h-14 w-5 text-accent/70"
      dangerouslySetInnerHTML={{ __html: anthology.mark }}
    />
  );
}

/** One season's doctrine body, shared by the open blocks and the gated ones. */
function SeasonBody({ thesis, points }: { thesis: string; points: { term: string; gloss: string }[] }) {
  return (
    <>
      {/* --color-text on the card ground: 15.8:1. */}
      <p className="mt-3 max-w-3xl leading-relaxed" style={{ color: "var(--color-text)" }}>
        {thesis}
      </p>
      <dl className="mt-5 space-y-4">
        {points.map((p) => (
          <div key={p.term}>
            {/* --color-accent on the card ground: 8.6:1. */}
            <dt className="font-mono text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
              {p.term}
            </dt>
            {/* --color-text-dim (#a4978a) on the card ground: 6.8:1. */}
            <dd className="mt-1 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              {p.gloss}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function CanonRoute() {
  // The whole of the season logic, and the whole of the spoiler design. A
  // season with no doctrine written yet drops out rather than rendering an
  // empty shell; the rest sort themselves by what they admit to giving away.
  const blocks = anthology.seasons
    .map((s) => ({ season: s, canon: SEASON_CANON[s.n] }))
    .filter((b): b is { season: (typeof anthology.seasons)[number]; canon: NonNullable<typeof b.canon> } =>
      Boolean(b.canon),
    );
  const open = blocks.filter((b) => b.canon.spoils === null);
  const gated = blocks.filter((b) => b.canon.spoils !== null);

  // Laws from a season whose doctrine is gated stay inside that gated block. A
  // season four that adds a law AND declares what it spoils must not have that
  // law leak into the open grid above the divider, because a law's own name can
  // be the spoiler. This is the one non-obvious line in the file.
  const openLaws = open.flatMap((b) => b.canon.laws ?? []);

  return (
    <div className="ink-world min-h-screen">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/anthology"
            className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent"
          >
            <ArrowLeft size={16} /> The Morkinstar Journals
          </Link>
          <WorldSwitch current="ink" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="section-y mx-auto max-w-5xl px-6">
          {/* ---- 0. Masthead ------------------------------------------- */}
          <Reveal>
            <p className="kicker-accent">// the reference the fiction keeps about itself</p>
            <h1 className="font-display mt-3 text-hero">The Canon</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--color-text)" }}>
              The rules {anthology.title} holds itself to, the units it measures time in, and what the
              instrument that produced every picture on this site does to the people it renders.
            </p>
          </Reveal>

          {/* ---- 1. The Count ------------------------------------------
              First, because without it the rest is trivia: this is the fact
              every one of the 34 entries assumes the reader already has. Two
              up on desktop, stacked below lg. */}
          <Reveal className="mt-16">
            <section aria-labelledby="count-h">
              <h2 id="count-h" className="font-display text-2xl font-bold sm:text-3xl">
                The Count
              </h2>
              <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
                {/* The plate is a dark 600x780 Directory artefact on a warm
                    paper ground, so it reads as a document laid on a desk.
                    That is the correct relationship and it needs no filter. */}
                <figure className="card-elevated max-w-[340px] overflow-hidden rounded-2xl border border-line bg-void/40">
                  <Picture
                    src={anthology.fourteen}
                    alt="The Directory's bestiary plate: thirteen sigils in a grid of fourteen cells, the last cell empty and dashed, marked NO NAME."
                    width={600}
                    height={780}
                    className="w-full"
                  />
                </figure>

                <div>
                  <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                    Every world he has ever surveyed independently reports the same census: fourteen gods,
                    fourteen monsters. Ask anyone to list the fourteen monsters and you get thirteen names
                    and a pause. The resolution comes from one storyteller's account: thirteen of the
                    fourteen split into a god-face and a monster-face when observed from both sides at
                    once, and the one that never split keeps its single name on the god list, out of
                    gratitude, and holds an unnamed line on the monster list, because it only ever had the
                    one face to give. Twenty-eight lines. Twenty-seven names.
                  </p>

                  {/* The arithmetic as a ledger, not as prose. A reader who
                      does the subtraction unaided gets 27 against a stated 28
                      and concludes the book is broken. Two columns of short
                      strings, so no scroll container is needed here. */}
                  {/* dt and dd are direct grid children, with no wrapper. A
                      per-row <div className="contents"> would read more neatly
                      and is one un-generated utility away from collapsing the
                      whole ledger into a single column, which is precisely the
                      failure this project keeps shipping. Fragments cost
                      nothing and cannot do that. */}
                  <dl className="mt-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-y border-line py-4 font-mono text-sm">
                    {COUNT_LEDGER.map((row) => (
                      <Fragment key={row.line}>
                        {/* --color-text-dim on the ink ground: 6.7:1. */}
                        <dt style={{ color: "var(--color-text-dim)" }}>{row.line}</dt>
                        {/* --color-accent on the ink ground: 8.4:1. */}
                        <dd className="m-0 text-right" style={{ color: "var(--color-accent)" }}>
                          {row.value}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>

                  {/* The thirteen as DOM text, because the plate's names are
                      baked pixels and a raster cannot be the only channel. */}
                  <ul className="mt-5 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 font-mono text-xs">
                    {NAMED_THIRTEEN.map((n) => (
                      <li key={n} style={{ color: "var(--color-text-dim)" }}>
                        {n}
                      </li>
                    ))}
                    {/* The fourteenth slot is a real element, not a gap. The
                        blank is the subject: morkinstar-art.mjs's own comment
                        says it "is not a placeholder to fill in later".

                        Colour, measured rather than eyeballed: the obvious
                        choice, --color-danger (#c25a4a), lands at 4.49:1 on the
                        ink ground, which fails AA for normal text by a
                        hundredth and would take the 1.00 gate down. It stays as
                        the dashed border, where the 3:1 non-text floor applies
                        and 4.5:1 clears it comfortably. The text is
                        --color-accent2 (#cf8f63) at 7.0:1. */}
                    <li
                      className="rounded border border-dashed px-2"
                      style={{ borderColor: "var(--color-danger)", color: "var(--color-accent2)" }}
                    >
                      no name · XIV
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </Reveal>

          <Mark />

          {/* ---- 2. The Seven Laws --------------------------------------
              Doorways, not glosses. Each card links to the entry where the law
              actually fires, which is the thing a reference panel could never
              do. */}
          <section aria-labelledby="laws-h">
            <Reveal>
              <h2 id="laws-h" className="font-display text-2xl font-bold sm:text-3xl">
                The {openLaws.length === 7 ? "Seven" : openLaws.length} Laws
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                Every one of them is visible in the 2021 story the anthology grew out of. Nothing here was
                bolted on afterwards.
              </p>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {openLaws.map((law, i) => (
                <Reveal key={law.n} delay={(i % 3) * 80}>
                  <article className="card-elevated relative h-full overflow-hidden rounded-2xl border border-line bg-void/40 p-6">
                    <GhostNumeral n={law.n} />
                    <h3 className="font-display relative text-lg font-bold">{law.name}</h3>
                    <p
                      className="relative mt-2 text-sm leading-relaxed"
                      style={{ color: "var(--color-text-dim)" }}
                    >
                      {law.gloss}
                    </p>
                    {/* bible.md is explicit that law six is one storyteller's
                        position rather than settled canon, and the seams in this
                        anthology belong at the level of who is telling you. */}
                    {law.contested && <p className="kicker relative mt-3">{law.contested}</p>}
                    <Link
                      to="/read/$slug"
                      params={{ slug: law.seenAt.slug }}
                      className="relative mt-4 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                    >
                      {law.seenAt.label}
                    </Link>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>

          <Mark />

          {/* ---- 3. The Rendering ---------------------------------------
              The most interesting doctrine in the project and it is currently
              on no page anywhere. It reframes every image on the site, so it
              gets the most room and it is argued with plates rather than
              asserted. */}
          <section aria-labelledby="rendering-h">
            <Reveal>
              <p className="kicker-accent">// series-level doctrine</p>
              <h2 id="rendering-h" className="font-display mt-3 text-2xl font-bold sm:text-3xl">
                The Rendering
              </h2>
              <p
                className="font-display mt-6 max-w-3xl text-3xl leading-tight sm:text-4xl"
                style={{ color: "var(--color-text)" }}
              >
                {RENDERING_DOCTRINE.claim}
              </p>
              {RENDERING_DOCTRINE.mechanism.map((para) => (
                <p key={para} className="mt-5 max-w-3xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                  {para}
                </p>
              ))}
              <p
                className="font-display mt-6 max-w-3xl border-l-2 pl-5 text-xl leading-snug"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
              >
                {/* --color-accent on the ink ground: 8.4:1. */}
                {RENDERING_DOCTRINE.pull}
              </p>
            </Reveal>

            {/* The evidence. Two across on desktop, not four: the portraits
                are 1100x600 landscape, so four across a max-w-5xl page gives
                ~250px thumbnails, at which Sœlvi's hole in the paper is a
                smudge and Ossul's unresolved figure is a blur. At two across
                each plate is ~460px and both read.

                The web portraits are NOT cut out. ossul.jpg is 3-component
                baseline JPEG and ossul.webp is VP8 with no alpha channel: they
                are flattened illustrations on baked cream paper. So each gets a
                frame with the caption OUTSIDE the image, never floating on the
                ink ground and never with type over the plate. */}
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {RENDERINGS.map((r, i) => {
                const w = anthology.witnesses.find((x) => x.id === r.witnessId);
                if (!w) return null;
                return (
                  <Reveal key={r.state} delay={(i % 2) * 80}>
                    <figure className="card-elevated h-full overflow-hidden rounded-2xl border border-line bg-void/40">
                      <Picture
                        src={w.art}
                        alt={`${w.name}, rendered. ${r.note}`}
                        width={1100}
                        height={600}
                        className="w-full object-cover"
                      />
                      <figcaption className="border-t border-line p-5">
                        <span className="kicker-accent">the rig {r.state}</span>
                        <h3 className="font-display mt-2 text-lg font-bold">{w.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                          {r.note}
                        </p>
                        <Link
                          to="/read/$slug"
                          params={{ slug: r.slug }}
                          className="mt-3 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                        >
                          read the entry
                        </Link>
                      </figcaption>
                    </figure>
                  </Reveal>
                );
              })}
            </div>

            <Reveal className="mt-10">
              <dl className="grid gap-6 sm:grid-cols-3">
                {RENDERING_DOCTRINE.consequences.map((c) => (
                  <div key={c.term} className="border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
                    <dt className="font-display text-base font-bold" style={{ color: "var(--color-text)" }}>
                      {c.term}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                      {c.gloss}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* The next sentence in the bible is "Season Three is built on
                  that, and it is why burning the case is not an escape". That
                  is the ending, so it lives below the line inside season
                  three's gated block. This is the cut. */}
              <p className="mt-8 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                All ten renderings are drawn.{" "}
                <Link
                  to="/anthology"
                  className="text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                >
                  The tellers are on the anthology page
                </Link>
                .
              </p>
            </Reveal>
          </section>

          <Mark />

          {/* ---- 4. What the rig could not render away -------------------
              The counterweight. Without it the section above reads as licence
              to draw anything at all. */}
          <Reveal>
            <section aria-labelledby="constraints-h">
              <h2 id="constraints-h" className="font-display text-2xl font-bold sm:text-3xl">
                What the rig could not render away
              </h2>
              {/* Every table on this page needs its own scrolling ancestor:
                  e2e/overflow.spec.ts at 390px only accepts real containment
                  and exempts nothing here. */}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse font-mono text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                      <th className="py-2 pr-4 font-semibold">Species</th>
                      <th className="py-2 pr-4 font-semibold">World</th>
                      <th className="py-2 font-semibold">The constraint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RIG_CONSTRAINTS.map((row) => (
                      <tr key={row.species} className="border-b border-line/50 last:border-0">
                        <td className="py-2 pr-4" style={{ color: "var(--color-text)" }}>
                          {row.species}
                        </td>
                        <td className="py-2 pr-4" style={{ color: "var(--color-text-dim)" }}>
                          {row.world}
                        </td>
                        <td className="py-2" style={{ color: "var(--color-text-dim)" }}>
                          {row.constraint}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {RIG_CONSTRAINTS_NOTE}
              </p>
            </section>
          </Reveal>

          {/* ---- 5. The tether ------------------------------------------
              Three real figures, the big one first. No sparkline: AnimatedMetric
              draws a fixed ascending line that would be a trend for a thing
              with no trend. */}
          <Reveal className="mt-16">
            <section aria-labelledby="tether-h">
              <h2 id="tether-h" className="font-display text-2xl font-bold sm:text-3xl">
                The tether
              </h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-3">
                {TETHER.map((t) => (
                  <p key={t.label} className="font-display text-metric font-bold text-accent">
                    {t.value}
                    <span className="kicker mt-2 block">{t.label}</span>
                  </p>
                ))}
              </div>
              <p className="mt-6 max-w-3xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {TETHER_DOCTRINE}
              </p>
            </section>
          </Reveal>

          <Mark />

          {/* ---- 6. Standard Intervals ---------------------------------- */}
          <Reveal>
            <section aria-labelledby="intervals-h">
              <h2 id="intervals-h" className="font-display text-2xl font-bold sm:text-3xl">
                Standard Intervals
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                Section 3 of the Founding Charter. Eight named at founding, six in use.
              </p>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse font-mono text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                      <th className="py-2 pr-4 font-semibold">Interval</th>
                      <th className="py-2 pr-4 font-semibold">Realm</th>
                      <th className="py-2 font-semibold">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STANDARD_INTERVALS.map((row) => (
                      <tr key={row.interval} className="border-b border-line/50 last:border-0">
                        <td className="py-2 pr-4" style={{ color: "var(--color-text)" }}>
                          {row.interval}
                        </td>
                        <td className="py-2 pr-4" style={{ color: "var(--color-text-dim)" }}>
                          {row.realm}
                        </td>
                        {/* The two founding blanks read as blanks rather than
                            as data. --color-muted is the same #a4978a as
                            --color-text-dim in this world (6.7:1); the italic
                            is what carries the difference, so the distinction
                            does not depend on colour alone. */}
                        <td
                          className={`py-2 ${row.blank ? "italic" : ""}`}
                          style={{ color: row.blank ? "var(--color-muted)" : "var(--color-text-dim)" }}
                        >
                          {row.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                {MILGALAXAL_NOTE}
              </p>
              {/* The joke buried in an appendix, and the site has never printed
                  it. Safe above the line: it gives away what the units are
                  named after, not what happens. */}
              <p
                className="font-display mt-6 max-w-3xl border-l-2 pl-5 text-lg leading-snug"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-text)" }}
              >
                {AFTERLIVES_NOTE}
              </p>
            </section>
          </Reveal>

          {/* ---- 7. Open season doctrine (spoils === null) --------------- */}
          {open.map((b) => (
            <Reveal key={b.season.n} className="mt-16">
              <section
                aria-labelledby={`season-${b.season.n}-h`}
                className="card-elevated rounded-2xl border border-line bg-void/40 p-6"
              >
                <p className="kicker">season {b.season.n}</p>
                <h2 id={`season-${b.season.n}-h`} className="font-display mt-1 text-xl font-bold">
                  {b.season.title}
                </h2>
                <SeasonBody thesis={b.canon.thesis} points={b.canon.points} />
              </section>
            </Reveal>
          ))}
        </div>

        {/* ---- THE TURN -----------------------------------------------
            The marked line, and it renders only when there is actually
            something on the far side of it.

            THE DISCLOSURE DESIGN, and why it is this and not something else.
            A global spoiler toggle controls content four screens away from the
            switch: a reader flips it at the top, forgets by the bottom, and is
            ambushed anyway. It also turns the unspoiled page into a page of
            holes, which is worse than a page with a door in it. A hole says
            "there is something here you are not allowed". A closed door says
            "there is something here, and here is what it costs".

            So: one unmistakable divider, everything above it open, and every
            season that declares what it gives away sitting below it inside a
            native <details> that is shut on first paint, whose summary names
            the damage before the reader opens it.

            <details> rather than a JS toggle because it is keyboard operable
            and announced with no ARIA of ours, it works with JS off, it
            survives SSR with no hydration flicker, and .expander already styles
            it with a rotating caret. Zero new state, zero new component.

            The count's resolution stays OPEN on purpose. It is law six, which
            the bible itself marks as one storyteller's position rather than an
            ending; /anthology already states the mystery out loud, so a canon
            page that withheld the answer would be more coy than the page it was
            promoted out of; and the season one council's ruling for this whole
            project was "fix, do not cut, show the working". A canon page that
            withholds the canon is the reference panel again in a bigger font.

            The four states of the rig stay open too, because they are how to
            look at every plate on the site rather than something that happens.
            "The correspondent has no body" is the frame and the bible states it
            as series-level doctrine, so it is open; its CONSEQUENCE is gated. */}
        {gated.length > 0 && (
          <>
            <ChapterWord>THE TURN</ChapterWord>
            <div className="mx-auto max-w-5xl px-6">
              <p className="kicker-accent">
                Below this line the seasons explain themselves, and each one says what it gives away before
                it does.
              </p>

              {gated.map((b) => (
                <Reveal key={b.season.n} className="mt-6">
                  <details className="expander card-elevated rounded-2xl border border-line bg-void/40 p-6">
                    <summary className="cursor-pointer select-none">
                      {/* The h2 lives INSIDE the summary, so the document
                          outline stays in order whether the block is open or
                          shut. Putting it outside with a bare span in here is
                          the easy way to break heading order on this page.

                          Spans rather than <p>, and that is a content-model
                          rule not a style choice: summary takes phrasing
                          content optionally intermixed with ONE heading, so a
                          block-level <p> in here is invalid markup on the page
                          that has to score 1.00. */}
                      <span className="kicker block">season {b.season.n}</span>
                      <h2 className="font-display mt-1 text-xl font-bold">{b.season.title}</h2>
                      <span className="kicker mt-1 block">this gives away {b.canon.spoils}</span>
                    </summary>
                    <SeasonBody thesis={b.canon.thesis} points={b.canon.points} />
                  </details>
                </Reveal>
              ))}
            </div>
          </>
        )}

        {/* Sources and the exit sit OUTSIDE the gated branch on purpose. A
            season four that declares no spoiler would otherwise take the
            receipt and the way out down with the divider. */}
        <div className="mx-auto max-w-5xl px-6 pb-24">
          {/* ---- 9. Sources -------------------------------------- */}
          <Reveal className="mt-16">
            <section aria-labelledby="sources-h">
              <h2 id="sources-h" className="font-display text-2xl font-bold sm:text-3xl">
                Sources
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                Nothing above is asserted without one. The bibles and the council records this page was
                drawn from are public, and the note is printed rather than hidden in a tooltip.
              </p>
              <ul className="mt-6 space-y-3">
                {CANON_SOURCES.map((s) => (
                  <li key={s.file} className="text-sm">
                    <a
                      href={`${CANON_SOURCE_BASE}${s.file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                    >
                      {s.file}
                    </a>
                    <span style={{ color: "var(--color-text-dim)" }}> {s.note}</span>
                  </li>
                ))}
              </ul>

              {/* The only sentences on the page spoken from outside the
                  fiction, labelled as such, at the very foot, under everything
                  else. This is a portfolio, so the process is part of the
                  claim, but breaking frame is expensive on the one page whose
                  job is to hold it. */}
              <div className="mt-10 border-t pt-5" style={{ borderColor: "var(--color-line)" }}>
                <p className="kicker">outside the fiction</p>
                {OUTSIDE_THE_FICTION.map((line) => (
                  <p
                    key={line}
                    className="mt-3 max-w-3xl text-sm leading-relaxed"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </section>
          </Reveal>

          <div className="mt-16">
            {/* GiantCTA takes a plain href, so this is a full navigation rather
                than a client transition. Acceptable for the one exit at the
                foot of the page, and the page's exit is also its point: the
                canon only means anything inside a story. */}
            <GiantCTA
              label="Read the first entry"
              href="/read/legend-of-koaeluae-scales"
              sub="Journal Entry #2245. Exxobar. Snow."
            />
          </div>
        </div>
      </main>

      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
