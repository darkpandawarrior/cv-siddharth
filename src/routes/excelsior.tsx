import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { AmbientBackground } from "../AmbientBackground.tsx";
import { Flipbook } from "../Flipbook.tsx";
import { excelsiorEditions } from "../data/excelsior.ts";
import { excelsiorMarks } from "../data/excelsiorMarks.ts";
import { FloatingChat } from "../FloatingChat.tsx";

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
  ssr: false,
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

  return (
    <div className="min-h-screen">
      <AmbientBackground />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-8">
        {/* Was `to="/" hash="writing"` — which sent you to the homepage doorway,
            not the world this page belongs to. The writing moved to /ink; the
            back link did not follow it. */}
        <Link to="/ink" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
          <ArrowLeft size={16} /> The Ink
        </Link>

        {/* Deliberately smaller than a landing-page hero: this is a reader, so
            the furniture yields vertical space to the spread. */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent/70">// print, 2019–21</p>
          <h1 className="font-display mt-1.5 text-h2 font-bold tracking-tight">Excelsior</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            MANIT Bhopal's institute magazine, running since 1963. I was an English Editor on the 2019
            and 2020 editions and Joint Chief Editor on 2021 — the sign-off is on{" "}
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

        {/* The pieces, as prose. This row comes FIRST because 396 page images
            are the artefact, not the reading — the text is unselectable and
            invisible to search, and on a phone it is unusable. Read it here,
            then go look at the page it ran on. */}
        <div className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">
            Rather read it? The five I wrote, in full
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {excelsiorMarks
              .filter((m) => m.readSlug)
              .map((m) => (
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

        {/* Jump to a page in the scan itself. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {excelsiorMarks.map((m) => (
            <Link
              key={`${m.year}-${m.page}`}
              to="/excelsior"
              search={{ year: Number(m.year), page: m.page }}
              replace
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
          ))}
        </div>

        <div className="mt-5">
          <Flipbook
            year={String(year)}
            page={page}
            onYearChange={(y) => navigate({ search: { year: Number(y), page: 1 }, replace: true })}
            onPageChange={(p) => navigate({ search: (s) => ({ ...s, page: p }), replace: true })}
          />
        </div>
      </main>
      <FloatingChat />
    </div>
  );
}
