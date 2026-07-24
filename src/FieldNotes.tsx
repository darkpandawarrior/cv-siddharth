import { PenLine } from "lucide-react";
import { fieldNotesFor } from "./data/connections.ts";

/**
 * "Field notes" chips — the writing series that grew out of a piece of work,
 * rendered wherever that work is shown. Clicking lands on the Loopdown hub.
 * Renders nothing when a slug has no related series, so it's safe to drop
 * onto every card.
 */
export function FieldNotes({ slug, className = "" }: { slug: string; className?: string }) {
  const notes = fieldNotesFor(slug);
  if (notes.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        <PenLine size={10} /> field notes
      </span>
      {notes.map((n) => (
        <a
          key={n.id}
          href="#loopdown"
          onClick={(e) => { e.stopPropagation(); window.scrollTo({ top: 0 }); }}
          className="flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:text-zinc-100"
          style={{ borderColor: `${n.color}55` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: n.color }} />
          {n.title}
          <span className="text-[10px] text-zinc-500">{n.episodes}</span>
        </a>
      ))}
    </div>
  );
}
