import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Picture } from "./Picture.tsx";
import { excelsiorEditions } from "./data/excelsior.ts";

/**
 * Excelsior — MANIT Bhopal's institute magazine, and the print half of the
 * "everything I wrote before I wrote code" lineage. Three editions on the
 * Editorial Board (2019–21), Joint Chief Editor on '21.
 *
 * The covers sit on a shelf and open like actual books: the front cover swings
 * on its spine (rotateY about the left edge) to reveal the spread behind it.
 * That is the whole point — a magazine credit rendered as a magazine, not as a
 * bullet. From here you go into the reader at /excelsior, which hosts all 396
 * pages; MANIT keeps the original PDFs (30-60 MB each) and the reader links
 * out to them for anyone who wants the source file.
 */

interface Edition {
  year: string;
  /** Page count and MANIT's own PDF, straight off the generated manifest. */
  pages: number;
  source: string;
  role: string;
  cover: string;
  /** The spread this site can vouch for — where the masthead credit appears. */
  spread?: { src: string; alt: string; caption: string };
}

/**
 * What the manifest cannot know: which masthead seat he held that year, and
 * which spread this site has actually captured. Everything else on a card is
 * derived — the year and page count from gen-excelsior.mjs's output, the PDF
 * from the `source` it recorded, the cover from the file convention
 * (public/excelsior/cover-<year>.jpg) that Picture then resolves to its
 * avif/webp siblings.
 *
 * A hand-typed `pdf` used to sit beside the manifest's `source` saying the
 * same thing, and a `flipbook` field sat beside both with no reader at all.
 * Render a new edition and it appears here with a neutral role rather than
 * nothing.
 */
const EDITION_CHROME: Record<string, Pick<Edition, "role"> & Partial<Pick<Edition, "spread">>> = {
  "2021": {
    role: "Joint Chief Editor",
    spread: {
      src: "/excelsior/spread-2021.jpg",
      alt: "Excelsior '21 page 5 — the editors' farewell letter, signed by Siddharth Pandalai as Joint Chief Editor.",
      caption: "Excelsior '21, p.5 — the sign-off. My last issue on the board.",
    },
  },
  "2020": { role: "English Editor" },
  "2019": { role: "English Editor" },
};

const EXCELSIOR: Edition[] = excelsiorEditions.map((e) => {
  const chrome = EDITION_CHROME[e.year];
  return {
    ...e,
    ...chrome,
    cover: `/excelsior/cover-${e.year}.jpg`,
    // After the spread, not before it. Written the other way round the
    // fallback is dead for any year chrome names, which is what tsc -b was
    // reporting: "specified more than once, so this usage will be overwritten".
    role: chrome?.role ?? "Editorial Board",
  };
});

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
      {/* The whole issue is hosted here now — the shelf is the way in, not a
          teaser that hands you off to somebody else's site. */}
      <Link to="/excelsior" search={{ year: Number(ed.year), page: 1 }} className="magazine-action">
        Read all {ed.pages} pages <ArrowUpRight size={12} />
      </Link>
      {openable && (
        <button type="button" onClick={() => onOpen(ed)} className="magazine-action magazine-action-quiet">
          The masthead
        </button>
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
            href={open.source}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:text-accent-dim"
          >
            Read the original PDF at MANIT <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </div>
  );
}
