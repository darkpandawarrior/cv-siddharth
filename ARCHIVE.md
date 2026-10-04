# Archive policy

Superseded but kept means archived behind at least one easter egg, never
silently kept and never silently deleted. Every touchpoint that a row covers
carries the marker below, verbatim, so a future refactor finds it without
reading history. `registry.test.ts` checks that every marker has a row and
every row is real; it never looks at today's date. The doctor (SH-4) is what
flags a row whose `reviewBy` has passed. Removal then follows the row's
`removal` recipe exactly, with no fresh analysis.

## Marker format

```
// ponytail: archive(<id>) until <reviewBy>; removal recipe in ARCHIVE.md#<id>
```

`<id>` matches an entry in `src/archive/registry.ts` (`ARCHIVE`), and
`<reviewBy>` (`YYYY-MM-DD`) must equal that entry's `reviewBy`.

## Rows

<a id="world-v1"></a>
### world-v1

The first drivable Night Survey world stays reachable at `/playground?world=v1`.
The five hidden entrances are the quiet URL; terminal commands `git checkout v1`
and `cd ~/world/v1`; the exact palette query `night survey`; the Konami sequence
inside the Sangam; and a two second upstream hold within four metres of the
river source spring. `e2e/archive-v1.spec.ts` names and checks each entrance.
Neither terminal command appears in help. The palette query `night` shows no
archive entry. The spring is excluded from the landmark list, shared paths
and tour stops.

The archive plaque carries 2026-10-04. Review is due on 2027-04-04.
The file list comes from `ARCHIVED_V1_FILES` in `src/world/v2/carryOver.ts`.
Shared modules in that manifest remain live and are never archived.
The four v1 specs continue to use `/playground?world=v1`.

Removal recipe:

1. Remove `world=v1` validation in `src/routes/playground.tsx` and the v1
   branches and imports in `src/Playground.tsx`.
2. Remove the five entry points and the archive plaque completed by P4-00.
3. Confirm no active module imports a file in `ARCHIVED_V1_FILES`, then remove
   those files and update the carry-over manifest.
4. Remove the four v1 specs and any archive entry-point specs added by P4-00.
5. Remove the registry row, its markers and this section.

6. Remove `src/world/v2/layers/ArchiveGate.tsx`,
   `src/world/v2/hud/KonamiArchive.tsx`, `src/world/ArchivePlaque.tsx`,
   `src/world/v2/archiveGate.ts` and its unit test.
7. Remove only the marked source-spring arrival expressions and imports in
   `src/world/v2/WorldV2.tsx` and `src/world/v2/Hodi.tsx`. Keep the ordinary
   landmark arrival logic. Remove the hidden search target in the route.
8. Remove the marked terminal and palette blocks and
   `e2e/archive-v1.spec.ts`.

`src/Playground.tsx` passes to SP-20 for its header block only (handoff H15).
