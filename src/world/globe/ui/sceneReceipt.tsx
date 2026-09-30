import type { ReceiptRow } from "./sceneSummaryText.ts";

/** Native disclosure supplies keyboard/touch behavior without a second
 * sheet or persistent preference. Collapsed is one line at every width. */
export default function SceneReceipt({ headline, imageryText, age, rows }: { headline: string; imageryText: string; age: string; rows: ReceiptRow[] }) {
  return <details data-scene-receipt className="group mb-4 mr-14 max-w-2xl sm:mr-0 rounded-2xl border border-line glass-panel font-body text-sm text-zinc-200">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <span className="shrink-0 font-semibold text-accent">Viewing</span>
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{headline}</span>
      <span aria-hidden className="shrink-0 text-accent group-open:rotate-180">⌄</span>
    </summary>
    <div data-scene-receipt-body tabIndex={0} aria-label="Viewing details" className="max-h-60 overflow-y-auto border-t border-line px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
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
    </div>
  </details>;
}
