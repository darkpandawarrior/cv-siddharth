import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * "Find the page you half-remember" — a plain substring search over one
 * edition's OCR'd text, generated offline by `scripts/gen-excelsior-text.mjs`
 * and fetched lazily so the ~400 page bodies never ship as JS to every
 * visitor who opens the reader.
 *
 * Same dialog contract as `Flipbook.tsx`'s `ContactSheet`: `role="dialog"`,
 * focus the close button on open, Escape to close, hand focus back on the
 * way out.
 *
 * Best-effort, said as such in the UI. These are scanned magazine pages —
 * stylised mastheads, columns, pull quotes — not clean text, and OCR misses
 * things. This finds a page, it is not a transcript.
 */
type TextManifest = Record<string, string>;

export function ExcelsiorSearch({
  year,
  onPick,
  onClose,
}: {
  year: string;
  onPick: (page: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // null = still loading, "unavailable" = fetch failed or 404 (no manifest for
  // this edition yet — the search must degrade, not throw, when the generator
  // step was skipped).
  const [text, setText] = useState<TextManifest | "unavailable" | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    fetch(`/excelsior/text/${year}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TextManifest>) : Promise.reject(new Error("no manifest"))))
      .then((data) => { if (!cancelled) setText(data); })
      .catch(() => { if (!cancelled) setText("unavailable"); });
    return () => { cancelled = true; };
  }, [year]);

  // Array.prototype.filter + String.prototype.includes over at most ~150
  // short strings a render — no fuzzy-search dependency for a corpus this
  // size (ponytail: add one only if plain substring search misses too much
  // in practice).
  const hits = useMemo(() => {
    if (!text || text === "unavailable" || q.trim().length < 2) return [];
    const needle = q.trim().toLowerCase();
    return Object.entries(text).filter(([, body]) => body.includes(needle)).slice(0, 30);
  }, [text, q]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Search Excelsior ${year}`} className="flipbook-sheet">
      <div className="flipbook-sheet-bar">
        <p className="font-display text-sm font-bold">Search Excelsior '{year.slice(2)}</p>
        <button ref={closeRef} type="button" onClick={onClose} className="flipbook-tool" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="flipbook-search-body">
        {text === "unavailable" ? (
          <p className="flipbook-search-empty">Search isn't generated for this edition yet.</p>
        ) : (
          <>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search this issue…"
              aria-label={`Search Excelsior ${year}`}
              className="flipbook-search-input"
            />
            <p className="flipbook-search-note">
              Best-effort text from scanned pages, not a full transcript.
            </p>
            {hits.length > 0 && (
              <ul className="flipbook-search-results">
                {hits.map(([page, body]) => (
                  <li key={page}>
                    <button type="button" onClick={() => onPick(Number(page))} className="flipbook-search-result">
                      <span className="flipbook-search-result-page">Page {page}</span>
                      <span className="flipbook-search-result-snippet">{snippet(body, q)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && hits.length === 0 && text && (
              <p className="flipbook-search-empty">No matches on this edition's OCR text.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A short window of text around the first match, so a result reads as a
 *  sentence rather than a raw slab of column text. */
function snippet(body: string, q: string): string {
  const needle = q.trim().toLowerCase();
  const i = body.toLowerCase().indexOf(needle);
  if (i < 0) return body.slice(0, 80);
  const start = Math.max(0, i - 30);
  const end = Math.min(body.length, i + needle.length + 50);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}
