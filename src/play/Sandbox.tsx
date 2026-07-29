import { CanMoveElement, usePlayContext } from "@playhtml/react";
import { Undo2 } from "lucide-react";
import { usePulse } from "./pulse.ts";

/**
 * The sandbox — a bounded patch of the Playground where a fixed set of objects
 * can be dragged, and stay where you left them for whoever arrives next.
 *
 * This is the "real playground" bit, and it is deliberately *not* the room
 * cards. Two reasons those stayed put: dragging a thing that is also a
 * navigation link is a coin-flip between moving it and leaving the page, and
 * the card grid is responsive, so a position one visitor sets on a 27" display
 * is meaningless on a phone. Inside a fixed box with `bounds`, shared
 * coordinates mean the same thing to everyone, and there is nothing to break.
 *
 * The pieces are the stack the rest of the site talks about, so arranging them
 * is at least nominally about something.
 */

const PIECES = [
  { id: "kotlin", label: "Kotlin", tint: "#3ddc84", x: 4, y: 14 },
  { id: "compose", label: "Compose", tint: "#5ee6ff", x: 24, y: 46 },
  { id: "kmp", label: "KMP", tint: "#db61ff", x: 48, y: 16 },
  { id: "room", label: "Room", tint: "#f0883e", x: 68, y: 54 },
  { id: "coroutines", label: "Coroutines", tint: "#3ddc84", x: 12, y: 74 },
  { id: "hilt", label: "Hilt", tint: "#5ee6ff", x: 60, y: 80 },
  { id: "flow", label: "Flow", tint: "#db61ff", x: 84, y: 34 },
] as const;

const BOUNDS_ID = "cv-sandbox";
/* playhtml keys shared element data by capability tag + element id, and falls
 * back to React's useId() when a child has no id of its own. useId is stable
 * within a render tree but not across sessions or builds, so an id-less piece
 * would quietly lose its position every deploy. These ids are the primary key
 * of the shared document — renaming one orphans wherever that piece was left. */
const pieceDomId = (id: string) => `sandbox-${id}`;
const MOVE_TAG = "can-move";

function Piece({ piece }: { piece: (typeof PIECES)[number] }) {
  const bump = usePulse();
  return (
    <CanMoveElement bounds={`#${BOUNDS_ID}`}>
      <span
        id={pieceDomId(piece.id)}
        onPointerUp={() => bump("playground:move")}
        className="absolute cursor-grab touch-none select-none rounded-full border px-3 py-1.5 font-mono text-xs backdrop-blur active:cursor-grabbing"
        style={{
          left: `${piece.x}%`,
          top: `${piece.y}%`,
          borderColor: `${piece.tint}55`,
          background: `${piece.tint}14`,
          color: piece.tint,
        }}
      >
        {piece.label}
      </span>
    </CanMoveElement>
  );
}

export function Sandbox() {
  const { deleteElementData } = usePlayContext();
  const bump = usePulse();

  // Drops every piece's shared offset, which returns them all to the marks in
  // PIECES above — for everyone, since that offset is the shared state.
  const tidy = () => {
    for (const p of PIECES) deleteElementData(MOVE_TAG, pieceDomId(p.id));
    bump("playground:tidy");
  };

  return (
    <section className="mt-16" aria-labelledby="sandbox-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the sandbox</p>
          <h2 id="sandbox-heading" className="font-display text-2xl font-bold tracking-tight">
            Move things around
          </h2>
        </div>
        <button
          type="button"
          onClick={tidy}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-accent hover:text-accent"
        >
          <Undo2 size={12} /> tidy up
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Drag them wherever. They stay there — for you, and for whoever opens this page next.
      </p>

      <div
        id={BOUNDS_ID}
        className="relative mt-5 h-64 overflow-hidden rounded-2xl border border-line bg-card sm:h-72"
        style={{
          backgroundImage:
            "linear-gradient(rgba(61,220,132,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(61,220,132,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        {PIECES.map((p) => (
          <Piece key={p.id} piece={p} />
        ))}
      </div>
    </section>
  );
}
