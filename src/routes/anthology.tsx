import { Suspense, lazy, useCallback, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { WorldSwitch } from "../WorldSwitch.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { Reveal } from "../Reveal.tsx";
import { TiltCard } from "../TiltCard.tsx";
import { Picture } from "../Picture.tsx";
import { anthology, anthologyEntries, entriesOfSeason } from "../data/anthology.ts";
import type { AnthologyEntry, AnthologyWitness } from "../data/anthology.ts";
import { entryTheme, seasonHero } from "../lib/seasonTheme.ts";
import type { ThemeVars } from "../lib/seasonTheme.ts";
import { ReactionRow } from "../play/ReactionRow.tsx";

import { DeferredPlayRoom } from "../play/DeferredPlayRoom.tsx";
// Starmap.tsx is a named export, not a default one — the plain object shape
// React.lazy() requires is built here rather than by changing that file's
// export style for the convenience of one caller.
const Starmap = lazy(() => import("../Starmap.tsx").then((m) => ({ default: m.Starmap })));

/**
 * The Morkinstar Journals — the anthology hub, one room deeper than /ink.
 *
 * The first season files a legend for every world it visits and numbers each
 * entry. Every season after it drops something the one before took for
 * granted, so the counting scheme belongs to the season rather than to the
 * anthology, and this file asks which season a card is from before it can say
 * what number to print on it. Same skin, same route, deliberately different
 * objects: the filing season's cards are flat and sharp-cornered, the later
 * ones tilt and glow and sit very slightly askew, the way loose paper does on
 * a desk.
 * The starmap is the third way to arrive at a story — geography instead of a
 * table of contents — and it is the one thing on this page heavy enough to
 * need its own lazy chunk.
 */
export const Route = createFileRoute("/anthology")({
  head: () => roomHead("/anthology"),
  component: AnthologyRoute,
});

type Tab = number | "starmap" | "tellers";

function AnthologyRoute() {
  const [tab, setTab] = useState<Tab>(1);

  return (
    <DeferredPlayRoom>
      <div className="ink-world min-h-screen">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <Link to="/ink" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
              <ArrowLeft size={16} /> The Ink
            </Link>
            <WorldSwitch current="ink" />
          </nav>
        </header>

        <main id="main-content" tabIndex={-1}>
          <div className="section-y mx-auto max-w-5xl px-6">
            {/* Derived. "twenty entries, two seasons" had been wrong since
                Season Three shipped, and /ink one route over already had the
                same sentence drift the same way. The word is "pieces" for the
                same reason it is there: season two and three records carry
                entry 0, because they are pages and kindling, not Directory
                entries. */}
            <p className="kicker-accent">
              // {anthologyEntries.length} pieces, {anthology.seasons.length} seasons
            </p>
            <h1 className="font-display mt-3 text-hero">{anthology.title}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--color-text)" }}>
              {anthology.tagline}
            </p>
            {/* Three sentences, the whole premise: a correspondent, a recurring
                census he cannot explain, and the one figure that never adds up. */}
            <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              A correspondent visits worlds that cannot yet leave them, and writes down the story each one
              tells about its own weather. Every world he has ever surveyed independently reports fourteen
              gods and fourteen monsters, the same count, worlds apart, with no contact between them. Nobody,
              on any of them, can name the fourteenth.
            </p>

            <div role="group" aria-label="Choose a season" className="mt-10 flex flex-wrap gap-2">
              {anthology.seasons.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setTab(s.n)}
                  aria-pressed={tab === s.n}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    tab === s.n
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                  }`}
                >
                  {s.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTab("starmap")}
                aria-pressed={tab === "starmap"}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  tab === "starmap"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                }`}
              >
                The Starmap
              </button>
              <button
                type="button"
                onClick={() => setTab("tellers")}
                aria-pressed={tab === "tellers"}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  tab === "tellers"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                }`}
              >
                The Tellers
              </button>
              {/* The canon panel outgrew a tab. It is a reference a reader
                  arrives at, links someone else to, and comes back to, which
                  is a URL's job and not a useState's, so it lives at /canon
                  now. Same pill as the tabs beside it because it still
                  belongs to this row, but it is an anchor, because it
                  navigates. It never carries the pressed state: it is not one
                  of the things this row is choosing between any more. */}
              <Link
                to="/canon"
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-accent/40 hover:text-zinc-200"
              >
                The Canon
              </Link>
            </div>

            {anthology.seasons.map((s) =>
              tab === s.n ? (
                <div key={s.n}>
                  <p className="mt-6 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                    {s.blurb}
                  </p>
                  <SeasonHeroFigure season={s.n} />
                  <SeasonGrid season={s.n} />
                </div>
              ) : null,
            )}

            {tab === "starmap" && <StarmapTab />}
            {tab === "tellers" && <TellersTab />}
          </div>
        </main>
        <SiteFooter />
        <FloatingChat />
      </div>
  </DeferredPlayRoom>
  );
}

function SeasonGrid({ season }: { season: number }) {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {entriesOfSeason(season).map((e, i) => (
        <EntryCard key={e.slug} entry={e} index={i} />
      ))}
    </div>
  );
}

// This component no longer knows what a season is, and that is the repair.
// There is no season number in here, no 91, no entry-versus-page branch: it
// asks seasonTheme.ts what this particular entry looks like and renders that.
// A fourth season arrives by adding one row to the table over there.
function EntryCard({ entry: e, index }: { entry: AnthologyEntry; index: number }) {
  const t = entryTheme(e);
  // Alternating the sign is what reads as handled paper rather than as a
  // consistent skew applied by a stylesheet. 0 degrees disables it outright,
  // which is season one and the one page he keeps: neither is loose paper.
  const rot = t.tiltDeg ? (index % 2 === 0 ? -t.tiltDeg : t.tiltDeg) : 0;

  const card = (
    // The border and group-hover live on this wrapper, not the Link, so the
    // reaction row below can sit inside the same card without nesting a
    // <button> inside an <a> — invalid HTML, and it would fire the Link's
    // navigation on every reaction click.
    //
    // t.vars is scoped token overrides, not decoration: season three swaps
    // --color-accent to ember and the kept page swaps the whole palette to
    // paper, and because every child below reads the same var() names, none
    // of them need to know that happened.
    <div
      className={`card-elevated group flex h-full flex-col overflow-hidden border bg-card transition ${t.card}`}
      style={{ ...t.vars, ...(rot ? { transform: `rotate(${rot}deg)` } : null) } as ThemeVars}
    >
      <Link to="/read/$slug" params={{ slug: e.slug }} className="flex flex-1 flex-col">
        {e.plate ? (
          <Picture
            src={e.plate}
            alt=""
            loading="lazy"
            className={`w-full object-cover ${t.plate}`}
            style={{ aspectRatio: "600 / 780" }}
          />
        ) : (
          // The generator marks a plate "" when the fetch failed rather than
          // silently reusing a stale image — this is that state rendered, not
          // an <img> pointed at an empty src.
          <div
            className="kicker flex items-center justify-center bg-void/40"
            style={{ aspectRatio: "600 / 780" }}
          >
            plate lost
          </div>
        )}
        <div className="flex flex-1 flex-col p-4">
          <span className={`font-mono text-[11px] uppercase tracking-widest ${t.kicker}`}>
            {t.label}
          </span>
          {/* h2, not h3. These cards sit directly under the page's h1 with no
              grouping heading between them, so h3 skipped a level, which
              Lighthouse scores as a real failure and lighthouserc.json asserts
              accessibility at 1.00 with /anthology in its list. The e2e axe
              pass misses it because heading-order is moderate and that suite
              fails only on serious and critical. */}
          <h2 className="font-display mt-2 text-lg font-bold leading-snug transition group-hover:text-accent">{e.title}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-dim)" }}>
            {e.planet}
            {e.system ? ` · ${e.system}` : ""}
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
            {e.blurb}
          </p>
        </div>
      </Link>
      <div className="border-t border-line px-4 py-2">
        <ReactionRow surface="anthology" itemId={e.slug} />
      </div>
    </div>
  );

  return <Reveal delay={(index % 3) * 80}>{t.tilt ? <TiltCard>{card}</TiltCard> : card}</Reveal>;
}

// The anchor object above a season's grid. Season one always had one and the
// other two opened on a paragraph and a bare grid, which is most of why they
// read as flat beside it. null is now a stated choice rather than a branch
// nobody noticed: a fourth season renders nothing here until someone fills in
// the row in seasonHero().
function SeasonHeroFigure({ season }: { season: number }) {
  const hero = seasonHero(season);
  if (hero === "fourteen") return <TheFourteenPlate />;
  if (hero === "case-full" || hero === "case-burned") return <TheCase burned={hero === "case-burned"} />;
  return null;
}

function TheFourteenPlate() {
  // The source raster is a portrait plate, 1200x1560. Capping the *figure*
  // (not just the image) at 520px and centring it is what keeps the caption
  // the same width as the art below it — capping only the <img> left the
  // caption spanning the old full-width container, which is what read as a
  // broken image with letterbox bars either side on desktop.
  return (
    <figure className="card-elevated mx-auto mt-8 w-full max-w-[520px] overflow-hidden rounded-2xl border border-line bg-void/40">
      <Picture
        src={anthology.fourteen}
        alt="Thirteen sigils in a ring, and one empty slot where a fourteenth should be."
        loading="lazy"
        width={1200}
        height={1560}
        className="h-auto w-full"
      />
      <figcaption className="border-t border-line px-6 py-4 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Thirteen sigils and one empty slot. Every world he has surveyed reports the same fourteen, and
        nobody, on any of them, can name the fourteenth.
      </figcaption>
    </figure>
  );
}

// Canon, not a count: season two is titled The Ninety-One Pages, and thirteen
// by seven is exactly ninety-one.
const CASE_SLOTS = 91;

// The case, and the season's whole plot in one figure. Derived from the
// entries themselves rather than drawn, so it cannot drift from the corpus and
// it costs no new art: the ten slots the reader has actually been handed, and,
// in the burned state, the thirteen the fire has taken in the order it took
// them. The page he keeps carries page 0 and drops out of both sets, which is
// right — it goes back into the case blank.
//
// The grid is aria-hidden and the figcaption carries the meaning in prose, the
// same split StateLegend below already uses. Colour is never the only channel
// either: a filled slot is solid, a read slot is ringed and solid, an emptied
// slot is an outline with nothing inside it.
function TheCase({ burned }: { burned: boolean }) {
  const read = new Set(entriesOfSeason(2).map((e) => e.page));
  const gone = new Set(burned ? entriesOfSeason(3).map((e) => e.page).filter(Boolean) : []);

  return (
    <figure className="card-elevated mx-auto mt-8 w-full max-w-[520px] overflow-hidden rounded-2xl border border-line bg-void/40">
      {/* Thirteen columns, seven rows, set in index.css. */}
      <div aria-hidden className="case-grid p-5">
        {Array.from({ length: CASE_SLOTS }, (_, i) => i + 1).map((page) => (
          <span
            key={page}
            className={`case-slot${gone.has(page) ? " case-slot--gone" : read.has(page) ? " case-slot--read" : ""}`}
          />
        ))}
      </div>
      <figcaption className="border-t border-line px-6 py-4 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        {burned
          ? "The same case, thirteen nights later. Every outline is a page he has taken out and burned, in the order he took it, and page ninety-one is the last one to go. The slot he fills again holds a blank sheet."
          : "Ninety-one slots, and he filled every one of them. The marked ten are the pages you have been handed. He wrote page ninety-one first, at the very back, before he had any right to reach it, and that is what finished the case."}
      </figcaption>
    </figure>
  );
}

// --- The Tellers -----------------------------------------------------------
// Canon law five: every legend keeps one mortal who was present and told it
// afterwards. The tab used to be one flat grid of every witness, which was
// readable at ten and is not at twenty, and which had no way at all to say
// that a slot is empty on purpose.
//
// The grouping is derived from the witness's own entry key, "s1-04" style, so
// a fourth season groups itself: anthology.seasons grows, "s4-" parses, and a
// season with no records renders nothing rather than an empty heading.

const seasonOfKey = (k: string) => Number(k.slice(1, k.indexOf("-")));
const idxOfKey = (k: string) => Number(k.slice(k.indexOf("-") + 1));
const keyOfEntry = (e: AnthologyEntry) => `s${e.season}-${String(e.idx).padStart(2, "0")}`;
const entryOfKey = (k: string) => anthologyEntries.find((e) => keyOfEntry(e) === k);

// A teller files under the season they first tell in, once, however many pages
// they carry: Ossul tells across all three and belongs to the season his
// caption comes from. The generated `entry` field is a single key today and
// widens to an array the moment one teller carries several, so both shapes are
// accepted here rather than this needing a second edit that day.
//
// ponytail: a record with no key at all files under no season and does not
// render. That is caught upstream, where build-registry.mjs holds both the
// keys and the entries and can throw on one that resolves to nothing; it
// cannot be caught here, because here there is nothing to compare against.
const keysOf = (w: AnthologyWitness): string[] => {
  const key: string | string[] | undefined = w.entry;
  return Array.isArray(key) ? key : key ? [key] : [];
};

/** A slot in a season's roll call that is deliberately empty. */
interface Blank {
  /** The entry it belongs to, which is also where it sorts in the roll. */
  entry: string;
  /** What kind of empty it is. The two kinds are not the same finding. */
  kicker: string;
  title: string;
  why: string;
}

// Nine entries have a teller-shaped hole that is deliberate. Omitting them
// reads as an oversight, which is the exact failure the bible warns about for
// entry 09's near-empty plate, so they are rows.
//
// They live in this file because src/data/anthology.ts is generated and does
// not carry them yet. When the generator grows an `absences` field this
// constant is deleted and the two lines below read it instead. Every claim
// here is in the story file it names.
const ARGUED_ABSENCES: { entry: string; why: string }[] = [
  {
    entry: "s1-09",
    why: "Forty million people, alive and fed, with no gods, no monsters, no luck and no stories at all. Law five has nothing to attach to, because there is no legend. The nearest thing to a teller is a woman who built a word for why out of their word for by what method, and nobody on that planet ever wrote down a thing she said. A teller is somebody whose account survives them. Hers does not.",
  },
  {
    entry: "s2-06",
    why: "Aboard ship between two systems he will not name, with no second person in it at any point. Everything that acts is equipment: a hanging scale, a peeling calibration sticker, three rows of a table.",
  },
  {
    entry: "s2-09",
    why: "Nineteen days out from anywhere, and the page is built out of proving nobody was there. Himself, the crew, the boarding log checked three times, Ossul eleven decks down. When he runs out of suspects the only other party in the room is the case, and a case is not mortal.",
  },
  {
    entry: "s3-05",
    why: "One sentence about blind fish and an apology for its own length. The nearest thing to a teller is a version of himself he cannot place, on a world he does not remember being on.",
  },
  {
    entry: "s3-06",
    why: "Three weighings and a difference. Its only witness is a hanging scale by the aft locker with a tolerance printed on its plate, and the whole discipline of the page is leaving a number alone.",
  },
  {
    entry: "s3-08",
    why: "Kaunis is here as an institution and a wall, not a person. Four hundred names in chalk, resurfaced every generation so nobody stops reading it. A world that gets a wall, and a man who does not.",
  },
  {
    entry: "s3-10",
    why: "Nobody on any of the six worlds ever saw the map. The graves still point and the poles still point. What stops existing is the pairing, and the only person who could witness that is the one burning it.",
  },
  {
    entry: "s3-12",
    why: "The alibi run, and its whole structure is the elimination of every other person who could have been in the room. What is left standing is his own sentence: an archive of one author is a self portrait.",
  },
  {
    entry: "s3-14",
    why: "The case is empty and nothing was witnessed. The only figure invoked is a rule rather than a person, and the plate is clean unmarked paper, the one undamaged object in the season. That is the portrait. Leave it.",
  },
];

// The other kind of blank, and the harder one to argue for keeping. Page
// seventy-three is four names and nothing else. He can place two of them,
// Sarn and Öyla, and about the other two he says plainly that he cannot tell
// you a single thing. A teller is somebody whose account survives them, and
// theirs did not, so there is no account to file and there never will be.
// They are not absences either, because that entry has two real tellers. They
// are named, and undrawn, permanently, and a caption reading "did something,
// once" would clear every check this site has while carrying nothing.
const UNPLACEABLE: { entry: string; name: string; why: string }[] = [
  {
    entry: "s3-11",
    name: "Ræl",
    why: "Named on page seventy-three beside Sarn and Öyla, in his own hand, in a hurry, by a man who did not trust himself to come back and finish the thought. Whatever Ræl did is gone from both of the places it ever lived, the page and the man, and it went into the fire with the other three names.",
  },
  {
    entry: "s3-11",
    name: "Tuvid",
    why: "The fourth name on a page that is four names and nothing else. He said it out loud twice, on the theory that a name said out loud sometimes drags the rest of the room in behind it. It did not. There is no account here to withhold, only one that was never made.",
  },
];

function blanksOfSeason(season: number): Blank[] {
  return [
    ...ARGUED_ABSENCES.filter((a) => seasonOfKey(a.entry) === season).map((a) => ({
      entry: a.entry,
      kicker: "No teller recorded",
      // The entry's own title, so the card reads as position nine of ten in a
      // roll call rather than as a footnote about a missing thing.
      title: entryOfKey(a.entry)?.title ?? a.entry,
      why: a.why,
    })),
    ...UNPLACEABLE.filter((u) => seasonOfKey(u.entry) === season).map((u) => ({
      entry: u.entry,
      kicker: "Named, never told",
      title: u.name,
      why: u.why,
    })),
  ];
}

function TellersTab() {
  return (
    <div className="mt-8">
      {/* The whole reason there is a story at all. Gods and monsters get
          sigils because a sigil is generated from a name; the tellers get
          drawn because someone actually had to be there to write it down. */}
      <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        The gods and monsters in this series get marks generated from their names. The people get drawn,
        because the people are the reason any of it survived to be written down. Where a season leaves a
        slot empty, the slot is the finding, so it is on the roll too.
      </p>

      {anthology.seasons.map((s) => (
        <SeasonRoll key={s.n} season={s.n} title={s.title} />
      ))}
    </div>
  );
}

// Heading order is load-bearing: lighthouserc.json asserts accessibility at
// 1.00 on /anthology, and it scores a skipped level as a real failure. Page
// h1, season h2, card h3.
function SeasonRoll({ season, title }: { season: number; title: string }) {
  const tellers = anthology.witnesses
    .filter((w) => seasonOfKey(keysOf(w)[0] ?? "") === season)
    .map((w) => ({ kind: "teller" as const, id: w.id, sort: idxOfKey(keysOf(w)[0]), w }));
  const blanks = blanksOfSeason(season).map((b) => ({
    kind: "blank" as const,
    id: `${b.entry}-${b.title}`,
    sort: idxOfKey(b.entry),
    b,
  }));

  // Interleaved by entry index, not concatenated: an absence clumped at the
  // end of the grid reads as a footnote, and it is supposed to read as the
  // ninth of ten pages this season has.
  const roll = [...tellers, ...blanks].sort((a, b) => a.sort - b.sort);
  if (!roll.length) return null;

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="kicker mt-1">
        {tellers.length} tellers · {blanks.length} deliberate blanks
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {roll.map((r, i) => (
          <Reveal key={r.id} delay={(i % 3) * 80}>
            {r.kind === "teller" ? <TellerCard witness={r.w} /> : <BlankCard blank={r.b} />}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const ROLL_CARD = "card-elevated group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition";

function TellerCard({ witness: w }: { witness: AnthologyWitness }) {
  // Resolved from the record's own entry keys rather than by scanning the
  // corpus for an entry that kept a copy of this witness: that scan was
  // already fragile and it is outright wrong the moment one teller carries
  // several pages. The first key is the home page, the count is the rest.
  const keys = keysOf(w);
  const home = keys.map(entryOfKey).find(Boolean);
  const alt = `${w.name}. ${w.did}`;

  const body = (
    <>
      {w.art ? (
        <img src={w.art} alt={alt} loading="lazy" width={1100} height={600} className="w-full object-cover" />
      ) : (
        // A record with no portrait yet is a real state, not an error: the
        // record is the law-five claim and the drawing costs money. Same 11:6
        // box as a portrait, so nothing on the card moves when the art lands.
        // It carries its own label here because, unlike on the reading page,
        // there is no adjacent alt text already doing that work.
        <div className="teller-unrendered" role="img" aria-label={`${w.name}. Portrait not yet rendered.`}>
          <span className="kicker">Awaiting rendering</span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        {/* h3 under the season's h2. It was an h2 while this tab was one flat
            grid with no grouping heading above it. */}
        <h3 className="font-display text-lg font-bold leading-snug">{w.name}</h3>
        {w.of && (
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-dim)" }}>
            {w.of}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {w.did}
        </p>
        {keys.length > 1 && <p className="kicker mt-3">Tells in {keys.length} entries</p>}
      </div>
    </>
  );

  return home ? (
    <Link to="/read/$slug" params={{ slug: home.slug }} className={`${ROLL_CARD} border-line hover:border-accent/60`}>
      {body}
    </Link>
  ) : (
    <div className={`${ROLL_CARD} border-line`}>{body}</div>
  );
}

// A slot that is empty on purpose. No plate box at all, which is what tells it
// apart at a glance from a teller whose portrait has not been drawn yet: that
// one is a slot waiting to be filled, this one is a slot that is never going
// to be. The border is dashed for the same reason, and the argument is the
// body text, because a reader checking law five should find the argument here
// rather than find nothing and assume an oversight.
//
// Colours are existing ink-world tokens, both measured against --color-card
// #221b15: --color-text-dim #a4978a is 5.97:1 and --color-line #3a2f24 is
// 1.30:1, which is why the line is only ever a border and never carries a word.
function BlankCard({ blank: b }: { blank: Blank }) {
  const entry = entryOfKey(b.entry);

  const body = (
    <div className="flex flex-1 flex-col p-4">
      <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
        {b.kicker}
      </span>
      <h3 className="font-display mt-2 text-lg font-bold leading-snug">{b.title}</h3>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        {b.why}
      </p>
    </div>
  );

  return entry ? (
    <Link
      to="/read/$slug"
      params={{ slug: entry.slug }}
      className={`${ROLL_CARD} border-dashed border-line hover:border-accent/60`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${ROLL_CARD} border-dashed border-line`}>{body}</div>
  );
}

function StarmapTab() {
  // 611 rather than the middle of the range or the top: it is the count on
  // the day of the case's first page (see /read/the-second-chair), so
  // opening this tab starts the reader at the same number the story does.
  const [concluded, setConcluded] = useState(611);
  const navigate = useNavigate();

  const openWorld = useCallback(
    (key: string) => {
      const [seasonStr, idxStr] = key.split("-");
      const entry = anthologyEntries.find((e) => e.season === Number(seasonStr) && e.idx === Number(idxStr));
      if (entry) navigate({ to: "/read/$slug", params: { slug: entry.slug } });
    },
    [navigate],
  );

  return (
    <div className="mt-8">
      <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Dragging this runs the Directory's count of Concluded worlds from six hundred and eleven to six
        hundred and seventy-one, and the sky goes out behind him.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <label htmlFor="concluded-count" className="kicker">
          Concluded count
        </label>
        <input
          id="concluded-count"
          type="range"
          min={611}
          max={671}
          value={concluded}
          onChange={(e) => setConcluded(Number(e.target.value))}
          className="h-1 w-56 accent-accent"
        />
        <span className="font-mono text-sm text-accent" aria-live="polite">
          {concluded.toLocaleString()} worlds
        </span>
      </div>

      {/* Fixed height so mounting the Suspense fallback and then the real
          canvas never reflows the page around it — the one thing a lazy 3D
          chunk cannot be allowed to do to a text-heavy page. */}
      <div className="card-elevated relative mt-6 h-[520px] overflow-hidden rounded-2xl border border-line bg-void/60">
        <Suspense
          fallback={
            <div className="kicker flex h-full items-center justify-center">
              loading the starmap…
            </div>
          }
        >
          <Starmap concluded={concluded} onOpen={openWorld} />
        </Suspense>
        <span className="kicker pointer-events-none absolute bottom-3 right-4">
          drag to orbit
        </span>
      </div>

      <ul className="mt-6 grid list-none gap-x-6 gap-y-2 p-0 text-sm sm:grid-cols-2">
        <StateLegend swatch="#8FD3FF" term="Lit" desc="Filed. Click a lit world to read the entry it explains." />
        <StateLegend swatch="#7EE787" term="Open" desc="The one open file in the sky, still unresolved." />
        <StateLegend swatch="#39424E" term="Concluded" desc="Closed once the count above reaches its number." />
        <StateLegend swatch="#8A6A2F" term="Ruin" desc="Concluded, and the record itself did not survive." />
        <StateLegend swatch="#D9A441" term="Self" desc="The Directory. Him." />
        <StateLegend
          swatch="#A85A38"
          term="Withdrawn"
          desc="The page burned. The world is still there. The count above never reaches it, because the Directory never had it to file."
        />
      </ul>
    </div>
  );
}

function StateLegend({ swatch, term, desc }: { swatch: string; term: string; desc: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-line" style={{ background: swatch }} />
      <span style={{ color: "var(--color-text-dim)" }}>
        <strong className="font-semibold" style={{ color: "var(--color-text)" }}>
          {term}.
        </strong>{" "}
        {desc}
      </span>
    </li>
  );
}
