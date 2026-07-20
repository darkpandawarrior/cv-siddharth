import { PERSISTENCE_KEY } from "./blueprintData.ts";

/**
 * Wipe the locally-persisted whiteboard. tldraw keeps each `persistenceKey`
 * in its own IndexedDB database; if a stale or half-written snapshot is what's
 * blanking the canvas, deleting the DB and reloading rebuilds it from `seed()`.
 * We match defensively on name rather than hard-coding tldraw's internal
 * scheme, then reload.
 *
 * Deliberately dependency-free (no tldraw import) — both BlueprintRoom.tsx
 * (the crash-recovery boundary) and the lazy-loaded SketchBoard.tsx need this,
 * and BlueprintRoom.tsx must not pull tldraw into its own chunk just to offer
 * a reset button.
 */
export async function clearBlueprintPersistence(): Promise<void> {
  try {
    const anyIDB = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    const dbs = (await anyIDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .map((d) => d.name)
        .filter((n): n is string => !!n && (/tldraw/i.test(n) || n.includes(PERSISTENCE_KEY)))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    /* best effort — reload still gives the visitor a clean shot */
  }
}
