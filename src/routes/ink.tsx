import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { WritingSection } from "../WritingSection.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { WorldSwitch } from "../WorldSwitch.tsx";
import { MarginNotes } from "../play/MarginNotes.tsx";
import { DeferredPlayRoom } from "../play/DeferredPlayRoom.tsx";

import { anthology, anthologyEntries } from "../data/anthology.ts";
import { boardArc } from "../data/beforeTheCode.ts";
/**
 * The Ink — the writing years, given their own world.
 *
 * These used to be a section three-quarters of the way down a 14,000px
 * homepage, wearing the same control-room skin as the Android work. Two
 * different lives should not share one scroll or one palette: this route is
 * `.ink-world` (sepia ground, cream text, ochre accent, display serif) and the
 * engineering half is spared ~4,000px of scroll it was carrying for content
 * that belongs somewhere else.
 */
export const Route = createFileRoute("/ink")({
  head: () => roomHead("/ink"),
  component: InkRoute,
});

function InkRoute() {
  return (
    <DeferredPlayRoom>
    <div className="ink-world min-h-screen">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> The Build
          </Link>
          <WorldSwitch current="ink" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="section-y mx-auto max-w-5xl px-6">
          <p className="kicker-accent">// before the code</p>
          <h1 className="font-display mt-3 text-hero">The Ink</h1>
          {/* The epigraph. This sentence spent its life as a caption under the
              EB Profiles grid, three screens down, summarising the three cards
              above it. It is not a caption: it is the throughline from a
              college magazine to a production codebase, and it ends on the
              only line here that is also a claim about the engineer. So it
              opens the world.

              Quoted from beforeTheCode.ts, not retyped. The profiles it
              describes are generated from that same file, and a hand-copied
              version of a sentence about them would drift the first time one
              of them was edited. */}
          <p className="font-display mt-6 max-w-3xl border-l-2 border-accent/50 pl-5 text-lg font-semibold leading-relaxed sm:text-xl">
            {boardArc}
          </p>

          {/* The Morkinstar Journals live on their own starmap page rather than
              this scroll, so a plain anchor here — not a typed Link — because
              that route ships separately and this file shouldn't have to know
              or care what order the two land in. */}
          <a
            href="/anthology"
            className="panel group mt-8 flex max-w-2xl items-center justify-between gap-4 p-5 transition hover:border-accent/50"
          >
            <p className="leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              <span className="font-display font-bold text-zinc-100">The Morkinstar Journals.</span>{" "}
              {/* Derived. This said "Twenty" and had been wrong since Season Three
                  shipped — the corpus is 34 entries across 3 seasons. A count typed
                  into a sentence beside the data that decides it always drifts. */}
              {anthologyEntries.length} pieces of framed short fiction across{" "}
              {anthology.seasons.length} seasons, a galactic field reporter filing what he finds
              until he stops filing.
            </p>
            <ArrowRight size={18} className="shrink-0 text-accent transition group-hover:translate-x-1" />
          </a>
        </div>
        <WritingSection />
        <div className="mx-auto max-w-5xl px-6">
          <MarginNotes pieceSlug="ink" />
        </div>
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
    </DeferredPlayRoom>
  );
}
