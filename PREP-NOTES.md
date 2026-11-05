# World v2 ship preparation

Branch: `feat/world-v2-ship-prep`.
Wave HEAD: `6afa97248d014ef6f21c549399fb1f9cdd11a6eb`.
Merge input: `77382ac80d836c4c67922db743e2348df1d25b27` (`MERGE_HEAD`, origin/main).

Content resolution is complete. The Git index still contains 12 unmerged paths. This lane ran no Git write commands. The parent must stage the resolutions and finish the merge; no merge commit exists yet.

## Conflict resolutions (merge commit group)

- `src/FloatingChat.tsx`: retain the wave's token-based text size and main's updated assistant description.
- `src/Playground.tsx`: keep main's comment cleanup; retain the wave's Sangam default, lazy capability shell, explicit-entry gate and v1 rollback.
- `src/Terminal.tsx`: retain main's existing claim value and the wave's token-based class syntax; author no new claim wording.
- `src/archive/registry.ts`: keep the wave's populated v1 archive registry; main's empty registry was a placeholder for this feature.
- `src/data/repoStats.ts`: take main's generated file exactly; do not regenerate it in this lane.
- `src/hero-studio.css`: keep main's bounded project heading scale to prevent long project names overflowing. The separate hero fixes below add further hunks here.
- `src/routes/playground.tsx`: keep the wave's validated v1 rollback and at destination, share image, and SSR shell. Sangam is now the default, so main's old preview-only v2 switch is obsolete; explicit world=v2 still reaches Sangam through that default.
- `src/spine/registry.ts`: keep the wave's ops banner normal-flow contract, matching the existing !static banner; discard main's obsolete sticky-banner debt explanation.
- `src/world/AltitudeRail.test.tsx`: retain wave imports for lifecycle cleanup and ReactElement; discard main's obsolete test-discovery warning.
- `src/world/AltitudeRail.tsx`: retain the wave's directional route-snapshot implementation and concise description; main's transition explanation describes the superseded implementation.
- `src/world/v2/Terrain.tsx`: retain the shared Heightmap input and sampler; remove main's duplicate local heightmap load. Main's tier-dependent mesh/material budgets remain, and the shared loader retains HTTP error handling.
- `src/world/v2/WorldV2.tsx`: retain wave lighting, shared terrain sampling for spawn, replay store, XR tier and registered layers. Main's deviceTier/software-renderer implementation remains in the merged tree; remove the obsolete warning about a missing terrain sampler.

## Separate fix groups

- `/ops` overflow: `src/index.css`, only `.ops-verified` and `.chip-evidence` hunks. Permit wrapping and shrink inline evidence chips inside the fixed verified column instead of overflowing the document.
- Mobile first fold: `src/index.css` mobile launcher/header hunks and body comment; `src/hero-studio.css` mobile spacing hunk. Remove the extra utility-row reservation; put compact 44px search/chat launchers beside the header nav. The shared `.chat-launcher` selector covers both eager and panel-owned launchers.
- Hero stat chips: `src/App.tsx` and `.hero-studio-stats` in `src/hero-studio.css`. Render the existing monthly-user, Compose and Play Store records verbatim. Split the existing introduction after its first sentence; preserve the remainder in Platform background. Claim source files remain untouched. The Play Store chip preserves the existing rating turnaround wording; review counts remain in its existing detail tooltip.
- Budget accounting: `scripts/check-budget.mjs`. Keep `budgets.json` unchanged at 31,719,424 bytes. Include the newly generated evidence-budget.json in total deployed bytes and replace any previous report without double counting. Preserve failed-budget evidence publication.
- Report: `PREP-NOTES.md`.

The parent must separate shared-file hunks: `src/hero-studio.css` contains both conflict resolution and visual fixes; `src/index.css` contains both overflow and mobile fixes. All other pre-existing staged merge changes belong to the parent merge, not to these review fixes.

## Verification

`npm ci` (node_modules was absent): exit 0. Output tail:

```text
added 1130 packages, and audited 1131 packages in 2m

241 packages are looking for funding
  run `npm fund` for details

38 vulnerabilities (2 low, 15 moderate, 19 high, 2 critical)
```

Postinstall installed the local cv-gate shims. npm also reported blocked install scripts for fsevents@2.3.3 and fsevents@2.3.2; no approval or bypass was attempted.

`npx tsc --noEmit -p tsconfig.app.json`: exit 0. Complete output:

```text
npm notice run cv-siddharth@1.0.0 npx
npm notice run 'tsc' --noEmit -p tsconfig.app.json
```

`npx tsc --noEmit -p tsconfig.node.json`: exit 0. Complete output:

```text
npm notice run cv-siddharth@1.0.0 npx
npm notice run 'tsc' --noEmit -p tsconfig.node.json
```

Explicit projects are necessary: the root tsconfig has files: [] and project references; a bare noEmit invocation would not check the application sources.

`npm run lint`: exit 0. Output tail (verbatim):

```text
✖ 288 problems (0 errors, 288 warnings)
  0 errors and 6 warnings potentially fixable with the `--fix` option.
```

The lint output contained 2,337 lines; tool output was truncated. The summary above reports all warnings, not a clean-warning claim. Warnings include React hooks/compiler diagnostics and unused eslint-disable comments; no autofix ran.

`git grep -n '^<<<<<<<'`: exit 1, empty output (no matches).
The broader source scan for opening/separator/closing markers was also empty.
`git diff --check`: exit 0, empty output.
`node --check scripts/check-budget.mjs`: exit 0, empty output.

Isolated budget fixture (temporary directory, no real build): exit 0. Output:

```text
PASS: evidence is counted; repeated checks are stable.
PASS: exact 31,719,424-byte ceiling passes.
PASS: one byte beyond the ceiling fails and publishes failing evidence.
```

The first fixture attempt incorrectly reused a measured total after changing the ceiling's digit count; its assertion failed. The corrected fixture keeps the real ceiling and varies a sparse payload. All three assertions above pass against the final script.

Codegraph status: exit 1. Error tail:

```text
SyntaxError: Expected double-quoted property name in JSON at position 65242 (line 2700 column 7)
    at JSON.parse (<anonymous>)
    at ownedRepos (file:///Users/darkpandawarrior/Tools/DevTools/AgentHarness/scripts/graph.mjs:187:31)
    at status (file:///Users/darkpandawarrior/Tools/DevTools/AgentHarness/scripts/graph.mjs:286:16)
```

Used the textual deps.mjs fallback for App.tsx and index.css. Did not repair harness state outside the owned paths.

## Font licence finding

No Fontshare, Cabinet Grotesk or ITF Free Font licence file was found in this worktree or ~/Downloads. Filename searches included hidden files, licence names and font names. Text searches covered licence/text/Markdown/HTML files, excluding Git metadata and dependencies. Four ZIP archives were also inspected by member name; no Fontshare/Cabinet/ITF licence match appeared. No local licence text is available to establish self-hosting terms. No font was added or downloaded.

## Still open for the parent / ship run

- Stage the 12 resolutions and finish the merge. This lane cannot write Git metadata and deliberately created no commits or pushes.
- Review the Terrain.tsx and WorldV2.tsx integration visually and exercise XR/replay. Typecheck does not prove those runtime paths.
- Verify `/ops` at 1440 and home at 390x844, including search/chat hit targets, header collision checks and the primary CTA. Browser screenshots were not captured; the owner reserved browser/e2e work for the final quiet-machine run.
- Run the real production budget check after the reserved build. The fixture verifies enforcement, not the merged deployment's actual size.
- Reconcile shipgate-fix before ship: main commit c8c9e57f already contains the heavy() joins and thumbnail deduplication. The XREntry controls still lack the min-h-11/px-2 changes from b761429f. Applying that separate historical fix exceeds this lane's enumerated conflict and small-review fixes; no cherry-pick was attempted.
- Full build, Vitest, Playwright, Lighthouse, claim-audit, real-GPU and real-headset checks were NOT RUN. This lane follows the owner's cheap typecheck/lint scope and memory constraint; the parent owns the remaining ship gate and claim audit.
- Dependency vulnerabilities remain as npm reported. Dependency remediation is outside this merge/visual-fix lane.
- Terrain generator determinism, refresh-media secret setup, voice selection and other review checklist owner actions remain outside this lane. No generator ran, and no terrain data was changed by this lane.

Commits created: none. Pushes, deployment and merge to main: none.
