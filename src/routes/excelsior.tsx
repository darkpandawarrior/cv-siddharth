import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { Flipbook } from "../Flipbook.tsx";
import { excelsiorEditions } from "../data/excelsior.ts";
import { excelsiorMarks } from "../data/excelsiorMarks.ts";
import { writeProgress } from "../lib/excelsiorProgress.ts";
import { countWord } from "../data/labs.ts";
import { FloatingChat } from "../FloatingChat.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { WorldSwitch } from "../WorldSwitch.tsx";

/**
 * The magazine, hosted here rather than linked away. `?year=&page=` are the
 * reader's state, so any spread is shareable — including the one with my name
 * on it (2021, page 5).
 */
// `year` is a NUMBER, not the string it is everywhere else in the data. The
// router's default search serializer JSON-encodes values, so a string year
// produced `?year=%222021%22` — quoted, ugly, and this is a URL meant to be
// pasted into an application. A number round-trips as `?year=2021`.
type Search = { year: number; page: number };

export const Route = createFileRoute("/excelsior")({
  head: () => roomHead("/excelsior"),
  validateSearch: (search: Record<string, unknown>): Search => {
    const year = Number(search.year);
    const known = excelsiorEditions.some((e) => Number(e.year) === year);
    const edition = known ? year : Number(excelsiorEditions[0].year);
    const total = excelsiorEditions.find((e) => Number(e.year) === edition)?.pages ?? 1;
    const page = Number(search.page);
    return {
      year: edition,
      page: Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), total) : 1,
    };
  },
  component: ExcelsiorRoute,
});

function ExcelsiorRoute() {
  const { year, page } = Route.useSearch();
  const navigate = useNavigate({ from: "/excelsior" });
  // The same filter the pill row runs, hoisted so the sentence above it counts
  // the pills it actually renders. "The five I wrote" was typed in beside the
  // list that decides it, which is the arrangement that always drifts.
  const readable = excelsiorMarks.filter((m) => m.readSlug);
  // The reader wants only the current edition's marks — a scrubber tick or a
  // contact-sheet badge for a page number that belongs to a different year
  // would land on the wrong spread.
  const editionMarks = excelsiorMarks.filter((m) => Number(m.year) === year);
  // Jump-to-a-page chips, computed once and rendered into two different
  // wrappers below (a closed mobile disclosure, a plain row at sm+) so the
  // fold fix doesn't require two copies of this map.
  const jumpChips = excelsiorMarks.map((m) => (
    <Link
      key={`${m.year}-${m.page}`}
      to="/excelsior"
      search={{ year: Number(m.year), page: m.page }}
      replace
      // Same reason as the Flipbook callbacks below: these jump the book to
      // a page, they do not change what page you are on.
      viewTransition={false}
      title={m.note}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
        m.kind === "wrote"
          ? "border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/10"
          : m.kind === "about"
            ? "border-accent2/35 bg-accent2/5 text-accent2 hover:border-accent2 hover:bg-accent2/10"
            : "border-line text-zinc-300 hover:border-accent hover:text-accent"
      }`}
    >
      <span aria-hidden>{m.kind === "wrote" ? "✎" : m.kind === "about" ? "❝" : "✦"}</span>
      {m.label}
      <span className="font-mono text-[10px] text-muted">'{m.year.slice(2)}</span>
    </Link>
  ));

  return (
    // The print-era artefact `/ink` and `/read/$slug` exist to host — it
    // belongs in their world, not the engineering control room. `AmbientBackground`
    // (the starfield) is control-room decor, dropped here for the same reason
    // it's absent from `/ink` and `/read/$slug`: it would fight the sepia
    // ground instead of sitting behind it.
    <div className="ink-world min-h-screen">
      <main id="main-content" tabIndex={-1} className="section-y mx-auto max-w-6xl px-6">
        {/* Was `to="/" hash="writing"` — which sent you to the homepage doorway,
            not the world this page belongs to. The writing moved to /ink; the
            back link did not follow it. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/ink" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> The Ink
          </Link>
          {/* excelsior-missing-footer-and-switch: the only Ink-world leaf
              without this — and the one most often deep-linked (board
              cards, the loopdown cross-link, and the page-5 sign-off all
              land here with a ?year=&page=), so its one exit used to be
              this small back link. */}
          <WorldSwitch current="ink" />
        </div>

        {/* Deliberately smaller than a landing-page hero: this is a reader, so
            the furniture yields vertical space to the spread. */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent/70">// print, 2019–21</p>
          <h1 className="font-display mt-1.5 text-h2 font-bold tracking-tight">Excelsior</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            MANIT Bhopal's institute magazine, running since 1963. I was an English Editor on the 2019
            and 2020 editions and Joint Chief Editor on 2021. The sign-off is on{" "}
            <Link
              to="/excelsior"
              search={{ year: 2021, page: 5 }}
              className="text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
            >
              page 5 of '21
            </Link>
            . All {excelsiorEditions.reduce((n, e) => n + e.pages, 0)} pages are hosted here; the
            original PDFs stay with MANIT.
          </p>
        </div>

        {/* The pieces, as prose. This row comes FIRST because the page scans
            are the artefact, not the reading — the text is unselectable and
            invisible to search, and on a phone it is unusable. Read it here,
            then go look at the page it ran on. */}
        <div className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
          {/* heading-order: this page's only heading was the h1 above, so
              SiteFooter's own h3 columns (excelsior-missing-footer-and-switch)
              skipped straight from 1 to 3 — an axe violation the other three
              Ink-world leaves don't share because each already has an h2
              between its h1 and the footer. This line already read as a
              section label; it now IS one. */}
          <h2 className="kicker-accent">
            {/* countWord returns "Five", capitalised, and this sits mid-sentence. */}
            Rather read it? The {countWord(readable.length).toLowerCase()} I wrote, in full
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {readable.map((m) => (
              <Link
                key={m.readSlug}
                to="/read/$slug"
                params={{ slug: m.readSlug! }}
                className="rounded-full border border-accent/40 bg-accent/5 px-3.5 py-1.5 text-sm text-accent transition hover:border-accent hover:bg-accent/10"
              >
                {m.label} <span className="font-mono text-[10px] text-muted">'{m.year.slice(2)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* excelsior-mobile-fold-order: on a phone, the intro plus this row's
            ~14 chips used to run out the whole first fold before the
            flipbook appeared — on the one page whose stated reason for
            existing is "the page scans are the artefact". Below sm it's a
            closed disclosure so the flipbook sits near the fold; at sm and
            up, where the fold isn't the constraint, it's the plain row it
            always was. */}
        <details className="mt-4 sm:hidden">
          <summary className="cursor-pointer text-sm text-zinc-300 transition hover:text-accent">
            Jump to a page
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">{jumpChips}</div>
        </details>
        <div className="mt-4 hidden flex-wrap gap-2 sm:flex">{jumpChips}</div>

        <div className="mt-5">
          <Flipbook
            year={String(year)}
            page={page}
            marks={editionMarks}
            // viewTransition: false, because a page turn is not a route change
            // to look at. The router runs with defaultViewTransition on for the
            // shared-element moves (nav wordmark, project titles), and here that
            // meant every turn started a document-wide transition on top of the
            // leaf's own CSS 3D flip — two animations of the same event. Turn
            // faster than one completes and the browser skips it, which throws
            // "Transition was skipped": an uncaught error on every page turn,
            // and the only page error the whole site was still emitting.
            onYearChange={(y) => navigate({ search: { year: Number(y), page: 1 }, replace: true, viewTransition: false })}
            onPageChange={(p) => {
              const total = excelsiorEditions.find((e) => Number(e.year) === year)?.pages ?? p;
              writeProgress(String(year), p, total);
              navigate({ search: (s) => ({ ...s, page: p }), replace: true, viewTransition: false });
            }}
          />
        </div>
      </main>
      <FloatingChat />
      <SiteFooter />
    </div>
  );
}
