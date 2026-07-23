import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft, MessageCircle, FileText, Compass, PenLine, TerminalSquare } from "lucide-react";
import { projects } from "./data/profile.ts";
import { openChat } from "./FloatingChat.tsx";
import { BOOKS_BEFORE_BROS } from "./data/writingMeta.ts";

interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  keywords?: string;
  icon: React.ReactNode;
  run: () => void;
}

function goHash(href: string) {
  // In-page section anchors scroll natively on hash change; only route-style
  // hashes (#resume, #loopdown, #project/…) need the manual reset to top.
  const isSection = !!document.getElementById(href.slice(1));
  window.location.hash = href;
  if (!isSection) window.scrollTo({ top: 0 });
}

/**
 * Global ⌘K / Ctrl+K command palette — the "site is an environment" touch.
 * Folded into content: it only jumps to / opens things already on the page,
 * never gates anything. Keyboard-first (arrows + enter + esc), with a small
 * always-visible trigger button so it's reachable on mobile/touch too.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: "top", label: "Top / Hero", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#top") },
      { id: "work", label: "Case studies", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#work") },
      { id: "projects-section", label: "Projects", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#projects") },
      { id: "experience", label: "Experience", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#experience") },
      { id: "skills", label: "Skills", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#skills") },
      { id: "writing", label: "Writing", hint: "Jump", keywords: "loopdown blog lessons", icon: <PenLine size={15} />, run: () => goHash("#writing") },
      { id: "map", label: "The Storyboard", hint: "Jump", keywords: "constellation map connections", icon: <Compass size={15} />, run: () => goHash("#map") },
      { id: "lab", label: "The Signal Lab — GPS filter, live", hint: "Jump", keywords: "gps dead reckoning simulation demo", icon: <Compass size={15} />, run: () => goHash("#lab") },
      { id: "forge", label: "The Particle Forge — cursor-reactive swarm", hint: "Jump", keywords: "particles canvas physics interactive swarm wordmark", icon: <Compass size={15} />, run: () => goHash("#forge") },
      { id: "workshop", label: "The Workshop — every interactive room", hint: "Jump", keywords: "interactive demos playground index rooms explore", icon: <Compass size={15} />, run: () => goHash("#workshop") },
      { id: "source", label: "The Source — every public repo", hint: "Jump", keywords: "github repos code open source projects", icon: <TerminalSquare size={15} />, run: () => goHash("#source") },
      { id: "contact", label: "Contact", hint: "Jump", icon: <Compass size={15} />, run: () => goHash("#contact") },
      { id: "loopdown", label: "The Loopdown — full writing hub", hint: "Open", keywords: "writing blog field notes archive", icon: <PenLine size={15} />, run: () => goHash("#loopdown") },
      { id: "blueprint", label: "The Blueprint Room — infinite canvas", hint: "Open", keywords: "tldraw whiteboard map draw sketch", icon: <Compass size={15} />, run: () => goHash("#blueprint") },
      { id: "compose", label: "The Compose Playground — write Compose, live", hint: "Open", keywords: "jetpack compose kotlin android code editor playground live preview", icon: <TerminalSquare size={15} />, run: () => goHash("#compose") },
      { id: "terminal", label: "The Terminal — a faux shell you can type in", hint: "Open", keywords: "shell console cli command line easter egg bash", icon: <TerminalSquare size={15} />, run: () => goHash("#terminal") },
      {
        id: "books-before-bros",
        label: `${BOOKS_BEFORE_BROS.name} — the origin blog`,
        hint: "External",
        keywords: "wordpress blog essays fiction origin",
        icon: <PenLine size={15} />,
        run: () => window.open(BOOKS_BEFORE_BROS.url, "_blank", "noreferrer"),
      },
      { id: "resume", label: "Résumé", hint: "Open", icon: <FileText size={15} />, run: () => goHash("#resume") },
      {
        id: "chat",
        label: "Ask my AI assistant",
        hint: "Open chat",
        keywords: "sid ai assistant chatbot",
        icon: <MessageCircle size={15} />,
        run: () => openChat(),
      },
      ...projects
        .filter((p) => p.detail)
        .map((p) => ({
          id: `project-${p.slug}`,
          label: `Open project: ${p.name}`,
          hint: "Case study",
          keywords: `${p.tagline} ${p.stack.join(" ")}`,
          icon: <Compass size={15} />,
          run: () => goHash(`#project/${p.slug}`),
        })),
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [open]);

  // Guards against "phantom hover": if the palette opens with a list row
  // already under a stationary cursor, the browser can fire a mouseenter
  // there and steal the default activeIndex before the user moves the mouse.
  const suppressHoverRef = useRef(true);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      suppressHoverRef.current = true;
      const clear = () => {
        suppressHoverRef.current = false;
      };
      window.addEventListener("mousemove", clear, { once: true });
      // Focus after the entrance animation frame so iOS Safari doesn't eat it.
      requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.removeEventListener("mousemove", clear);
    }
  }, [open]);

  function runActive() {
    const cmd = filtered[activeIndex];
    if (!cmd) return;
    cmd.run();
    setOpen(false);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runActive();
    } else if (e.key === "Tab") {
      // Simple focus trap: the input is the only natively-focusable control
      // besides the list buttons, so keep Tab cycling inside the palette.
      e.preventDefault();
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Cmd+K)"
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
      >
        <Command size={13} />
        <span className="hidden sm:inline">⌘K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/80 px-4 pt-[12vh] backdrop-blur-md"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="palette-in glass-panel w-full max-w-lg overflow-hidden rounded-2xl"
            style={{ backgroundColor: "rgba(8, 11, 10, 0.97)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Command size={16} className="shrink-0 text-accent" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Jump to a section, open a project, or ask the AI…"
                aria-label="Command palette search"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-zinc-500 sm:block">esc</kbd>
            </div>
            <div ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  id={`cmd-${c.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => {
                    if (!suppressHoverRef.current) setActiveIndex(i);
                  }}
                  onClick={() => {
                    c.run();
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    i === activeIndex ? "bg-accent/15 text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  <span className={i === activeIndex ? "text-accent" : "text-zinc-500"}>{c.icon}</span>
                  <span className="flex-1">{c.label}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    {i === activeIndex && <CornerDownLeft size={12} />}
                    {c.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
