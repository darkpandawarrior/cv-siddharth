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
import { anthology, anthologyEntries, entriesOfSeason, unfiledPieces } from "../data/anthology.ts";
import type { AnthologyEntry, AnthologyWitness } from "../data/anthology.ts";
// The register's targets and this route's validateSearch have to agree about
// what a layer is called, so the vocabulary is imported rather than restated.
// A second copy of it here is how a link starts pointing at a layer that no
// longer exists.
import type { AnthologySearch } from "../data/crossnav.ts";
import { entryTheme, seasonHero } from "../lib/seasonTheme.ts";
import type { ThemeVars } from "../lib/seasonTheme.ts";
import { ReactionRow } from "../play/ReactionRow.tsx";

import { DeferredPlayRoom } from "../play/DeferredPlayRoom.tsx";
// Starmap.tsx is a named export, not a default one — the plain object shape
// React.lazy() requires is built here rather than by changing that file's
// export style for the convenience of one caller.
const Starmap = lazy(() => import("../Starmap.tsx").then((m) => ({ default: m.Starmap })));

/**
 * The five layers, and the whole URL vocabulary for them.
 *
 * The media are the navigation. A reader picked up a form, a case, a fire, a
 * map or the roll of tellers, so that is what the address says; season numbers
 * stay out of it, because a number is a filing detail and renumbering one
 * would silently retarget every link anyone had ever pasted.
 *
 * One table doing three jobs: the vocabulary validateSearch accepts, the
 * switch row in its order, and which season a layer opens. A fourth season
 * adds a row here, the same way seasonHero() already asks for one.
 */
type Layer = NonNullable<AnthologySearch["layer"]>;

const LAYERS: readonly { key: Layer; label: string; season: number | null }[] = [
  { key: "form", label: "The Form", season: 1 },
  { key: "case", label: "The Case", season: 2 },
  { key: "fire", label: "The Fire", season: 3 },
  // Season four is the wall he posts on, and the wall keeps everything: paint
  // is not fire. It sits after the fire in publication order because that is
  // the order it happened in, not because the row is a season number.
  { key: "wall", label: "The Wall", season: 4 },
  { key: "map", label: "The Map", season: null },
  { key: "tellers", label: "The Tellers", season: null },
  // Work in this universe with no season, no series and no designation. It sits
  // last because it is not part of the run: it is not one of the forty-eight,
  // and the switch row should not imply it is a fifth season. There is no
  // `season` for the same reason.
  { key: "unfiled", label: "Unfiled", season: null },
];

// Publication order is still the first-visit path. The form is what
// /anthology showed before it had an address and it is what it shows now, so
// the default carries no param at all and the bare URL keeps meaning exactly
// what it has always meant.
const DEFAULT_LAYER: Layer = "form";

const layerOfSeason = (n: number): Layer | undefined => LAYERS.find((l) => l.season === n)?.key;

// The door's numbers, derived rather than typed. This page has already shipped
// "twenty entries, two seasons" against a corpus of thirty-four across three,
// and the fix is not a better number, it is not having one to keep.
const TOTAL_WORDS = anthologyEntries.reduce((n, e) => n + e.words, 0);
// 220wpm is the same figure the reading page uses for its per-piece estimate.
const HOURS = Math.round(TOTAL_WORDS / 220 / 60);

// Two doors, both chosen by data so neither becomes a taste claim that goes
// stale. The first piece in publication order, and the shortest way into the
// season that needs no prior context: the shortest piece in the CORPUS is 280
// words deep inside season three and would be a door into the middle of a fire.
const FIRST = anthologyEntries.filter((e) => e.season === 1).sort((a, b) => a.idx - b.idx)[0];
const SHORTEST = anthologyEntries.filter((e) => e.season === 1).sort((a, b) => a.words - b.words)[0];

// The slider's domain, which is the Directory's own count of Concluded
// worlds. Hoisted out of StarmapTab because validateSearch has to clamp an
// arriving `at` to the range the input will accept, and two copies of a range
// is how one of them ends up one off.
const CONCLUDED_START = 611;
const CONCLUDED_END = 671;

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
  // An unrecognised or absent layer renders the default rather than throwing:
  // a truncated or mistyped link should still hand a stranger the anthology.
  // `layer=form` normalises away for the reason /resume drops its default cut.
  // The plain URL is the one people paste.
  validateSearch: (search: Record<string, unknown>): AnthologySearch => {
    const layer = LAYERS.find((l) => l.key === search.layer)?.key;
    if (!layer || layer === DEFAULT_LAYER) return {};
    // `world` and `at` are the map's arrival coordinates and mean nothing on
    // any other layer, so they are dropped there rather than carried as dead
    // weight through every switch.
    if (layer !== "map") return { layer };
    const at = Number(search.at);
    return {
      layer,
      ...(typeof search.world === "string" && search.world ? { world: search.world } : {}),
      ...(Number.isFinite(at)
        ? { at: Math.min(Math.max(Math.trunc(at), CONCLUDED_START), CONCLUDED_END) }
        : {}),
    };
  },
  component: AnthologyRoute,
});

function AnthologyRoute() {
  const { layer = DEFAULT_LAYER, world, at } = Route.useSearch();
  const navigate = useNavigate({ from: "/anthology" });

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
              // {anthologyEntries.length} pieces, {anthology.seasons.length} seasons,{" "}
              {TOTAL_WORDS.toLocaleString()} words
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
            {/* Said here, once, and nowhere else on this site. No explanation
                follows it and none is allowed to: an order that has to be
                described is an order, and the sentence is only true while the
                site keeps its mouth shut afterwards. */}
            <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              Works separately, together, or in any order.
            </p>

            {/* THE DOOR.
                Three facts a stranger needs and could not otherwise get: how
                long this is, what the four seasons physically ARE, and where to
                start. Everything here is derived, so none of it can rot into a
                claim the corpus stopped supporting: the hours come from the
                real word count, and both doors are picked by data rather than
                by taste, which is also why neither is called the best one.

                It does NOT explain the line above it. "Any order" is the
                claim and it stands unexplained, as it must. This answers a
                different question, which is what to do when you have twenty
                minutes and no opinion yet. */}
            <div className="mt-6 max-w-2xl border-l-2 border-accent/40 pl-4">
              <p className="leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                About {HOURS} hours of reading, in four objects: a Directory survey form, a page in a
                wooden case, a fire, and a public wall he pastes notices onto.
              </p>
              <p className="mt-3 leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                If you would rather be pointed somewhere:{" "}
                <Link to="/read/$slug" params={{ slug: FIRST.slug }} className="text-accent underline underline-offset-2">
                  {FIRST.title}
                </Link>{" "}
                is where it starts, and{" "}
                <Link to="/read/$slug" params={{ slug: SHORTEST.slug }} className="text-accent underline underline-offset-2">
                  {SHORTEST.title}
                </Link>{" "}
                is the shortest way in at {SHORTEST.words.toLocaleString()} words.
              </p>
            </div>

            {/* The switches carry the objects, not the seasons: a season
                number is what the Directory files a thing under and this row
                is what a reader picked up. Three near-identical blocks and a
                Tab union that could express `4` before a fourth season existed
                are now rows in LAYERS, which is also what validateSearch reads,
                so a switch and its own address cannot drift apart. */}
            <div role="group" aria-label="Choose a layer" className="mt-10 flex flex-wrap gap-2">
              {LAYERS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  // A layer is a place, so Back returns to the previous one and
                  // this is a real history entry rather than a replace. Scroll
                  // reset and the cross-fade both stay off: this is one page
                  // changing what it shows, and it did neither of those things
                  // while it was useState.
                  onClick={() =>
                    navigate({
                      search: l.key === DEFAULT_LAYER ? {} : { layer: l.key },
                      resetScroll: false,
                      viewTransition: false,
                    })
                  }
                  aria-pressed={layer === l.key}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    layer === l.key
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                  }`}
                >
                  {l.label}
                </button>
              ))}
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

            {/* A season with no row in LAYERS has no address and so renders
                nothing, which is the same contract seasonHero() already has. */}
            {anthology.seasons.map((s) =>
              layerOfSeason(s.n) === layer ? (
                <div key={s.n}>
                  <p className="mt-6 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                    {s.blurb}
                  </p>
                  <SeasonHeroFigure season={s.n} />
                  <SeasonGrid season={s.n} />
                </div>
              ) : null,
            )}

            {layer === "map" && <StarmapTab world={world} at={at} />}
            {layer === "tellers" && <TellersTab />}
            {layer === "unfiled" && <UnfiledTab />}
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
          {/* The colour is stated, not inherited, and that is load-bearing.
              Without it this h2 inherits .ink-world's cream from an ancestor
              OUTSIDE the card, and season three's kept page paints its own
              paper ground (--color-card #e9dfc9) underneath. Measured on the
              rendered page: cream #efe7d8 on that paper is 1.08:1. The title of
              the one undamaged object in season three was invisible, and had
              been since the paper landed. var(--color-text) resolves to the
              kept theme's own ink, #1f1a12, at 13.06:1.

              Third instance of this exact bug in this repo: see the two notes
              in index.css about .piece-body blockquote and .flipbook-year. A
              scoped theme that overrides a token only reaches elements that
              actually read the token. anthologyContrast.spec.ts now walks all
              four layers and fails under 4.5:1, so a fourth instance is caught
              by a measurement rather than by someone looking at the page. */}
          <h2
            className="font-display mt-2 text-lg font-bold leading-snug transition group-hover:text-accent"
            style={{ color: "var(--color-text)" }}
          >
            {e.title}
          </h2>
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
  // Exhaustive by construction: `hero` is null here or tsc fails. That is the
  // guard, not a comment about one. Season four used to return "wall" from
  // seasonHero and land in this return, drawing nothing while the type said a
  // hero existed.
  hero satisfies null;
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
        A god or a monster reaches us as a mark, the shape its name makes. A person reaches us as a face,
        because the people are the reason any of it survived to be written down. Where a season leaves a
        slot empty, the slot is the finding, so it is on the roll too.
      </p>

      {anthology.seasons.map((s) => (
        <SeasonRoll key={s.n} season={s.n} title={s.title} />
      ))}
    </div>
  );
}

/**
 * Work in this universe with no season, no series and no designation.
 *
 * It is a lane rather than a fifth season, and the distinction is the point.
 * Four seasons and forty-eight entries are load-bearing numbers, printed on
 * four pages and asserted by guards on both sides of the registry hop, and a
 * piece here is not one of the forty-eight. `unfiledPieces` is its own array
 * for exactly that reason.
 *
 * It also does not go in /ink. That page says "// before the code" and every
 * piece under it carries an era between 2018 and 2021; filing a 2026 piece
 * there would claim a provenance it does not have.
 *
 * No hero, no plate, no sigil. A sigil is hashed from the entity an entry is
 * about and a plate is a season's object, and an unfiled piece belongs to
 * neither. What it has instead is the designation its own frontmatter carries,
 * printed rather than resolved.
 */
function UnfiledTab() {
  return (
    <div className="mt-8">
      <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Filed under no season and no series. The Directory has a form for work in this position and
        the form has a field for the designation, and the field is filled in the way that field is
        always filled in when nobody has decided yet.
      </p>

      {unfiledPieces.length === 0 ? (
        // Not decoration: the lane ships before anything is guaranteed to be in
        // it, and an empty grid with no words in it reads as a broken page.
        <p className="mt-8 text-sm" style={{ color: "var(--color-muted)" }}>
          Nothing here yet.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {unfiledPieces.map((p) => (
            <li key={p.slug}>
              <Link
                to="/read/$slug"
                params={{ slug: p.slug }}
                className="group flex h-full flex-col rounded-none border border-line bg-card p-5 transition hover:border-accent/60"
              >
                {/* The designation, printed exactly as the frontmatter carries
                    it. The corpus uses square brackets for a value a form
                    requires and nobody has filled in, so "[unassigned]" IS the
                    answer rather than a missing one, and it is set in the mono
                    register every other filing value on this site uses. */}
                <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                  {p.series}
                </span>
                {/* h3 under the page h1 and the layer's own h2. Heading order is
                    asserted at 1.00 by lighthouserc.json. Colour stated, not
                    inherited: see the note on EntryCard's h2. */}
                <h3
                  className="font-display mt-2 text-lg font-bold leading-snug transition group-hover:text-accent"
                  style={{ color: "var(--color-text)" }}
                >
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                  {p.blurb}
                </p>
                <span className="mt-4 font-mono text-[11px] tabular-nums" style={{ color: "var(--color-muted)" }}>
                  {p.words.toLocaleString()} words
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
          // The id is the ANCHOR TARGET, and it is not the React key. A reading
          // page links a teller aside at `#teller-${w.id}` and the register
          // links an argued absence at `#blank-${entry}`; both were being
          // constructed and neither was ever emitted, so the links resolved to
          // the right layer and then did nothing. scroll-mt keeps the card off
          // the top edge when the browser jumps to it.
          <Reveal key={r.id} delay={(i % 3) * 80}>
            <div
              id={r.kind === "teller" ? `teller-${r.w.id}` : `blank-${r.b.entry}`}
              className="scroll-mt-24"
            >
              {r.kind === "teller" ? <TellerCard witness={r.w} /> : <BlankCard blank={r.b} />}
            </div>
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

function StarmapTab({ world, at }: { world?: string; at?: number }) {
  // 611 rather than the middle of the range or the top: it is the count on
  // the day of the case's first page (see /read/the-second-chair), so
  // opening this tab starts the reader at the same number the story does.
  //
  // An arriving link may state its own count instead, and then the slider is
  // already at position when the canvas mounts. Nothing animates towards it,
  // ever. It is local state from there on, because the dragging is the
  // reader's own and writing sixty history entries into their Back button is
  // not addressability.
  const [concluded, setConcluded] = useState(at ?? CONCLUDED_START);
  const navigate = useNavigate();

  // The season filter has been inert since the starmap shipped, because
  // nothing on this page knew which season a reader had come for. An arrival
  // does: `?world=` names the world a record is the record of, and that
  // world's own key names the season. The season is raised, and every other
  // world keeps its position, its state colour and its click target, so the
  // sky stays the same sky.
  // ponytail: derived from the arrival, with no control of its own. A season
  // picker down here would be a fourth way to choose a season on a page whose
  // switch row is already one of the other three.
  const raised = anthology.starmap.worlds.find((w) => w.n === world)?.k?.split("-")[0];
  const season = raised ? Number(raised) : null;

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
          min={CONCLUDED_START}
          max={CONCLUDED_END}
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
          <Starmap concluded={concluded} onOpen={openWorld} season={season} />
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
