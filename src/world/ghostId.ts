/**
 * The ghost billboard's 6-char id — split out of Ghosts.tsx so it can be
 * unit-tested directly. Ghosts.tsx imports `@playhtml/react`, which reads
 * `document` at module load (see pulse.test.ts's own comment on the
 * identical trap: vitest runs this project under `environment: "node"`, so
 * importing a file that pulls in `@playhtml/react` crashes on the import
 * line before a single assertion runs) — this file imports nothing.
 */

/** A stable, glanceable 6-char id from the peer's own (much longer, opaque)
 *  presence key — deterministic per identity, so nothing here needs to hand
 *  out or remember a separate id scheme of its own. */
export function shortId(peerKey: string): string {
  return peerKey
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase()
    .padEnd(6, "0");
}
