import { useEffect, useRef } from "react";
import type { Selection } from "../globeStore.ts";

export default function GuideLightbox({ photos, index, onClose, onChange }: { photos: NonNullable<Selection["media"]>; index: number; onClose: () => void; onChange: (index: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (prior instanceof HTMLElement) prior.focus(); };
  }, []);
  const photo = photos[index];
  if (!photo) return null;
  return (
    <dialog ref={dialog} aria-label="Google Maps photo viewer" onCancel={onClose} onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); onChange((index + (event.key === "ArrowRight" ? 1 : -1) + photos.length) % photos.length);
      }
    }} style={{ maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 2rem)" }} className="fixed inset-0 m-auto max-h-full max-w-4xl rounded-2xl border border-line bg-ink p-4 text-zinc-100 shadow-xl backdrop:bg-black/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span>{index + 1} / {photos.length}</span>
        <button type="button" autoFocus onClick={onClose} className="min-h-11 min-w-11 rounded px-3 focus-visible:outline focus-visible:outline-accent">Close photo</button>
      </div>
      <img src={photo.src} alt={photo.alt} style={{ maxHeight: "calc(100vh - 14rem)" }} className="mx-auto max-w-full object-contain" />
      <p className="mt-2 text-sm">{photo.caption}</p>
      <div className="mt-2 flex justify-between gap-2">
        <button type="button" onClick={() => onChange((index - 1 + photos.length) % photos.length)} className="min-h-11 rounded px-3 focus-visible:outline focus-visible:outline-accent">Previous photo</button>
        <button type="button" onClick={() => onChange((index + 1) % photos.length)} className="min-h-11 rounded px-3 focus-visible:outline focus-visible:outline-accent">Next photo</button>
      </div>
    </dialog>
  );
}
