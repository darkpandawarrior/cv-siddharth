import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, X } from "lucide-react";
import { wallSurfaces, type Surface } from "./data/surfaces.ts";
import { SURFACE_ICON } from "./rooms.tsx";

/**
 * The launcher — the homepage wall, available from anywhere.
 *
 * THE SHELL, AND WHY IT IS CHROME AND NOT A GATE. `docs/SIDOS-VISION.md` opens
 * by killing its own v1: "v1 gated everything behind a boot screen + 'launch an
 * app' — it *threw away* the wealth of real content. Killed." Its first
 * non-negotiable is "content-forward, never gated." So this is an overlay ON
 * TOP of a page that has already rendered everything it has to say, dismissed
 * with Escape or a click outside. Nothing is behind it, nothing waits for it,
 * and the page beneath it is complete whether it is ever opened or not.
 *
 * WHY IT IS NOT THE COMMAND PALETTE AGAIN. ⌘K already reaches every surface —
 * by name. That only helps someone who knows what to type, which is precisely
 * the visitor this site did not have: nine finished routes went unlinked for
 * months and a palette did nothing about it, because you cannot search for a
 * room you do not know exists. The wall fixed that on the homepage; this makes
 * the same grid reachable from inside a room, where the old chrome offered
 * "back to the hub" and nothing else.
 *
 * NO NEW GLOBAL KEYBINDING. ⌘K is the palette and backtick is the terminal;
 * a third would be one collision waiting to happen for an affordance whose
 * whole point is being visible. It opens from a button and closes with Escape.
 */

const OPEN_LAUNCHER_EVENT = "sid:open-launcher";

/** Open the launcher from anywhere — same CustomEvent idiom as openChat(). */
export function openLauncher() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_LAUNCHER_EVENT));
}

/** The control that opens it. Drop into any existing chrome. */
export function LauncherButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openLauncher()}
      aria-haspopup="dialog"
      className={`flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-zinc-400 transition hover:border-accent hover:text-accent ${className}`}
    >
      <LayoutGrid size={14} aria-hidden /> <span className="label-wide">Surfaces</span>
    </button>
  );
}

function Tile({ surface, current, onGo }: { surface: Surface; current: boolean; onGo: () => void }) {
  const Icon = SURFACE_ICON[surface.to];
  return (
    <Link
      to={surface.to}
      onClick={onGo}
      aria-current={current ? "page" : undefined}
      className={`group flex items-start gap-3 rounded-xl border p-3 transition ${
        current
          ? "border-accent/60 bg-accent/5"
          : "border-line bg-card hover:border-accent/40"
      }`}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
        style={{ borderColor: `${surface.tint}55`, color: surface.tint }}
      >
        {Icon && <Icon size={15} />}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-sm font-bold text-zinc-100 transition group-hover:text-accent">
          {surface.label}
          {current && <span className="kicker-accent ml-2">here</span>}
        </span>
        <span className="kicker mt-0.5 block">{surface.tag}</span>
      </span>
    </Link>
  );
}

export function Launcher() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Where the visitor is now, so the grid can say "here" instead of making
  // them work it out. Same source as everything else: the registry.
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LAUNCHER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LAUNCHER_EVENT, onOpen);
  }, []);

  // Escape closes, and focus lands on the close button when it opens — the
  // same escapable-and-don't-strand-focus contract the command palette, the
  // lightbox and the mobile drawer already keep.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Make the rest of the document inert while this is open.
   *
   * `aria-modal="true"` is a hint to assistive tech and nothing more: it does
   * not remove the page behind from the accessibility tree, and it does not
   * stop Tab walking straight out of the dialog into the route underneath.
   * `inert` does both, and it is why the first run of the launcher's own axe
   * test failed — with the backdrop dimming the page to 1.31:1, every heading
   * still in the tree behind the overlay reported a serious contrast
   * violation. Those elements are not the bug; scanning them at all was, and
   * the same gap let focus escape.
   *
   * Body children rather than a wrapper ref: the overlay is mounted in
   * __root.tsx as a sibling of the routed content, alongside AnomalyRail and
   * the skip link, so "everything that is not me" is exactly the right set.
   */
  useEffect(() => {
    if (!open) return;
    const mine = overlayRef.current;
    const others = ([...document.body.children] as HTMLElement[]).filter((el) => el !== mine);
    const previous = others.map((el) => el.inert);
    for (const el of others) el.inert = true;
    return () => {
      others.forEach((el, i) => { el.inert = previous[i]; });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-void/80 p-4 backdrop-blur-sm sm:p-8"
      // A click on the backdrop dismisses; a click inside must not. Comparing
      // against the container itself is enough and needs no stopPropagation
      // sprinkled through the tiles.
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      ref={overlayRef}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="launcher-title"
        className="my-auto w-full max-w-4xl rounded-2xl border border-line bg-ink/95 p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="launcher-title" className="font-display text-lg font-bold text-zinc-100">
              Every surface
            </h2>
            <p className="kicker mt-0.5">
              ⌘K searches · this shows what exists
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full border border-line p-2 text-zinc-400 transition hover:border-accent hover:text-accent"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-5">
          {wallSurfaces.map((group) => (
            <section key={group.group} aria-labelledby={`launcher-${group.group}`}>
              <h3
                id={`launcher-${group.group}`}
                className="kicker mb-2"
              >
                {group.label}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((s) => (
                  <Tile key={s.to} surface={s} current={s.to === pathname} onGo={() => setOpen(false)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
