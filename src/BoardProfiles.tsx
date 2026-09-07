import { Link } from "@tanstack/react-router";
import { boardProfiles } from "./data/beforeTheCode.ts";

/**
 * The EB Profiles grid: one card per Editorial Board year, each a teammate's
 * in-character answer about him, linking through to the scanned page it came
 * from.
 *
 * Extracted out of WritingSection so the homepage's own EB Profiles section
 * (so-p1-soul-surfaced, App.tsx's `EbProfiles`) and /ink's full write-up
 * render the identical cards from one component instead of two copies of the
 * same JSX drifting apart. Each caller supplies its own heading and intro
 * paragraph — the framing differs by room, the cards don't.
 */
export function BoardProfilesGrid() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      {boardProfiles.map((p) => (
        <Link
          key={p.year}
          to="/excelsior"
          search={{ year: Number(p.year), page: p.page }}
          className="card-elevated group flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-accent2/50"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-sm font-bold text-accent2">{p.title}</span>
            <span className="font-mono text-[10px] text-muted">'{p.year.slice(2)}</span>
          </div>
          <p className="kicker mt-1">{p.role}</p>
          <p className="mt-3 text-xs italic text-muted">Q: {p.question}</p>
          <blockquote className="mt-2 grow text-sm leading-relaxed text-zinc-300">"{p.quote}"</blockquote>
          <p className="mt-3 font-mono text-[11px] text-muted">
            ~「{p.direction}」~{p.gloss ? ` · ${p.gloss}` : ""}
          </p>
          {/* The card has always linked to the scan; nothing said so, so the
              one thing that could verify these quotes was an invisible
              affordance. Not a nested <a> — the whole card is already the
              link. */}
          <span className="kicker mt-4 transition group-hover:text-accent2">
            Excelsior &rsquo;{p.year.slice(2)} · page {p.page} &rarr;
          </span>
        </Link>
      ))}
    </div>
  );
}
