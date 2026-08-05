# Level 2 — Panda (the AI assistant)

Files read in full before writing this: `src/FloatingChat.tsx`, `src/ChatWidgets.tsx`,
`src/lib/chatBlocks.ts`, `src/lib/chatContext.ts`, `api/_lib/chat-handler.ts`,
`scripts/gen-system-prompt.mjs`. Also traced: `src/lib/skillMatch.ts` (the offline JD
matcher `toFitReport` feeds into `JdFitCard`), every `openChat(...)` call site (13 files),
every route file to see which mount `<FloatingChat />`, and `e2e/a11y.spec.ts` for the
16 audited surfaces.

## Current state (honest)

Panda is already well past "chat widget." It's a provider-agnostic streaming client
(`chatClient.ts`) driving a terminal-flavoured panel (`FloatingChat.tsx`) that renders
real components from directives the model emits mid-stream (`[[rooms]]`,
`[[project:slug]]`, `[[metrics]]`, `[[skills]]`, `[[jdfit:{…}]]` — parsed by
`chatBlocks.ts`, rendered by `ChatWidgets.tsx`). It has slash commands with ghost
completion, voice in and out, route-aware chips and greetings (`chatContext.ts`), and a
JD-fit flagship path with an **offline-first** scorecard (`skillMatch.ts`) that appears
instantly and is superseded by the model's read when it arrives. The server side
(`chat-handler.ts`) has real engineering in it: origin allowlisting, sliding-window rate
limits with a separate tighter JD bucket, cost-aware provider ordering, and failure
classification so a misconfigured key doesn't read the same as a throttled one.

What it does *not* yet do, concretely:

- **`/resume` has no assistant at all.** `chatContext.ts` already carries
  `PAGE_CHIPS["/resume"]` and a `greetingFor` case for it — that code has been dead since
  it was written, because `src/routes/resume.tsx` never renders `<FloatingChat />`. Every
  other room and every project page has it; the single highest-traffic recruiter page
  doesn't.
- **Two of the four generative-UI cards don't link anywhere.** `ProjectCard` and
  `RoomsGrid` navigate somewhere real; `MetricTiles` and the score in `JdFitCard` are
  inert numbers with no evidence attached.
- **Numbers in the chat cards don't follow the site's own numeral convention.**
  `MetricTiles`' value and `JdFitCard`'s score use `font-display font-bold`, not
  `font-mono … tabular-nums` — which is exactly the pattern already used for every other
  numeric readout on the site (`Terminal.tsx`, `ChessFindings.tsx`, `Pulse.tsx`,
  `Visitors.tsx`). CAL-1 says numbers get JetBrains Mono tabular-nums; the chat widgets
  are the one place still writing them as display type.
- **The offline-vs-model distinction is prose only.** `toFitReport()` in `skillMatch.ts`
  already writes an honest disclaimer into `summary` ("This is a keyword match, not a
  judgement…"), but it's one sentence buried in body copy on a card that looks
  structurally identical to the model's verdict. If the network fails and the offline
  card is all that survives, a recruiter skimming score → band → strengths can miss the
  one sentence that says this wasn't the AI talking.
- **Suggestions are route-aware, not conversation-aware.** `chipsFor(pathname)` only
  looks at where the visitor is standing, never at what the assistant just showed them.
  Ask about Mileway from the home page and the next chip row is still the generic
  home set, not "what was the hardest part of Mileway."
- **A JD-fit card's gaps are a dead end.** They're the most useful part of the card and
  the only part with no next action — no way to ask "how would he close this" without
  typing it yourself.

## What level 2 is

Not a rebuild — the architecture (provider-agnostic directives, offline-first JD path,
route-aware context) is already the right shape and stays exactly as it is. Level 2 is:
finish wiring what's already half-built (`/resume`), make the cards that already exist
pull their full weight (link to evidence, use the site's own number typography, tell the
truth about their own provenance visually and not just in a sentence), and turn the
one place the assistant already knows what it just showed (a settled reply, a rendered
card) into the next question instead of leaving that entirely to the visitor. Nothing
here adds a new surface, a new provider, or a new mode — `chat` / `compose` / `jd`
stay exactly as they are.

## Concrete changes, ordered by value ÷ risk

### 1. Mount `<FloatingChat />` on `/resume`

**File:** `src/routes/resume.tsx`. Add the import and render `<FloatingChat />` inside
`ResumePage()`, the same one-line pattern every other route already uses (see
`src/routes/project.$slug.tsx:55`, `src/routes/lab.tsx:18`, etc.). `chatContext.ts`
already has `ROUTES` include `/resume`, `PAGE_CHIPS["/resume"]` (`"Walk me through your
experience"`, `"What are you strongest at?"`, `"Are you open to new roles?"`), and
`greetingFor` handles the `kind: "page"` case — none of that needs to change, it's
already correct and untested-because-unreachable. `/resume` is one of the 16 surfaces
in `e2e/a11y.spec.ts`, so this exercises the exact same component the axe pass already
clears on 13 other routes — no new a11y surface, just the existing one finally reachable.
`FloatingChat` already carries `print:hidden` on both the launcher and the panel, so the
print-mode résumé is untouched.

Highest value: the JD-fit flagship path (`/jd`, the whole reason the offline matcher and
the tight rate-limit bucket exist) is currently unreachable from the one page a recruiter
who already decided to read the résumé is most likely to be on. Lowest risk: this is
copying a line that exists in 13 other files verbatim.

### 2. Give `JdFitCard` a real provenance signal, not just a sentence

**Files:** `src/lib/chatBlocks.ts`, `src/lib/skillMatch.ts`, `src/ChatWidgets.tsx`.

Add an optional field to the interface in `chatBlocks.ts`:

```ts
export interface JdFitReport {
  score: number;
  role?: string;
  summary: string;
  strengths: { need: string; evidence: string; project?: string }[];
  gaps: { need: string; note: string }[];
  /** Set only by the client-side offline matcher — never by the model. */
  source?: "offline";
}
```

`parseJdFit` reads it narrowly — `o.source === "offline" ? "offline" as const :
undefined` — not through the generic `field()` helper, so nothing except the literal
string can ever set it. `toFitReport()` in `skillMatch.ts` sets `source: "offline"` on
its return value (one field addition, no other change). The model's JSON payload never
mentions this field — `jd-prompt.ts` / the JD prompt in `gen-system-prompt.mjs` is
**not touched**, so this costs nothing in prompt tokens and nothing in model risk.

In `ChatWidgets.tsx`, `JdFitCard`'s header gets a small badge next to `fit analysis`
when `report.source === "offline"`:

```tsx
{report.source === "offline" && (
  <span className="ml-2 rounded-full border border-accent2/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent2">
    instant match
  </span>
)}
```

Cyan (`accent2`, the CAL-1 baseline/reference channel) for the heuristic pass, the
existing amber `accent` tone for the header label stays as the AI-verdict channel by
default. This is the calibrated-instrument language doing real work — measured signal
vs. reference — without a single word of copy explaining it, which is exactly the
guardrail the brief sets. When the model's reply supersedes the offline card
(`FloatingChat.tsx`'s `send()` already fully replaces bubble content, never appends), the
new `[[jdfit:{…}]]` block simply has no `source` field and the badge is gone — the visual
state changes itself, nothing has to notice or announce it.

### 3. CAL-1 numeral typography in the two chat widgets that still skip it

**File:** `src/ChatWidgets.tsx`. Two class swaps:

- `MetricTiles`: `<p className="font-display text-lg font-bold leading-none text-accent">{m.value}</p>`
  → `font-mono text-lg font-bold tabular-nums leading-none text-accent`.
- `JdFitCard`: `<span className={`font-display text-2xl font-bold leading-none ${band.tone}`}>{report.score}</span>`
  → `font-mono text-2xl font-bold tabular-nums leading-none ${band.tone}`.

Matches the convention already live in `ChessFindings.tsx`, `Pulse.tsx`, `Terminal.tsx`
and `Visitors.tsx` (`font-mono … tabular-nums text-accent`/`text-accent2`). Zero
behavioural change, pure className, and it closes the one place in the CAL-1 rollout
where a number in the UI still reads in display type instead of the instrument face.

### 4. `MetricTiles` links to the room that proves the numbers

**File:** `src/ChatWidgets.tsx`. `siteRooms` already describes `/lab` as "experiments
that prove the numbers — Dice.tech production metrics, five personal builds and seven
years of chess" (`src/data/profile.ts`). Wrap each tile in the same `ChatLink` the other
three widgets already use:

```tsx
function MetricTiles({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="my-2.5 grid grid-cols-2 gap-1.5">
      {metrics.map((m) => (
        <ChatLink key={m.label} href="/lab" onNavigate={onNavigate} className="block rounded-lg border border-line bg-ink px-2.5 py-2 text-left transition hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none">
          <p className="font-mono text-lg font-bold tabular-nums leading-none text-accent">{m.value}</p>
          <p className="mt-1 text-[11px] leading-tight text-zinc-300">{m.label}</p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted">{m.detail}</p>
        </ChatLink>
      ))}
    </div>
  );
}
```

Thread `onNavigate` through from `chatWidget()`'s existing `case "metrics":` (it already
receives `onNavigate` as a parameter, just isn't passing it to `MetricTiles` today).
One generic target (`/lab`) for all four tiles — no per-metric mapping to build or keep
in sync, and it's true for all four numbers today. This is "evidence attached to the
deviation," structurally, exactly the thesis's own vocabulary, never stated as such.

### 5. Gaps in `JdFitCard` become an ask, not a dead end

**Files:** `src/ChatWidgets.tsx`, `src/FloatingChat.tsx`.

Add an optional `onAsk?: (text: string) => void` prop to `ChatMessageBody`, threaded
through `chatWidget()` to `JdFitCard` exactly the way `onNavigate` already is — same
shape, same place, no new plumbing pattern. Each gap row gets one small button:

```tsx
<li key={i} className="border-l-2 border-amber-300/40 pl-2">
  <p className="text-[11px] font-semibold leading-snug text-zinc-200">{g.need}</p>
  <p className="text-[11px] leading-snug text-zinc-400">{g.note}</p>
  {onAsk && (
    <button
      type="button"
      onClick={() => onAsk(`How would he close the gap on ${g.need}?`)}
      className="mt-1 text-[11px] font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      ask about this
    </button>
  )}
</li>
```

In `FloatingChat.tsx`, pass `onAsk={(q) => void send(q)}` where `ChatMessageBody` is
rendered for a settled assistant bubble (the same `!streaming` guard `done` already
uses). **Deliberately not `openChat()`** — that dispatches a global window event meant
for callers outside the panel; the panel is already open and already owns `send()`, so
calling it directly is one function call instead of a round trip through the event bus.
This is the one true "proactive offer" in this pass: the weakest section of the
flagship card — the gaps — gets a next action attached to each row, at the moment the
gap is shown, rather than waiting for the visitor to think of the question.

### 6. Conversation-aware suggestions, not just route-aware

**Files:** `src/lib/chatContext.ts`, `src/FloatingChat.tsx`.

Add one small export to `chatContext.ts`:

```ts
export function chipsForProject(name: string): string[] {
  return [`What was the hardest part of ${name}?`, `What's the stack behind ${name}?`];
}
```

In `FloatingChat.tsx`, where `suggestions` is computed, parse the **last assistant
message** (`parseChatBlocks(lastAssistant.content, true)` — already imported
indirectly via `ChatMessageBody`; import `parseChatBlocks` directly here) for a
`{ kind: "widget", name: "project", arg }` block, look the slug up with `projectBySlug`,
and prepend `chipsForProject(project.name)` ahead of `chips` before the
already-asked filter. Route chips stay the fallback for every reply that didn't render
a project card — this only sharpens the case where the assistant just showed you
something specific. Bounded, no new state, no extra model call.

## A11y + reduced-motion + SSR notes

- **SSR:** every change above is a pure prop/className change or a new client-side
  field set from `skillMatch.ts` (already client/edge-safe, no `Date`/`window`/
  `Math.random`). `parseChatBlocks` is already pure and DOM-free; calling it once more
  on the last message in `FloatingChat.tsx` (#6) is the same function, same
  guarantees, no new SSR surface.
- **A11y:** the new gap-row button (#5) is a native `<button>` — keyboard-reachable and
  announced by default, no `role`/`tabindex` shim needed. It sits inside the transcript's
  existing `role="log" aria-live="polite"` region, so its label change on click (nothing
  visual toggles on the button itself) doesn't fight that region. The provenance badge
  (#2) is plain text inside the existing `aria-label="Job description fit analysis"`
  section — screen readers get it as part of the header they already read. `MetricTiles`
  becoming a link (#4) follows the exact `ChatLink` component every other widget already
  uses, which is the thing that's already passing the no-allowlist axe run on all 16
  surfaces — reusing it, not reinventing it, is what keeps that guarantee.
- **Reduced motion:** nothing here introduces new motion. The gap-ask button and the
  badge use the same `hover:`/`focus-visible:` colour transitions already throughout
  `ChatWidgets.tsx` and already covered by the site's global styling — no new
  `transition`/`animation` class families, nothing that needs a `prefers-reduced-motion`
  off-switch because nothing moves.
- **`/resume` (#1):** mounting `FloatingChat` there exercises code paths (focus trap
  return, Esc handling, `role="log"`) already exercised — and already passing axe — on
  13 other routes. No new component, so no new failure mode to check for; the value is
  simply that the surface becomes reachable.

## What NOT to do

- **Don't teach the model about `source`/"offline vs AI."** Keep `JdFitReport.source`
  entirely client-set (§2). The moment the prompt in `jd-prompt.ts` has to know about its
  own provenance, a prompt-injected JD can try to forge "verified by AI" — there's no
  reason to open that door when the client already knows the truth for free.
- **Don't add `<FloatingChat />` to `/hire`.** Its own file comment is explicit: "the
  ninety-second surface… designed for someone who does not want to explore… no canvas, no
  scroll-driven anything." A chat launcher is a standing invitation to explore. Leaving
  it off `/hire` isn't a gap, it's the page's stated design working as intended — don't
  "fix" it.
- **Don't build a provenance system for every widget.** `JdFitCard` is the one card
  where two materially different code paths (a keyword matcher and an LLM) can produce
  the same shape of output — that's the actual justification for a badge. `ProjectCard`,
  `RoomsGrid`, `MetricTiles`, `SkillChips` only ever have one source (site data); giving
  them a provenance badge too would be decoration standing in for a distinction that
  doesn't exist.
- **Don't add real-time/typing-indicator animation, sound, or a persistent unread
  badge on the launcher button.** None of it was asked for, all of it is exactly the
  kind of ambient motion the axe/reduced-motion contract exists to keep off this site,
  and a solo maintainer inherits every edge case a "live" indicator invents (tab
  backgrounded, multiple tabs, stale state).
- **Don't move rate limiting to a KV/Upstash store.** `chat-handler.ts` already
  documents why the per-isolate limiter is a deliberate, honest trade-off ("no new paid
  dependency… the limits below are deliberately generous enough that a per-isolate
  approximation still bounds the damage"). Nothing in this pass touches the money guard.
- **Don't literalize the thesis in any new copy.** No badge, chip, tooltip or button
  label introduced above says "loop," "pattern," "signal vs. noise," or explains why a
  keyword matcher and an LLM are being visually distinguished. The amber/cyan pairing in
  §2 does that work by being consistent with how the rest of the site already uses those
  two colours — it is never narrated.
