import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Grid3x3, X, Download } from "lucide-react";
import { excelsiorEditions, excelsiorPage } from "./data/excelsior.ts";

/**
 * The Excelsior reader — a real page-turning magazine, hosted here.
 *
 * MANIT's own flipbook is a WordPress plugin behind a lightbox; this is the
 * same 396 pages rendered to WebP and read on this site, so the work is one
 * click from the portfolio instead of three clicks into someone else's CMS.
 *
 * Layout follows how a magazine actually opens: page 1 alone (the cover), then
 * true spreads — 2|3, 4|5 — so facing pages that were designed as one artwork
 * land together. Turning animates a real sheet: the leaf rotates about the
 * spine with a front and a back face, and the next spread is already painted
 * underneath it.
 *
 * Only the pages near the current spread are ever in the DOM, so opening at
 * page 90 does not fetch the 89 before it.
 */

type Dir = "next" | "prev";

/** Spread n shows these page numbers. Spread 0 is the cover, alone. */
function pagesOf(spread: number, total: number): { left?: number; right?: number } {
  if (spread === 0) return { right: 1 };
  const left = spread * 2;
  const right = left + 1;
  return { left: left <= total ? left : undefined, right: right <= total ? right : undefined };
}

const lastSpread = (total: number) => Math.floor(total / 2);

export function Flipbook({
  // NOT 'initialYear'/'initialPage'. These are LIVE props: the jump chips and
  // the back button change them without remounting this component, and naming
  // them 'initial' is precisely what caused the reader to ignore them.
  year,
  page,
  onYearChange,
  onPageChange,
}: {
  year: string;
  page: number;
  onYearChange: (y: string) => void;
  onPageChange: (p: number) => void;
}) {
  const edition = excelsiorEditions.find((e) => e.year === year) ?? excelsiorEditions[0];
  const total = edition.pages;

  const [spread, setSpread] = useState(() => Math.min(Math.floor(page / 2), lastSpread(total)));
  const [flip, setFlip] = useState<{ dir: Dir; from: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // The URL is the source of truth for "which page am I on", so a spread the
  // reader lands on by turning is shareable and survives a refresh.
  useEffect(() => {
    const { left, right } = pagesOf(spread, total);
    onPageChange(left ?? right ?? 1);
  }, [spread, total, onPageChange]);

  // ...and the traffic goes the other way too. `spread` is seeded from the
  // `page` prop by a useState INITIALISER, which runs once per mount — but the
  // jump chips, a pasted link and the browser back button all change only the
  // search params, so this component never remounts and the initialiser never
  // re-runs. The result: the chip lit up, the year switched, and the reader
  // sat on page 1.
  //
  // The guard matters. The effect above writes the spread's first page back to
  // the URL, so syncing unconditionally would have the two effects fighting —
  // land on page 5, get rewritten to 4, sync back to 5, forever. Moving only
  // when the requested page is NOT already on screen breaks that loop, because
  // page 4 and page 5 are the same spread.
  useEffect(() => {
    const { left, right } = pagesOf(spread, total);
    if (page === left || page === right) return;
    setSpread(Math.min(Math.floor(page / 2), lastSpread(total)));
    setFlip(null); // a jump is a cut, not a turn — never animate it
    // `spread` is deliberately not a dependency: this reacts to the URL
    // changing, not to our own turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, total]);

  const go = useCallback(
    (dir: Dir) => {
      if (flip) return; // one turn at a time — queuing them looks like a glitch
      setSpread((s) => {
        const target = dir === "next" ? s + 1 : s - 1;
        if (target < 0 || target > lastSpread(total)) return s;
        setFlip({ dir, from: s });
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFlip(null), 620);
        return target;
      });
    },
    [flip, total],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go("next"); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go("prev"); }
      if (e.key === "Home") { e.preventDefault(); setSpread(0); }
      if (e.key === "End") { e.preventDefault(); setSpread(lastSpread(total)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, sheet, total]);

  // Reset to the cover when switching issues — spread 40 of one issue is not
  // spread 40 of another.
  const switchYear = (y: string) => {
    setSpread(0);
    setFlip(null);
    onYearChange(y);
  };

  const { left, right } = pagesOf(spread, total);
  const src = (n?: number) => (n ? excelsiorPage(edition.year, n) : undefined);

  // Prefetch the next spread so a turn never lands on a blank sheet.
  const prefetch = useMemo(() => {
    const out: string[] = [];
    for (const s of [spread + 1, spread - 1]) {
      if (s < 0 || s > lastSpread(total)) continue;
      const p = pagesOf(s, total);
      if (p.left) out.push(excelsiorPage(edition.year, p.left));
      if (p.right) out.push(excelsiorPage(edition.year, p.right));
    }
    return out;
  }, [spread, total, edition.year]);

  // The leaf that is mid-turn. Going forward it is the CURRENT right page
  // rotating away, whose back is the new left page; going back, the mirror.
  const leaf = flip
    ? flip.dir === "next"
      ? { front: pagesOf(flip.from, total).right, back: left, side: "right" as const }
      : { front: pagesOf(flip.from, total).left, back: right, side: "left" as const }
    : null;

  return (
    <div className="flipbook">
      <div className="flipbook-bar">
        <div className="flipbook-years">
          {excelsiorEditions.map((e) => (
            <button
              key={e.year}
              type="button"
              onClick={() => switchYear(e.year)}
              aria-pressed={e.year === edition.year}
              className={`flipbook-year ${e.year === edition.year ? "is-active" : ""}`}
            >
              '{e.year.slice(2)}
            </button>
          ))}
        </div>
        <p className="flipbook-counter" aria-live="polite">
          {left && right ? `${left}–${right}` : (left ?? right)} / {total}
        </p>
        <div className="flipbook-tools">
          <button type="button" onClick={() => setSheet(true)} className="flipbook-tool" aria-label="All pages">
            <Grid3x3 size={15} />
          </button>
          <a href={edition.source} target="_blank" rel="noreferrer" className="flipbook-tool" aria-label="Download the original PDF">
            <Download size={15} />
          </a>
        </div>
      </div>

      <div className="flipbook-stage">
        <button
          type="button"
          onClick={() => go("prev")}
          disabled={spread === 0}
          className="flipbook-nav flipbook-nav-prev"
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>

        <div className={`flipbook-book ${spread === 0 ? "is-cover" : ""}`}>
          <div className="flipbook-side flipbook-side-left">
            {src(left) && <img src={src(left)} alt={`Excelsior ${edition.year}, page ${left}`} className="flipbook-page" />}
          </div>
          <div className="flipbook-side flipbook-side-right">
            {src(right) && <img src={src(right)} alt={`Excelsior ${edition.year}, page ${right}`} className="flipbook-page" />}
          </div>

          {leaf && (
            <div className={`flipbook-leaf flipbook-leaf-${leaf.side} is-turning`} key={`${flip?.from}-${flip?.dir}`}>
              <div className="flipbook-leaf-face flipbook-leaf-front">
                {src(leaf.front) && <img src={src(leaf.front)} alt="" className="flipbook-page" />}
              </div>
              <div className="flipbook-leaf-face flipbook-leaf-back">
                {src(leaf.back) && <img src={src(leaf.back)} alt="" className="flipbook-page" />}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => go("next")}
          disabled={spread >= lastSpread(total)}
          className="flipbook-nav flipbook-nav-next"
          aria-label="Next page"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Warm the neighbours without putting them in the layout. */}
      <div className="sr-only" aria-hidden>
        {prefetch.map((p) => (
          <img key={p} src={p} alt="" />
        ))}
      </div>

      {sheet && (
        <ContactSheet
          year={edition.year}
          total={total}
          onPick={(p) => {
            setSpread(Math.min(Math.floor(p / 2), lastSpread(total)));
            setSheet(false);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}

/** Every page at once — the fastest way to find the thing you half-remember. */
function ContactSheet({
  year,
  total,
  onPick,
  onClose,
}: {
  year: string;
  total: number;
  onPick: (p: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`All pages of Excelsior ${year}`} className="flipbook-sheet">
      <div className="flipbook-sheet-bar">
        <p className="font-display text-sm font-bold">Excelsior '{year.slice(2)} — all {total} pages</p>
        <button ref={closeRef} type="button" onClick={onClose} className="flipbook-tool" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="flipbook-sheet-grid">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => onPick(n)} className="flipbook-thumb">
            <img src={excelsiorPage(year, n)} alt={`Page ${n}`} loading="lazy" />
            <span>{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
