import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReceiptRow } from "./sceneSummaryText.ts";

/** Native disclosure supplies keyboard/touch behavior without a second
 * sheet or persistent preference. On desktop it shares the presence footer;
 * opening upward keeps both the fact band and the topbar measurements stable. */
export default function SceneReceipt({ headline, imageryText, age, rows }: { headline: string; imageryText: string; age: string; rows: ReceiptRow[] }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [placement, setPlacement] = useState<CSSProperties | null>(null);
  useEffect(() => {
    const close = () => { if (disclosure.current) disclosure.current.open = false; };
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);
  const body = <div id="scene-receipt-details" data-scene-receipt-body tabIndex={0} role="region" aria-label="Viewing details" style={placement ?? undefined}
    onKeyDown={(event) => {
      if (placement && event.key === "Tab" && event.shiftKey) {
        event.preventDefault(); disclosure.current?.querySelector("summary")?.focus();
      }
    }} className={`max-h-60 overflow-y-auto border-t border-line px-3 py-3 font-body text-sm text-zinc-200 ${placement ? "fixed z-50 rounded-2xl border bg-ink shadow-xl" : "sm:hidden"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}>
      <p data-receipt-imagery className="break-words leading-relaxed">{imageryText.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) => /^\d{4}-\d{2}-\d{2}$/.test(part) ? <span key={index} data-receipt-date className="whitespace-nowrap font-mono">{part}</span> : part)}</p>
      {age && <p className="mt-1 font-mono text-xs text-zinc-300">{age}</p>}
      <p className="mt-2 text-xs text-zinc-300">Deep zoom tiles: loaded product and date are not reported.</p>
      <h3 className="mt-4 font-semibold">Enabled layers</h3>
      {rows.length === 0 ? <p className="mt-2 text-zinc-300">No overlays or layers enabled.</p> : <ul className="mt-2 space-y-3">
        {rows.map((row) => <li key={row.id} data-receipt-layer={row.id} data-available={row.available} className="border-l-2 border-line pl-3">
          <p className={row.available ? "font-medium" : "font-medium text-warn"}>{row.label}</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-zinc-300">{row.text}</p>
        </li>)}
      </ul>}
    </div>;
  return <details ref={disclosure} data-scene-receipt onToggle={(event) => {
    if (event.currentTarget.open && window.matchMedia("(min-width: 640px)").matches) {
      const rect = event.currentTarget.getBoundingClientRect();
      // Escape the fact band's scroll clipping. Measured on disclosure,
      // never per frame; resizing closes the card before it can drift.
      setPlacement({ left: rect.left, bottom: window.innerHeight - rect.top + 8, width: rect.width, maxHeight: Math.min(240, Math.max(0, rect.top - 24)) });
    } else setPlacement(null);
  }} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }} className="group relative mb-4 mr-14 max-w-2xl sm:absolute sm:bottom-0 sm:right-0 sm:mb-0 sm:w-80 rounded-2xl border border-line bg-ink/90 shadow-xl font-body text-sm text-zinc-200">
    <summary aria-controls="scene-receipt-details" onKeyDown={(event) => {
      if (placement && event.key === "Tab" && !event.shiftKey) {
        event.preventDefault(); document.getElementById("scene-receipt-details")?.focus();
      }
    }} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <span className="shrink-0 font-semibold text-accent">Viewing</span>
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{headline}</span>
      <span aria-hidden className="shrink-0 text-accent group-open:rotate-180">⌄</span>
    </summary>
    {placement ? createPortal(body, document.body) : body}
  </details>;
}
