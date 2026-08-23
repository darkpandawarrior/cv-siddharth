import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { roomHead } from "../lib/routeHead.ts";
import { WritingSection } from "../WritingSection.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { SiteFooter } from "../SiteFooter.tsx";
import { WorldSwitch } from "../WorldSwitch.tsx";

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
    <div className="ink-world min-h-screen">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-zinc-300 transition hover:text-accent">
            <ArrowLeft size={16} /> The Build
          </Link>
          <WorldSwitch current="ink" />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="section-y mx-auto max-w-5xl px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-accent/80">// before the code</p>
          <h1 className="font-display mt-3 text-hero">The Ink</h1>
          <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
            Three years of a college magazine, a literary society, and everything I wrote before I
            wrote software. It reads differently because it was a different life.
          </p>

          {/* The Morkinstar Journals live on their own starmap page rather than
              this scroll, so a plain anchor here — not a typed Link — because
              that route ships separately and this file shouldn't have to know
              or care what order the two land in. */}
          <a
            href="/anthology"
            className="group mt-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5 transition hover:border-accent/50"
          >
            <p className="leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
              <span className="font-display font-bold text-zinc-100">The Morkinstar Journals.</span> Twenty
              pieces of framed short fiction, a galactic field reporter filing what he finds until he
              stops filing.
            </p>
            <ArrowRight size={18} className="shrink-0 text-accent transition group-hover:translate-x-1" />
          </a>
        </div>
        <WritingSection />
      </main>
      <SiteFooter />
      <FloatingChat />
    </div>
  );
}
