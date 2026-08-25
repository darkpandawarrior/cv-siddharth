import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command, CornerDownLeft, MessageCircle, Compass, PenLine, Target, TerminalSquare } from "lucide-react";
import { projects } from "./data/profile.ts";
import { SURFACES } from "./rooms.tsx";
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
/**
 * Extra search terms per route — the words a visitor types that the registry's
 * own label, tag and blurb do not contain.
 *
 * Deliberately additive and deliberately small. The labels and blurbs come from
 * surfaces.ts so they can never drift from the wall, the <head> or the
 * assistant; these are the search synonyms that would be noise in all three
 * ("tldraw", "tldr", "arcade"). A route with nothing here still matches on
 * everything the registry already says about it.
 */
const SURFACE_SYNONYMS: Record<string, string> = {
  "/map": "constellation connections graph storyboard",
  "/lab": "gps dead reckoning simulation demo signal kalman",
  "/forge": "particles swarm wordmark cursor",
  "/pulse": "stats counter dashboard analytics activity",
  "/playground": "demos index rooms explore hub arcade world street",
  "/loopdown": "blog field notes archive lessons hub",
  "/blueprint": "tldraw whiteboard draw sketch canvas ascii",
  "/compose": "jetpack kotlin android code editor preview recompose",
  "/terminal": "shell console cli command line easter egg bash",
  "/hire": "recruiter cv metrics contact summary tldr 90 seconds",
  "/resume": "cv download print pdf",
  "/chess": "lichess chess.com rating openings scandinavian blitz board hobby",
  "/weeb": "anime manga anilist watchlist seasons",
  "/ink": "writing editor magazine literary society",
  "/excelsior": "magazine manit institute pdf scan pages",
  "/shipped": "play store published apps install listing rating white label",
};

const SECTION_JUMPS: Record<SectionId, { label: string; keywords?: string; icon: React.ReactNode }> = {
  top: { label: "Top / Hero", icon: <Compass size={15} /> },
  fit: {
    label: "Fit check — paste a job description",
    keywords: "jd job description recruiter hiring role match score analyse analyze fit",
    icon: <Target size={15} />,
  },
  morph: {
    label: "One codebase, every form factor",
    keywords: "multiplatform kmp compose device phone foldable tablet desktop tv wasm live build responsive adaptive",
    icon: <Compass size={15} />,
  },
  work: { label: "Case studies", icon: <Compass size={15} /> },
  projects: { label: "Projects", icon: <Compass size={15} /> },
  source: { label: "The Source — every public repo", keywords: "github repos code open source projects", icon: <TerminalSquare size={15} /> },
  shipped: {
    label: "Apps you can install",
    keywords: "play store shipped published apps install listing rating white label",
    icon: <Compass size={15} />,
  },
  experience: { label: "Experience", icon: <Compass size={15} /> },
  // Replaces the "Chess — 18k games, mined" row, which jumped to this section
  // back when it was a chess teaser and kept jumping here after it became the
  // wall. The chess keywords move to the /chess row below, which is where they
  // were always going to be more useful.
  surfaces: {
    label: "Every surface — the whole site as a wall",
    keywords: "wall rooms surfaces explore index grid everything demo live",
    icon: <Compass size={15} />,
  },
  writing: { label: "Writing", keywords: "loopdown blog lessons", icon: <PenLine size={15} /> },
  skills: { label: "Skills", icon: <Compass size={15} /> },
  contact: { label: "Contact", icon: <Compass size={15} /> },
};

/**
 * Global ⌘K / Ctrl+K command palette — the "site is an environment" touch.
 * Folded into content: it only jumps to / opens things already on the page,
 * never gates anything. Keyboard-first (arrows + enter + esc), with a small
 * always-visible trigger button so it's reachable on mobile/touch too.
 *
 * This half owns only the open/closed bit and the global hotkey. Everything the
 * palette itself remembers — the query, the highlighted row — lives in
 * PaletteDialog below, which is mounted only while the palette is open. That
 * mount IS the reset: a freshly-opened palette gets fresh state because it is a
 * fresh component, rather than being opened stale and then scrubbed clean by an
 * effect one render later.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        // Leads with "Search" because that is the visible label below 640px,
        // and WCAG 2.5.3 requires the accessible name to contain the visible
        // one — "Open command palette (Cmd+K)" contained the desktop label
        // ("K", inside "Cmd+K") but not the mobile one, so this failed on
        // phones only. Both visible strings are substrings of this.
        aria-label="Search — open the command palette (Cmd+K)"
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
      >
        {/* The lucide Command icon IS the ⌘ glyph, so a literal "⌘K" beside it
            rendered as "⌘ ⌘K". Icon carries the modifier, text carries the key. */}
        <Command size={13} />
        <span className="sm:hidden">Search</span>
        <span className="hidden sm:inline">K</span>
      </button>

      {open && <PaletteDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The open palette: the overlay, the search field, the filtered list, and the
 * two pieces of state that only mean anything while it is up.
 *
 * Mounted only when open, so its lifetime is exactly one open→close cycle. The
 * focus bookkeeping that used to hang off `[open]` in the parent hangs off this
 * component's mount and unmount instead, which is the same two moments.
 */
function PaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Guards against "phantom hover": if the palette opens with a list row
  // already under a stationary cursor, the browser can fire a mouseenter
  // there and steal the default activeIndex before the user moves the mouse.
  // Starts suppressed on every open for free, because every open is a mount.
  const suppressHoverRef = useRef(true);

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
      // One row per route, from the registry. The Launcher's docstring says
      // "⌘K already reaches every surface — by name", and it did not: this was
      // eleven hand-written rows out of sixteen routes, missing /chess, /weeb,
      // /ink, /excelsior and /shipped entirely. You cannot search for a room
      // you do not know exists, and you could not search for these by name
      // either.
      ...SURFACES.map((s) => ({
        // Prefixed: three route slugs (`shipped`, `playground`, `resume`) also
        // name something already in this list, and two rows with one id is a
        // duplicate React key and an ambiguous option.
        id: `surface-${s.to.slice(1)}`,
        label: s.label,
        hint: "Open",
        keywords: `${s.tag} ${s.blurb} ${SURFACE_SYNONYMS[s.to] ?? ""}`,
        icon: <s.icon size={15} />,
        run: () => navigate({ to: s.to }),
      })),
      {
        id: "books-before-bros",
        label: `${BOOKS_BEFORE_BROS.name} — the origin blog`,
        hint: "External",
        keywords: "wordpress blog essays fiction origin",
        icon: <PenLine size={15} />,
        run: () => window.open(BOOKS_BEFORE_BROS.url, "_blank", "noreferrer"),
      },
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

  // The highlight is an index into `filtered`, so a new query means a new list
  // and the highlight has to go back to its top. Adjusted during render against
  // the previous query held in state — the pattern React documents for resetting
  // state when an input to it changes. The `useEffect(… , [query])` this
  // replaces committed the new list alongside the OLD highlight and corrected
  // itself one render later, so there was a frame where the highlighted row was
  // not the row Enter would run. Setting state during render instead makes React
  // re-run this component before painting anything, so list and highlight always
  // land in the same commit.
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    // Whichever control opened the palette (⌘K anywhere, the trigger button)
    // gets focus back once it closes — same pattern as FloatingChat.tsx.
    // Captured on mount, restored on unmount, which are the open and the close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const clear = () => {
      suppressHoverRef.current = false;
    };
    window.addEventListener("mousemove", clear, { once: true });
    // Focus after the entrance animation frame so iOS Safari doesn't eat it.
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener("mousemove", clear);
      previouslyFocused?.focus();
    };
  }, []);

  function runActive() {
    const cmd = filtered[activeIndex];
    if (!cmd) return;
    cmd.run();
    onClose();
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
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/80 px-4 pt-[12vh] backdrop-blur-md"
      onClick={onClose}
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
                onClose();
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
  );
}
