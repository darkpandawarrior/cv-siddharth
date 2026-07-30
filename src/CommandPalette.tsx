import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command, CornerDownLeft, MessageCircle, FileText, Compass, PenLine, Target, TerminalSquare } from "lucide-react";
import { projects } from "./data/profile.ts";
import { openChat } from "./FloatingChat.tsx";
import { BOOKS_BEFORE_BROS } from "./data/writingMeta.ts";
import { useSectionNav, SECTION_ID_LIST, type SectionId } from "./lib/navigation.ts";

interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  keywords?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Jump entries for the home-page sections, keyed by section id.
 *
 * `Record<SectionId, …>` is the point: the palette's rows used to be a
 * hand-written list that had to be kept in step with `SECTION_ID_LIST` by
 * hand, and it silently lacked a `chess` row. Typing it as a total record makes
 * omitting a section a **compile error**, and rendering it by mapping
 * `SECTION_ID_LIST` means the palette follows the page's own scroll order
 * rather than keeping a second opinion about it.
 */
const SECTION_JUMPS: Record<SectionId, { label: string; keywords?: string; icon: React.ReactNode }> = {
  top: { label: "Top / Hero", icon: <Compass size={15} /> },
  fit: {
    label: "Fit check — paste a job description",
    keywords: "jd job description recruiter hiring role match score analyse analyze fit",
    icon: <Target size={15} />,
  },
  work: { label: "Case studies", icon: <Compass size={15} /> },
  projects: { label: "Projects", icon: <Compass size={15} /> },
  experience: { label: "Experience", icon: <Compass size={15} /> },
  skills: { label: "Skills", icon: <Compass size={15} /> },
  writing: { label: "Writing", keywords: "loopdown blog lessons", icon: <PenLine size={15} /> },
  chess: {
    label: "Chess — 18k games, mined",
    keywords: "chess lichess chess.com rating openings scandinavian blitz board games hobby",
    icon: <Compass size={15} />,
  },
  source: { label: "The Source — every public repo", keywords: "github repos code open source projects", icon: <TerminalSquare size={15} /> },
  contact: { label: "Contact", icon: <Compass size={15} /> },
};

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
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const navigate = useNavigate();
  const { goToSection } = useSectionNav();

  const commands = useMemo<PaletteCommand[]>(
    () => [
      // One row per home-page section, in the page's own order. Adding a
      // section to SECTION_ID_LIST without a SECTION_JUMPS entry won't compile.
      ...SECTION_ID_LIST.map((id) => ({
        // "projects" would collide with the per-project rows appended below,
        // which use `project-<slug>`; the original hand-written list dodged
        // this with a bespoke "projects-section" id, kept here.
        id: id === "projects" ? "projects-section" : id,
        hint: "Jump",
        ...SECTION_JUMPS[id],
        run: () => goToSection(id),
      })),
      { id: "map", label: "The Storyboard", hint: "Jump", keywords: "constellation map connections", icon: <Compass size={15} />, run: () => navigate({ to: "/map" }) },
      { id: "lab", label: "The Signal Lab — GPS filter, live", hint: "Jump", keywords: "gps dead reckoning simulation demo", icon: <Compass size={15} />, run: () => navigate({ to: "/lab" }) },
      { id: "forge", label: "The Particle Forge — cursor-reactive swarm", hint: "Jump", keywords: "particles canvas physics interactive swarm wordmark", icon: <Compass size={15} />, run: () => navigate({ to: "/forge" }) },
      { id: "pulse", label: "The Pulse — what visitors actually touch", hint: "Open", keywords: "stats counter dashboard analytics interactions live activity", icon: <Compass size={15} />, run: () => navigate({ to: "/pulse" }) },
      { id: "playground", label: "The Playground — every interactive room", hint: "Open", keywords: "interactive demos playground index rooms explore hub arcade", icon: <Compass size={15} />, run: () => navigate({ to: "/playground" }) },
      { id: "loopdown", label: "The Loopdown — full writing hub", hint: "Open", keywords: "writing blog field notes archive", icon: <PenLine size={15} />, run: () => navigate({ to: "/loopdown" }) },
      { id: "blueprint", label: "The Blueprint Room — infinite canvas", hint: "Open", keywords: "tldraw whiteboard map draw sketch", icon: <Compass size={15} />, run: () => navigate({ to: "/blueprint" }) },
      { id: "compose", label: "The Compose Playground — write Compose, live", hint: "Open", keywords: "jetpack compose kotlin android code editor playground live preview", icon: <TerminalSquare size={15} />, run: () => navigate({ to: "/compose" }) },
      { id: "terminal", label: "The Terminal — a faux shell you can type in", hint: "Open", keywords: "shell console cli command line easter egg bash", icon: <TerminalSquare size={15} />, run: () => navigate({ to: "/terminal" }) },
      {
        id: "books-before-bros",
        label: `${BOOKS_BEFORE_BROS.name} — the origin blog`,
        hint: "External",
        keywords: "wordpress blog essays fiction origin",
        icon: <PenLine size={15} />,
        run: () => window.open(BOOKS_BEFORE_BROS.url, "_blank", "noreferrer"),
      },
      { id: "resume", label: "Résumé", hint: "Open", icon: <FileText size={15} />, run: () => navigate({ to: "/resume" }) },
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
          run: () => navigate({ to: "/project/$slug", params: { slug: p.slug } }),
        })),
    ],
    [navigate, goToSection],
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
      // Whichever control opened the palette (⌘K anywhere, the trigger button)
      // gets focus back once it closes — same pattern as FloatingChat.tsx.
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      const clear = () => {
        suppressHoverRef.current = false;
      };
      window.addEventListener("mousemove", clear, { once: true });
      // Focus after the entrance animation frame so iOS Safari doesn't eat it.
      requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.removeEventListener("mousemove", clear);
    }
    previouslyFocusedRef.current?.focus();
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
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
      >
        <Command size={13} />
        <span className="sm:hidden">Search</span>
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
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder-muted outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">esc</kbd>
            </div>
            <div ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No matches.</p>}
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
                  <span className={i === activeIndex ? "text-accent" : "text-muted"}>{c.icon}</span>
                  <span className="flex-1">{c.label}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
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
