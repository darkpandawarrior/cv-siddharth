# Level 2 — The Terminal, The Particle Forge, The Pulse

Scope: `src/Terminal.tsx`, `src/ParticleWordmark.tsx`, `src/Pulse.tsx` + `src/play/*`.
No deletions anywhere below — every change either adds, corrects a value, or
extracts existing markup into a shared piece both the old and new call sites use.

---

## Current state (honest)

**Terminal** (`src/Terminal.tsx`, 1300 lines) is already well past "easter egg."
It's a real command surface over `data/profile.ts` — 30+ commands, alias table,
Tab completion with an inline ghost preview, ↑/↓ history persisted to
`localStorage`, five swappable colour themes, a live `ask <question>` that
streams through the same `chatClient.ts` the floating chat uses, live
`spotify`/`activity` blocks off `useLiveSignal`, and a `chess` command whose
`clock`/`arc`/`best` sub-views read straight from the generated `chess.ts`
corpus (deciles, gap-widening-early, the upset). It is the single most
feature-dense room on the site. Two real gaps:

1. **It's a dead end again.** `/terminal` is registered in `ROOMS`
   (`src/rooms.tsx`, via `siteRooms` in `data/profile.ts`) at index 5, between
   `/forge` and `/chess` — so `RoomFrame`'s new "next room" pager (b662585,
   this session) points `/forge` visitors *at* `/terminal`. But `Terminal.tsx`
   renders its own full-screen chrome and never wraps `<RoomFrame>` (see
   `src/routes/terminal.tsx`), so there's no matching pager *out* the other
   side. The "no dead ends" fix from this session has a hole exactly where it
   routes people into the terminal.
2. **The output log's `aria-live` region is scoped too wide.** `<main aria-live="polite">`
   wraps both the printed blocks *and* the live input line, including the
   inline Tab-completion ghost `<span>` that changes on every keystroke
   (lines 1256–1276). A screen reader is being asked to treat every character
   typed as a live-region update.

Cosmetically, the default theme is `THEMES.green` (`#3ddc84`) — the pre-CAL-1
Android green — and `THEMES.amber`/`THEMES.cyan` exist but don't match the
site's actual CAL-1 tokens (`--color-accent: #f2a13d`, `--color-accent2: #4fd6e0`
in `src/index.css`).

**Forge** (`src/ParticleWordmark.tsx`, 261 lines) is a tight, dependency-free
canvas sim: Hooke's-law spring to a sampled-glyph target, inverse-square cursor
repulsion, damping, HiDPI-aware, paused off-screen via `IntersectionObserver`,
a fully static reduced-motion path, and a haptic click-blast. It's already
well-built. Its one real gap is also the visual-direction one: `GREEN`/`CYAN`
(lines 19–20) are `#3ddc84`/`#5ee6ff` — old Android green, not CAL-1 — and the
tint a particle gets is `p.x / width`, a fixed left-to-right gradient assigned
once at spawn. It's decoration; it doesn't mean anything.

**Pulse** (`src/Pulse.tsx` + `src/play/pulse.ts`, `src/play/visitors.ts`,
`src/play/Visitors.tsx`) is the most quietly sophisticated piece of the three.
It already does the hard part of staying honest at low volume: a sharded
grow-only counter so concurrent visitors can't lose each other's increment
(`visitors.ts`'s 64-shard G-Counter, with the lost-update math spelled out in
its own comment), zero-filled day bars so a quiet week isn't invisible, `№
1,204th person through this door` ordinal framing instead of a bare integer,
and an explicit paragraph on `/pulse` admitting the numbers are
client-writable and asking to be read as "a sign of life, not analytics."
That's real design, not neglect. The actual problem is narrower and more
fixable than "the number is small" — **the number is smaller than the real
traffic, because of how it's collected**:

`room:*` events (`room:forge`, `room:terminal`, …) are the one event family
in `PULSE_EVENTS` (`src/play/pulse.ts`) that is bumped from exactly one place:
`RoomCard`'s `onClick` in `src/Playground.tsx` (line 30). Every *other* way
into a room — the backtick hotkey from anywhere (this session's fix), the
command palette, `RoomFrame`'s own next-room pager (also this session), a
direct URL, a search hit, `sitemap`/`open <slug>` typed into the terminal
itself — reaches the room without ever touching that `onClick`, so it's
invisible to `/pulse`. Every other event family (`blueprint:fly`,
`chess:guess`, `wall:note`, …) is bumped from inside the room on the actual
action, so it doesn't have this hole — only "a room got opened" does, which is
also the number `/pulse` leads with. The two sessions of fixes that made this
site's rooms reachable from more places (backtick everywhere, the pager) each
quietly widened this gap.

---

## What level 2 is

Not "make the numbers look bigger." **Make the counted number equal the real
number**, and give the honest, still-small result a frame where smallness
reads as *evidence*, not as failure — a live "something just happened here"
strip instead of a static scoreboard, and the breadth stats (time zones,
distinct days) that are already computed and already true promoted next to
the headline instead of buried under it. For Terminal and Forge, level 2 is
closing the two concrete gaps above (the dead end, the wrong palette) and
using the Forge recolor to make the piece *do* something instead of just
looking pretty — the cursor already introduces a disturbance and the springs
already resolve it back to shape; the only missing piece is that the color
doesn't currently say so.

---

## Concrete changes, ordered by value ÷ risk

### 1. Fix the `room:*` undercount at its source — `src/rooms.tsx`, `src/Playground.tsx`, `src/Terminal.tsx`

**Value: high — this is the actual fix for "the numbers are small."** Risk:
low — additive, and the existing 1s dedupe in `usePulse()` (`play/pulse.ts`
line 46) makes it safe to bump from two places without double-counting.

Bump `room:<slug>` when a room actually mounts, not only when a Playground
card is clicked. Extract the pager into its own component so both `RoomFrame`
and `Terminal` can render it and both can carry the bump:

```tsx
// src/rooms.tsx — extract from the tail of RoomFrame() into its own export
export function RoomPager({ pathname }: { pathname: string }) {
  const here = ROOMS.findIndex((r) => r.to === pathname);
  const next = here === -1 ? null : ROOMS[(here + 1) % ROOMS.length];
  const bump = usePulse();
  useEffect(() => {
    if (here !== -1) bump(`room:${ROOMS[here].to.slice(1)}` as PulseEvent);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!next) return null;
  return (
    <footer className="border-t border-line bg-ink/80">
      {/* ...unchanged markup from the current RoomFrame footer... */}
    </footer>
  );
}
```

`RoomFrame` keeps its `useRouterState` call at its own top level (per the fix
in 9bf11f7 — never inside `findIndex`'s callback) and passes `pathname` down:

```tsx
export function RoomFrame({ title, tagline, children }: {...}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-screen flex-col bg-void">
      <header>...unchanged...</header>
      <main id="main-content" tabIndex={-1} className="min-h-0 flex-1">...unchanged...</main>
      <RoomPager pathname={pathname} />
    </div>
  );
}
```

This alone fixes `/forge`, `/compose`, `/lab`, `/blueprint`, `/map`, `/chess`
for free — they already render through `RoomFrame`. `Terminal.tsx` doesn't, so
it needs the same wiring explicitly (this also fixes gap #1, the dead end —
one change, two problems):

```tsx
// src/Terminal.tsx — inside export function Terminal()
import { useRouterState } from "@tanstack/react-router"; // add to existing import
import { RoomPager } from "./rooms.tsx";
// ...
const pathname = useRouterState({ select: (s) => s.location.pathname });
// ...in the JSX, as a sibling after <main>, inside the existing h-screen flex-col root:
<RoomPager pathname={pathname} />
```

`RoomPager`'s footer is `shrink-0` by default (it's not `flex-1`), so it slots
into Terminal's `h-screen flex-col` (header, `flex-1 overflow-y-auto` main,
footer) exactly the way it already does in `RoomFrame`'s `min-h-screen`
layout. `/terminal` is `ROOMS[5]`; its next room becomes `/chess` — "The
Board," which the terminal's own `chess` command already knows how to talk
about.

Leave `RoomCard`'s `onClick={() => bump(event)}` in `src/Playground.tsx`
exactly as it is — redundant with the mount-bump now, harmless, deduped by
the existing 1s window, and removing it isn't required to fix anything.

### 2. Recolor the Forge to CAL-1, and make the color mean the disturbance — `src/ParticleWordmark.tsx`

**Value: high — this is the named visual-direction constraint AND the
cheapest way to express the site's structural idea (signal, disturbed,
measured back) without writing a single word of copy.** Risk: low — touches
only the canvas draw call, no layout, no markup, no a11y surface (the
`role="img"`/`aria-label` already carry the accessible content).

Today a particle's tint is fixed at spawn from its horizontal position — pure
decoration. Instead, tint it live from how far it currently is from its glyph
target: on-target (the resolved wordmark) reads as Channel A amber, the
measured/settled signal; mid-flight or freshly scattered (right after the
cursor or a click disturbs it) reads as Channel B cyan, the baseline it hasn't
resolved back to yet. The spring already does the work of pulling it back —
this just makes that convergence visible as a color instead of only as
position.

```tsx
// rename the palette to the site's actual channels
const CHANNEL_A = { r: 0xf2, g: 0xa1, b: 0x3d }; // #f2a13d — measured/settled
const CHANNEL_B = { r: 0x4f, g: 0xd6, b: 0xe0 }; // #4fd6e0 — baseline/unresolved

// Particle no longer needs a fixed `mix` field — drop it from the type and
// from its construction in build() (the seed scatter position is unchanged).

const colorOf = (settle: number, alpha: number) => {
  const r = Math.round(CHANNEL_B.r + (CHANNEL_A.r - CHANNEL_B.r) * settle);
  const g = Math.round(CHANNEL_B.g + (CHANNEL_A.g - CHANNEL_B.g) * settle);
  const b = Math.round(CHANNEL_B.b + (CHANNEL_A.b - CHANNEL_B.b) * settle);
  return `rgba(${r},${g},${b},${alpha})`;
};

// inside step(), per particle, after integrating position (replaces the old
// `const speed = ...; ctx.fillStyle = colorOf(p.mix, ...)` block):
const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
const settle = Math.max(0, 1 - dist / 50); // 0 = still scattered, 1 = on target
const speed = Math.min(Math.abs(p.vx) + Math.abs(p.vy), 6);
ctx.fillStyle = colorOf(settle, 0.55 + speed * 0.07);
ctx.fillRect(p.x, p.y, 1.7, 1.7);
```

The reduced-motion static branch draws every particle at `(tx, ty)` — distance
0, so `settle = 1` — which now renders the whole wordmark in solid resolved
amber. That's the right reduced-motion answer here: no motion, no flicker,
just the settled signal.

### 3. Narrow the terminal's `aria-live` region — `src/Terminal.tsx`

**Value: medium (real screen-reader correctness bug, not cosmetic). Risk:
low — a scope change, not a rewrite.**

```tsx
// before: aria-live="polite" on <main>, wrapping blocks AND the live input line
<main id="main-content" tabIndex={-1} ref={scrollRef} className="..." aria-label="terminal output">
  <h1 className="sr-only">...</h1>
  <div className="mx-auto max-w-4xl space-y-1.5">
    <div aria-live="polite" className="space-y-1.5">
      {blocks.map((b) => (
        <div key={b.id} className={reduce.current ? "" : "term-line"}>{b.node}</div>
      ))}
    </div>
    <div className="flex items-center">
      {/* input + ghost, now outside the live region */}
      {ghost && (
        <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 whitespace-pre text-muted">
          ...
        </span>
      )}
    </div>
  </div>
</main>
```

Only the printed output announces; the input and its Tab-completion ghost
(which already changes on every keystroke) no longer fire a live-region
update per character.

### 4. `theme` command matches the site's actual CAL-1 tokens — `src/Terminal.tsx`

**Value: low-medium (visual-direction consistency — "don't design against
green"). Risk: near zero — three hex swaps and two default-string swaps, no
markup change.**

```tsx
const THEMES: Record<string, { accent: string; dim: string }> = {
  green: { accent: "#3ddc84", dim: "#2bb86c" },   // unchanged — still a valid option, not deleted
  amber: { accent: "#f2a13d", dim: "#c47f2a" },   // was #ffb454/#d98a2b — now matches --color-accent exactly
  cyan: { accent: "#4fd6e0", dim: "#35a8b0" },    // was #5ee6ff/#2fb8d6 — now matches --color-accent2 exactly
  magenta: { accent: "#ff6ac1", dim: "#d13d97" },
  mono: { accent: "#e8efe9", dim: "#9aa5a0" },
};
```

Default fallback in `setTheme` (`THEMES[name] ?? THEMES.green` → `?? THEMES.amber`)
and the boot effect's `localStorage.getItem(...) ?? "green"` → `?? "amber"`,
plus the root `<div>`'s inline pre-hydration style (`--t-accent`/`--t-dim`)
updated to `#f2a13d`/`#c47f2a` so first paint matches the rest of the site.
`theme green` (and magenta, cyan, mono) keep working exactly as typed — this
only changes what a visitor who never types `theme` sees.

### 5. "Did you mean" on an unknown command — `src/Terminal.tsx`

**Value: low-medium (a mistyped `projets` currently just dead-ends on "command
not found"). Risk: low — one small pure function, no new dependency.**

```tsx
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}
```

In `run()`'s final `command not found` branch, check `lname` against
`[...commands.filter(c => !c.hidden).map(c => c.name), ...Object.keys(SECTION_ROUTES)]`
for the closest name within distance 2, and if found, render
`Did you mean `<Hi>{closest}</Hi>`? ` before "Type `help`."

---

## A11y + reduced-motion + SSR notes

- Forge's recolor touches only `ctx.fillStyle` inside the existing animation
  loop and the existing reduced-motion branch — no new `matchMedia` call
  needed, no change to the `role="img"`/`aria-label`, no DOM text added
  (satisfies "decorative giant type must be SVG, not DOM text" — it already
  was canvas, not DOM text, and stays that way).
- `RoomPager`'s mount-effect bump (#1) has no visible UI of its own; it rides
  inside a component that already renders a footer link. No new focus order,
  no new heading, nothing for axe to see beyond what `RoomFrame`'s pager
  already passes today (it's the same markup, just extracted).
- `Terminal.tsx`'s `<RoomPager>` addition sits after the existing `<main>` in
  a `flex-col` root — verify tab order lands: input line → pager link, which
  is correct source order already (pager is last child).
- #3's `aria-live` narrowing is a pure correctness fix; it doesn't change
  what axe checks (axe doesn't currently flag the over-wide region — it isn't
  a WCAG violation, just bad screen-reader manners) but it's cheap to fix
  precisely because the story is "narrow the div," not "restructure it."
- Nothing here touches `Date`, `window`, or `Math.random` at render time.
  Forge's `Math.random()` (spawn scatter in `build()`) and Terminal's
  `Date.now()` (dedupe in `usePulse`) both already only run inside
  `useEffect`/event handlers, never in the render body — unchanged by this
  pass, just confirmed.
- `/forge` and `/terminal` are both already `ssr: false`-adjacent (`/forge`
  renders through client-only `RoomFrame` usage patterns already established
  by `/lab`, `/map`, `/blueprint`, `/chess`; `/terminal` and `/pulse` are
  explicitly `ssr: false` in their route files) — no route-config change
  needed for any of the above.

---

## What NOT to do

- **Do not seed, pad, or multiply the Pulse numbers.** The fix for "2 through
  the door reads badly" is measuring the traffic that already exists more
  completely (item #1), never inventing traffic that doesn't. The page's own
  honesty paragraph ("a sign of life, not analytics") is a promise; breaking
  it to make a bigger number is worse than the small number.
- **Do not explain the color mechanic in Forge's copy.** No "signal vs noise"
  legend, no tooltip, no on-canvas label. The whole point of #2 is that the
  mechanic carries the idea without a sentence doing it — the moment it needs
  one, per the guardrail, it's already failed.
- **Do not wrap `Terminal.tsx` in the full `<RoomFrame>` component.** It has
  its own header, its own back button, its own theme system, and its own
  full-bleed layout — swapping in `RoomFrame` wholesale would fight all of
  that. Only the extracted `<RoomPager>` piece is shared; the rest of
  Terminal's chrome stays exactly as built.
- **Do not remove `THEMES.green`/`magenta`/`mono`, or the `theme` command
  itself.** Item #4 only changes the *default* and corrects two hex values
  that already claimed to be CAL-1 colors and weren't.
- **Do not add a dependency for the Levenshtein check in #5.** It's an
  8-line DP table; nothing on npm is worth the weight for that.
- **Do not build a server-authoritative rewrite of the visitor/pulse CRDT
  for this pass.** `visitors.ts`'s sharded-counter design is already correct
  for what it's for (see its own header comment on lost-update); the gap
  fixed here is a wiring gap in *when* a bump fires, not a flaw in how a bump
  is stored.
