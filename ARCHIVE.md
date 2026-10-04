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
`e2e/world-driving.spec.ts` exercises this entry point. Its corridor fallback,
list view and Reality ledger remain covered by the other three v1 world specs.
The file list comes from `ARCHIVED_V1_FILES` in `src/world/v2/carryOver.ts`.

The planned archive date is 2026-10-04, with review on 2027-04-04. The phase-3
ship gate must replace both dates and the markers if the actual deploy date
changes. P4-00 receives this section and the registry row (handoff H13), then
adds the other four hidden entry points and the archive plaque.

Removal recipe:

1. Remove `world=v1` validation in `src/routes/playground.tsx` and the v1
   branches and imports in `src/Playground.tsx`.
2. Remove the five entry points and the archive plaque completed by P4-00.
3. Confirm no active module imports a file in `ARCHIVED_V1_FILES`, then remove
   those files and update the carry-over manifest.
4. Remove the four v1 specs and any archive entry-point specs added by P4-00.
5. Remove the registry row, its markers and this section.
