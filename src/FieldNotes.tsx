import { PenLine } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fieldNotesFor } from "./data/connections.ts";

/**
 * "Field notes" chips: the writing series that grew out of a piece of work,
 * rendered wherever that work is shown. Renders nothing when a slug has no
 * related series, so it is safe to drop onto every card.
 *
 * Each chip carries its series as a hash, so twelve differently-labelled chips
 * on the homepage resolve to twelve places on /loopdown instead of all landing
 * on the same unfiltered index. The target is the series heading in
 * WritingView; TanStack does the scrolling, so there is no filter UI here.
 */
export function FieldNotes({ slug, className = "" }: { slug: string; className?: string }) {
  const notes = fieldNotesFor(slug);
  if (notes.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="kicker flex items-center gap-1">
        <PenLine size={10} /> field notes
      </span>
      {notes.map((n) => (
        <Link
          key={n.id}
          to="/loopdown"
          hash={`series-${n.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:text-zinc-100"
          style={{ borderColor: `${n.color}55` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: n.color }} />
          {n.title}
          <span className="text-[10px] text-muted">{n.episodes}</span>
        </Link>
      ))}
    </div>
  );
}
