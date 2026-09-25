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

No entry has been archived yet. The first row (`world-v1`) lands with P3-07.
