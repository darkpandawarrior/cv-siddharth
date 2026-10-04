// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
import { Link } from "@tanstack/react-router";

export default function ArchivePlaque() {
  return <aside data-archive-plaque="world-v1" className="fixed bottom-4 left-4 z-50 max-w-xs rounded border border-line bg-ink/95 p-3 text-xs text-muted">
    <p>Archived 2026-10-04. This was the first world; the Sangam replaced it.</p>
    <Link to="/playground" search={{ world: undefined, at: undefined }} className="mt-2 inline-block text-accent underline">Back to the Sangam</Link>
  </aside>;
}
