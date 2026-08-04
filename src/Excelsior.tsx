import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Picture } from "./Picture.tsx";

/**
 * Excelsior — MANIT Bhopal's institute magazine, and the print half of the
 * "everything I wrote before I wrote code" lineage. Three editions on the
 * Editorial Board (2019–21), Joint Chief Editor on '21.
 *
 * The covers sit on a shelf and open like actual books: the front cover swings
 * on its spine (rotateY about the left edge) to reveal the spread behind it.
 * That is the whole point — a magazine credit rendered as a magazine, not as a
 * bullet. Clicking opens the credited spread full-size; "read all N pages"
 * goes to MANIT's own flipbook, which stays the canonical host (the PDFs are
 * 30–60 MB each, so this site links to them rather than re-hosting them).
 */

interface Edition {
  year: string;
  role: string;
  pages: number;
  cover: string;
  /** The spread this site can vouch for — where the masthead credit appears. */
  spread?: { src: string; alt: string; caption: string };
  flipbook: string;
  pdf: string;
}

const EXCELSIOR: Edition[] = [
  {
    year: "2021",
    role: "Joint Chief Editor",
    pages: 128,
    cover: "/excelsior/cover-2021.jpg",
    spread: {
      src: "/excelsior/spread-2021.jpg",
      alt: "Excelsior '21 page 5 — the editors' farewell letter, signed by Siddharth Pandalai as Joint Chief Editor.",
      caption: "Excelsior '21, p.5 — the sign-off. My last issue on the board.",
    },
    flipbook: "https://flip.manit.ac.in/",
    pdf: "https://flip.manit.ac.in/wp-content/uploads/2024/04/Excelsior-2021.pdf",
  },
  {
    year: "2020",
    role: "Editorial Board",
    pages: 0,
    cover: "/excelsior/cover-2020.jpg",
    flipbook: "https://flip.manit.ac.in/",
    pdf: "https://flip.manit.ac.in/wp-content/uploads/2024/04/Excelsior-2020.pdf",
  },
  {
    year: "2019",
    role: "Editorial Board",
    pages: 0,
    cover: "/excelsior/cover-2019.jpg",
    flipbook: "https://flip.manit.ac.in/",
    pdf: "https://flip.manit.ac.in/wp-content/uploads/2024/04/Excelsior-2019-.pdf",
  },
];

function EditionCard({ ed, onOpen }: { ed: Edition; onOpen: (e: Edition) => void }) {
  const openable = Boolean(ed.spread);
  return (
    <figure className="magazine">
      <div className="magazine-book">
        {/* The page behind the cover — what you see once the cover swings open.
            Only the '21 edition has a spread captured, so the rest reveal the
            shelf ground and simply lift. */}
        {ed.spread && <Picture src={ed.spread.src} alt="" className="magazine-inside" />}
        <div className="magazine-cover">
          <Picture src={ed.cover} alt={`Excelsior ${ed.year} cover`} className="h-full w-full object-cover" />
        </div>
      </div>
      <figcaption className="magazine-caption">
        <span className="font-display text-sm font-bold">Excelsior '{ed.year.slice(2)}</span>
        <span className="meta-row-tag">[&nbsp;{ed.role}&nbsp;]</span>
      </figcaption>
      {openable ? (
        <button type="button" onClick={() => onOpen(ed)} className="magazine-action">
          See the masthead <ArrowUpRight size={12} />
        </button>
      ) : (
        <a href={ed.pdf} target="_blank" rel="noreferrer" className="magazine-action">
          Read the PDF <ArrowUpRight size={12} />
        </a>
      )}
    </figure>
  );
}

export function ExcelsiorShelf() {
  const [open, setOpen] = useState<Edition | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Same focus contract the project lightbox uses: remember what opened this,
  // put focus on the close button, hand it back on the way out.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <div>
      <div className="magazine-shelf">
        {EXCELSIOR.map((ed) => (
          <EditionCard key={ed.year} ed={ed} onOpen={setOpen} />
        ))}
      </div>

      {open?.spread && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Excelsior ${open.year} masthead`}
          className="fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/95 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(null)}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 rounded-full border border-line bg-card p-2 text-zinc-300 transition hover:border-accent hover:text-accent"
          >
            <X size={18} />
          </button>
          <img
            src={open.spread.src}
            alt={open.spread.alt}
            onClick={(e) => e.stopPropagation()}
            className="lb-in max-h-[78vh] w-auto max-w-full rounded-lg border border-line object-contain"
          />
          <p className="mt-4 max-w-xl text-center text-sm text-zinc-400">{open.spread.caption}</p>
          <a
            href={open.flipbook}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:text-accent-dim"
          >
            Read all {open.pages} pages on MANIT's flipbook <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </div>
  );
}
