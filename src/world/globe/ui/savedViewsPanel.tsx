import { useRef, useState } from "react";
import { Bookmark, X } from "lucide-react";
import type { ShareState } from "../globeUrlState.ts";
import { decodeSavedViews, savedQuery, SAVED_VIEWS_KEY, SAVED_VIEWS_LIMIT, validSavedQuery, viewTimeLabel, type SavedView } from "./savedViews.ts";

const control = "min-h-11 min-w-11 rounded-lg border border-line px-3 text-sm hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const field = "min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export default function SavedViews({ capture, className }: { capture: () => ShareState; className: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function read(): SavedView[] | null {
    try {
      const result = decodeSavedViews(localStorage.getItem(SAVED_VIEWS_KEY));
      setViews(result.views);
      if (result.dropped) {
        setNotice("Invalid or outdated saved views were removed.");
        try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(result.views)); }
        catch { setNotice("Invalid or outdated saved views were removed from this list. Browser storage could not be updated."); }
      }
      return result.views;
    } catch {
      setNotice("Browser storage is unavailable. Changes cannot be saved here.");
      return null;
    }
  }

  function write(next: SavedView[], message: string) {
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
      setViews(next);
      setNotice(message);
      return true;
    } catch {
      setNotice("Could not save changes. Browser storage is blocked or full. Your saved views are unchanged.");
      return false;
    }
  }

  function save() {
    const current = read();
    if (!current) return;
    if (current.length >= SAVED_VIEWS_LIMIT) { setNotice("You have 20 saved views. Delete one before saving another."); return; }
    let query: string;
    try { query = savedQuery(capture()); }
    catch { setNotice("This view cannot be saved with its current settings."); return; }
    if (!validSavedQuery(query)) { setNotice("This view cannot be saved with its current settings."); return; }
    if (write([...current, { version: 1, id: crypto.randomUUID(), name: name.trim(), query }], "View saved on this browser.")) setName("");
  }

  async function share(view: SavedView) {
    const fresh = read()?.find(entry => entry.id === view.id);
    if (!fresh) return;
    const url = `${location.origin}${location.pathname}?${fresh.query}`;
    const webShare = window.innerWidth < 640 && typeof navigator.share === "function";
    try {
      if (webShare) await navigator.share({ title: fresh.name || "Saved globe view", url });
      else await navigator.clipboard.writeText(url);
      setNotice(webShare ? "Share sheet opened." : "Saved view link copied.");
    } catch { setNotice("Sharing unavailable or cancelled. Use Restore, then copy the address bar."); }
  }

  return <>
    <button type="button" title="Save this view" aria-label="Save this view" className={`${className} min-h-11 min-w-11`} onClick={() => {
      setNotice(""); setEditing(null); read(); dialog.current?.showModal(); dialog.current?.querySelector("input")?.focus();
    }}><Bookmark size={16} aria-hidden /></button>
    <dialog ref={dialog} onKeyDown={event => event.stopPropagation()} aria-label="Saved views" data-saved-views className="pointer-events-auto fixed inset-0 m-auto max-h-[85dvh] w-96 max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-line bg-ink p-5 font-body text-sm text-zinc-200 shadow-2xl backdrop:bg-black/70">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Keep a view</h2>
        <button type="button" aria-label="Close saved views" className={control} onClick={() => dialog.current?.close()}><X size={16} aria-hidden /></button>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-zinc-400">Only on this browser. Saves camera, layers, time and imagery settings. Restoring reloads the view and requests current sources.</p>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); save(); }}>
        <label className="block text-sm" htmlFor={className.includes("hidden") ? "saved-name-desktop" : "saved-name-phone"}>Name <span className="text-zinc-400">(optional)</span></label>
        <input id={className.includes("hidden") ? "saved-name-desktop" : "saved-name-phone"} autoFocus maxLength={80} placeholder="e.g. Night over the Pacific" value={name} onChange={event => setName(event.target.value)} className={field} />
        <button type="submit" className="min-h-11 w-full rounded-lg bg-accent px-3 text-sm font-medium text-ink hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Save view</button>
      </form>
      <p role="status" aria-live="polite" className="my-3 break-words text-sm text-accent">{notice}</p>
      <details open className="border-t border-line pt-2">
        <summary className="min-h-11 cursor-pointer rounded py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Saved views ({views.length}/20)</summary>
        <p className="mb-3 text-xs text-zinc-400">Past dates are viewing times, not a saved archive of live data.</p>
        {views.length === 0 && <p className="py-3 text-zinc-400">No saved views yet.</p>}
        <ul className="space-y-3">{views.map(view => <li key={view.id} className="rounded-xl border border-line p-3">
          {editing === view.id ? <form className="space-y-2" onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const current = read();
            if (current && write(current.map(v => v.id === view.id ? { ...v, name: String(form.get("name") ?? "").trim().slice(0, 80) } : v), "View renamed.")) setEditing(null);
          }}>
            <label className="block" htmlFor={`rename-${view.id}`}>New name</label>
            <input id={`rename-${view.id}`} name="name" maxLength={80} defaultValue={view.name} className={field} autoFocus />
            <div className="flex gap-2"><button className={control} type="submit">Update name</button><button className={control} type="button" onClick={() => setEditing(null)}>Cancel</button></div>
          </form> : <h3 className="break-words text-base font-semibold">{view.name || "Untitled view"}</h3>}
          <p className="my-2 text-xs font-mono text-zinc-400">{viewTimeLabel(view.query)}</p>
          {editing !== view.id && <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${control} text-accent`} onClick={() => {
              const current = read();
              const fresh = current?.find(v => v.id === view.id);
              if (fresh) location.assign(`${location.pathname}?${fresh.query}`);
            }}>Restore</button>
            <button type="button" className={control} onClick={() => { void share(view); }}>Share view</button>
            <button type="button" className={control} onClick={() => setEditing(view.id)}>Rename</button>
            <button type="button" className={control} onClick={() => {
              const current = read();
              if (current) write(current.filter(v => v.id !== view.id), "View deleted.");
            }}>Delete</button>
          </div>}
        </li>)}</ul>
      </details>
    </dialog>
  </>;
}
