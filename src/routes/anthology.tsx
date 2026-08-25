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

type Tab = number | "starmap" | "tellers" | "canon";

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
              <button
                type="button"
                onClick={() => setTab("canon")}
                aria-pressed={tab === "canon"}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  tab === "canon"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                }`}
              >
                The Canon
              </button>
            </div>

            {anthology.seasons.map((s) =>
              tab === s.n ? (
                <div key={s.n}>
                  <p className="mt-6 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                    {s.blurb}
                  </p>
                  {/* The most load-bearing image in the set, and it only belongs
                      on the season that files legends in the first place —
                      Season Two's pages are a case file, not a census. */}
                  {s.n === 1 && <TheFourteenPlate />}
                  <SeasonGrid season={s.n} />
                </div>
              ) : null,
            )}

            {tab === "starmap" && <StarmapTab />}
            {tab === "tellers" && <TellersTab />}
            {tab === "canon" && <CanonTab />}
          </div>
        </main>
        <SiteFooter />
        <FloatingChat />
      </div>
  </DeferredPlayRoom>
  );
}

function SeasonGrid({ season }: { season: number }) {
  const entries = entriesOfSeason(season);
  const cool = season === 1;
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e, i) => (
        <EntryCard key={e.slug} entry={e} cool={cool} index={i} />
      ))}
    </div>
  );
}

function EntryCard({ entry: e, cool, index }: { entry: AnthologyEntry; cool: boolean; index: number }) {
  // The 91 is canon, not a count: season two is titled The Ninety-One Pages
  // and season three burns ninety of them. What is not canon is that every
  // record has a page at all — the page he keeps carries 0, and unguarded
  // that shipped as "PAGE 0 OF 91".
  const kicker =
    e.season === 1 ? `ENTRY #${e.entry}` : e.page ? `PAGE ${e.page} OF 91` : "THE PAGE HE KEEPS";
  // Season two's cards sit a little off true, alternating left and right —
  // the small imperfection that reads as "handled paper" rather than "filed
  // record". Season one gets none of this; a case file does not tilt.
  const rotate = cool ? 0 : index % 2 === 0 ? -0.6 : 0.7;

  const card = (
    // The border and group-hover live on this wrapper, not the Link, so the
    // reaction row below can sit inside the same card without nesting a
    // <button> inside an <a> — invalid HTML, and it would fire the Link's
    // navigation on every reaction click.
    <div
      className={`card-elevated group flex h-full flex-col overflow-hidden border bg-card transition ${
        cool ? "rounded-lg border-line hover:border-zinc-500" : "rounded-2xl border-accent/25 hover:border-accent/60"
      }`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <Link to="/read/$slug" params={{ slug: e.slug }} className="flex flex-1 flex-col">
        {e.plate ? (
          <Picture
            src={e.plate}
            alt=""
            loading="lazy"
            className={`w-full object-cover ${cool ? "grayscale-[35%] sepia-[10%]" : ""}`}
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
          <span className={`font-mono text-[11px] uppercase tracking-widest ${cool ? "text-zinc-400" : "text-accent"}`}>
            {kicker}
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

  return <Reveal delay={(index % 3) * 80}>{cool ? card : <TiltCard>{card}</TiltCard>}</Reveal>;
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

function TellersTab() {
  return (
    <div className="mt-8">
      {/* The whole reason there is a story at all. Gods and monsters get
          sigils because a sigil is generated from a name; the tellers get
          drawn because someone actually had to be there to write it down. */}
      <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        The gods and monsters in this series get marks generated from their names. The people get drawn,
        because the people are the reason any of it survived to be written down.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {anthology.witnesses.map((w, i) => (
          <Reveal key={w.id} delay={(i % 3) * 80}>
            <TellerCard witness={w} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function TellerCard({ witness: w }: { witness: AnthologyWitness }) {
  // The witness record in `anthology.witnesses` carries the loose "s1-01"
  // key it was matched by at generation time; the trustworthy link target is
  // whichever entry actually kept a copy of this witness, found by id rather
  // than re-parsed from that key.
  const entry = anthologyEntries.find((e) => e.witness?.id === w.id);
  const alt = `${w.name}. ${w.did}`;

  const body = (
    <>
      <img src={w.art} alt={alt} loading="lazy" width={1100} height={600} className="w-full object-cover" />
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-display text-lg font-bold leading-snug">{w.name}</h2>
        {w.of && (
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-dim)" }}>
            {w.of}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {w.did}
        </p>
      </div>
    </>
  );

  const className = "card-elevated group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-card transition";

  return entry ? (
    <Link to="/read/$slug" params={{ slug: entry.slug }} className={`${className} hover:border-accent/60`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
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

// The seven laws, each cut down to the one line a reader actually needs. The
// full reasoning for each lives in the source bible; this tab is a panel a
// reader visits once to look something up, not the place to re-argue it.
const SEVEN_LAWS: { name: string; gloss: string }[] = [
  { name: "The Count of Fourteen", gloss: "Every world reports fourteen gods and fourteen monsters, independently, with no contact between them." },
  { name: "The Unnamed Fourteenth", gloss: "Ask anyone to list the fourteen monsters and you get thirteen names and a pause." },
  { name: "The Halving", gloss: "A deadlock ends only when someone voluntarily divides themselves and spends both halves." },
  { name: "The Residue", gloss: "Whatever is left over becomes the phenomenon he can actually measure: snow, silence, a tide, a count." },
  { name: "The Witness Who Tells It", gloss: "Every legend keeps one mortal who was there and told it afterward. The heroes lose; the tellers are why there is a story at all." },
  { name: "The Two Facings", gloss: "One storyteller's account of why thirteen of the fourteen split and one did not. Not settled canon." },
  { name: "Concluded", gloss: "The Directory's status flag for a world with no phenomena outstanding and no further contact indicated." },
];

// Realm is blank for Galaxal and Milgalaxal in the founding charter itself;
// they are not tied to any one world's day, so there is nothing to put there.
const STANDARD_INTERVALS: { interval: string; realm: string; length: string }[] = [
  { interval: "Flick", realm: "Nifheim", length: "1.2 Earth hours" },
  { interval: "Tick", realm: "Limheim", length: "1 Earth day" },
  { interval: "Momenta", realm: "Purgaheim", length: "50 Earth days" },
  { interval: "Click", realm: "Hellheim", length: "2 Earth years" },
  { interval: "Galaxal", realm: "", length: "228 Hellheims · 456 Earth years" },
  { interval: "Milgalaxal", realm: "", length: "2228 Hellheims · 2455 Earth years" },
  { interval: "Elysheim", realm: "Elysheim", length: "not yet required" },
  { interval: "Vænheim", realm: "Vænheim", length: "not yet required" },
];

// Every claim on this tab traces to one of these files, so the links are the
// receipt rather than decoration. The record file names, not "the bible" or
// "the council", so a reader who wants to check the arithmetic in law six can
// go straight to the line it came from.
//
// The bible rows are derived from the seasons themselves, because the upstream
// filename is mechanical (bible.md for season one, s2-bible.md after it) and a
// hand-kept list had already fallen a season behind: s3-bible.md exists and
// this tab was not linking it. A fourth season now arrives with its own
// receipt. The council records stay written out — they are dated audits of one
// particular week, not a per-season artefact, so nothing derives them.
const CANON_SOURCES: { file: string; note: string }[] = [
  ...anthology.seasons.map((s) => ({
    file: s.n === 1 ? "bible.md" : `s${s.n}-bible.md`,
    note: `the canon for season ${s.n}, ${s.title}`,
  })),
  { file: "council-2026-08-15.md", note: "the record of the season one council" },
  { file: "council-s2-2026-08-15.md", note: "the cross-lab audit that killed six of the first ten season two premises" },
];
const CANON_SOURCE_BASE = "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/";

function CanonTab() {
  return (
    <div className="mt-8">
      {/* The count and its resolution, distilled from laws one, two and six.
          This is the fact every entry in both seasons assumes the reader
          already has, and until now the site never actually stated it. */}
      <p className="max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Every world he has ever surveyed independently reports the same census: fourteen gods, fourteen
        monsters. Ask anyone to list the fourteen monsters and you get thirteen names and a pause. The
        resolution comes from one storyteller's account: thirteen of the fourteen split into a god-face
        and a monster-face when observed from both sides at once, and the one that never split keeps its
        single name on the god list, out of gratitude, and holds an unnamed line on the monster list,
        because it only ever had the one face to give. Twenty-eight lines. Twenty-seven names.
      </p>

      <section className="card-elevated mt-8 rounded-2xl border border-line bg-void/40 p-6">
        <h2 className="font-display text-lg font-bold">The Seven Laws</h2>
        <ol className="mt-4 space-y-3 pl-5 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {SEVEN_LAWS.map((law) => (
            <li key={law.name} className="list-decimal">
              <strong className="font-semibold" style={{ color: "var(--color-text)" }}>
                {law.name}.
              </strong>{" "}
              {law.gloss}
            </li>
          ))}
        </ol>
      </section>

      <section className="card-elevated mt-6 rounded-2xl border border-line bg-void/40 p-6">
        <h2 className="font-display text-lg font-bold">Standard Intervals</h2>
        {/* Wrapped for narrow screens: five columns' worth of monospace data
            does not fit a phone width, and this table needs to scroll inside
            its own box rather than force the whole page wider. */}
        <div className="mt-4 overflow-x-auto">
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
                  <td className="py-2" style={{ color: "var(--color-text-dim)" }}>
                    {row.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          The milgalaxal line does not multiply out from the click above it. That is inherited from the
          2021 source story rather than a typo, and Entry #2300 is built on it.
        </p>
      </section>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Nothing above is asserted without a source. The bibles and the council records this tab was
        drawn from are public:{" "}
        {CANON_SOURCES.map((s, i) => (
          <span key={s.file}>
            <a
              href={`${CANON_SOURCE_BASE}${s.file}`}
              target="_blank"
              rel="noreferrer"
              title={s.note}
              className="font-mono text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {s.file}
            </a>
            {i < CANON_SOURCES.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </div>
  );
}
