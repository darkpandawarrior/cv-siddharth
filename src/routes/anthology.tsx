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

// Starmap.tsx is a named export, not a default one — the plain object shape
// React.lazy() requires is built here rather than by changing that file's
// export style for the convenience of one caller.
const Starmap = lazy(() => import("../Starmap.tsx").then((m) => ({ default: m.Starmap })));

/**
 * The Morkinstar Journals — the anthology hub, one room deeper than /ink.
 *
 * Season 1 files a legend for every world it visits and numbers each entry.
 * Season 2 stops filing, so it has pages instead of entries and a case
 * instead of a directory. Same skin, same route, deliberately different
 * objects: season one's cards are flat and sharp-cornered, season two's tilt
 * and glow and sit very slightly askew, the way loose paper does on a desk.
 * The starmap is the third way to arrive at a story — geography instead of a
 * table of contents — and it is the one thing on this page heavy enough to
 * need its own lazy chunk.
 */
export const Route = createFileRoute("/anthology")({
  head: () => roomHead("/anthology"),
  ssr: false,
  component: AnthologyRoute,
});

type Tab = number | "starmap" | "tellers";

function AnthologyRoute() {
  const [tab, setTab] = useState<Tab>(1);

  return (
    <div className="ink-world min-h-screen">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/ink" className="flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> The Ink
          </Link>
          <WorldSwitch current="ink" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="section-y mx-auto max-w-5xl px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-accent/80">// twenty entries, two seasons</p>
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
        </div>
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
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
  const kicker = e.season === 1 ? `ENTRY #${e.entry}` : `PAGE ${e.page} OF 91`;
  // Season two's cards sit a little off true, alternating left and right —
  // the small imperfection that reads as "handled paper" rather than "filed
  // record". Season one gets none of this; a case file does not tilt.
  const rotate = cool ? 0 : index % 2 === 0 ? -0.6 : 0.7;

  const card = (
    <Link
      to="/read/$slug"
      params={{ slug: e.slug }}
      className={`card-elevated group flex h-full flex-col overflow-hidden border bg-card transition ${
        cool ? "rounded-lg border-line hover:border-zinc-500" : "rounded-2xl border-accent/25 hover:border-accent/60"
      }`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
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
          className="flex items-center justify-center bg-void/40 font-mono text-[10px] uppercase tracking-widest text-muted"
          style={{ aspectRatio: "600 / 780" }}
        >
          plate lost
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <span className={`font-mono text-[11px] uppercase tracking-widest ${cool ? "text-zinc-400" : "text-accent"}`}>
          {kicker}
        </span>
        <h3 className="font-display mt-2 text-lg font-bold leading-snug transition group-hover:text-accent">{e.title}</h3>
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-dim)" }}>
          {e.planet}
          {e.system ? ` · ${e.system}` : ""}
        </p>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {e.blurb}
        </p>
      </div>
    </Link>
  );

  return <Reveal delay={(index % 3) * 80}>{cool ? card : <TiltCard>{card}</TiltCard>}</Reveal>;
}

function TheFourteenPlate() {
  return (
    <figure className="card-elevated mt-8 overflow-hidden rounded-2xl border border-line bg-void/40">
      <Picture
        src={anthology.fourteen}
        alt="Thirteen sigils in a ring, and one empty slot where a fourteenth should be."
        loading="lazy"
        width={600}
        height={780}
        className="mx-auto h-auto max-h-[520px] w-auto"
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
        <h3 className="font-display text-lg font-bold leading-snug">{w.name}</h3>
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
        <label htmlFor="concluded-count" className="font-mono text-xs uppercase tracking-widest text-muted">
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
            <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
              loading the starmap…
            </div>
          }
        >
          <Starmap concluded={concluded} onOpen={openWorld} />
        </Suspense>
        <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-wider text-muted">
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
