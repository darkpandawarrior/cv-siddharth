import { PenLine, Network } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fieldNotesFor } from "./data/connections.ts";
import { systemStripFor } from "./data/systemStrip.ts";

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

/**
 * "In the system": built on · feeds · ships to · written up in — read
 * straight from systemGraph.ts, so a project's connections page can't drift
 * from the graph that also draws /map. Renders nothing when a slug has no
 * groups, same contract as FieldNotes above.
 */
export function SystemStrip({ slug, className = "" }: { slug: string; className?: string }) {
  const groups = systemStripFor(slug);
  if (groups.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {groups.map((g) => (
        <div key={g.kind} className="flex flex-wrap items-center gap-1.5">
          <span className="kicker flex items-center gap-1">
            <Network size={10} /> {g.label}
          </span>
          {g.items.map((item) => {
            const chip = "rounded-full border border-line bg-card/60 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:text-zinc-100";
            if (item.url?.startsWith("/")) {
              const [to, hash] = item.url.split("#");
              return (
                <Link key={item.id} to={to} hash={hash} onClick={(e) => e.stopPropagation()} className={chip}>
                  {item.label}
                </Link>
              );
            }
            if (item.url) {
              return (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={chip}>
                  {item.label}
                </a>
              );
            }
            return (
              <span key={item.id} className={chip}>
                {item.label}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
