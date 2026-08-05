# The JD Fit Check — Level 2

Files read in full before writing this: `src/FitCheck.tsx`, `api/_lib/jd-prompt.ts`,
`src/FloatingChat.tsx`, `src/ChatWidgets.tsx`, `src/lib/chatBlocks.ts`, `src/lib/chatClient.ts`,
`src/lib/skillMatch.ts`, `api/_lib/chat-handler.ts`, `api/_lib/jd-condense.ts`,
`src/routes/hire.tsx`.

## Current state (honest)

This is already the most engineered feature on the site, and most of "level 2" is already built:

- **Speed is already excellent.** `matchJd()`/`toFitReport()` (`src/lib/skillMatch.ts`) render a real,
  evidence-backed scorecard in the same frame as the paste — no network, no rate limit. The model's
  richer read (`streamReply(..., "jd", ...)`) supersedes it in place a couple seconds later
  (`FloatingChat.tsx:352-407`). If every provider fails, the offline card is relabelled honest
  (`toFitReport(jdMatch, final=true)`) instead of leaving a dead end. There is nothing to add here —
  this part is already level 2 or beyond.
- **Honesty about gaps is already structurally forced,** not a UI nicety: `jd-prompt.ts`'s rubric
  requires 2-3 gaps and NEVER an empty array, `parseJdFit` (`chatBlocks.ts:135`) drops the whole card
  rather than render a gapless one, and `JdFitCard` (`ChatWidgets.tsx:170-241`) always renders the
  "where I'd have gaps" section, with a fallback sentence when the offline matcher finds none. Good.
- **What's actually weak, and what this doc is about:**
  1. **The result never lands where the promise was made.** The section's own copy says "My AI
     assistant reads it... and answers" directly under a form on the homepage — but `run()` in
     `FitCheck.tsx:32-35` only calls `openJdFit(text)`, which dispatches a `CustomEvent` that
     `FloatingChat.tsx` picks up and renders **inside the floating console** — a separate,
     bottom-right-corner, 370px-wide (unless manually expanded) panel that the recruiter has to
     notice opened at all. The section that advertises the answer never shows it. That is the
     single biggest gap between what this feature IS and what it reads as.
  2. **Zero shareability.** The only way to get the verdict out of the browser is the generic
     per-message copy icon buried in the console's action row (`FloatingChat.tsx:659-660`,
     `copyReply` → `plainText()`). There is no way to forward a scorecard to a hiring manager, no
     link, no email draft — despite `jdFitText()` (`chatBlocks.ts:187-192`) already producing a
     clean, forwardable plain-text version of exactly this.
  3. **The result is a dead end.** Once the card renders, nothing tells the reader what to do with
     a good score (or a bad one). `/hire` (`src/routes/hire.tsx`) already exists as exactly the
     "ninety-second, one way to make contact" surface this should hand off to — it's just never
     linked from here.
  4. **Trust signal is prose-only.** "This is a keyword match, not a judgement" / "AI-verified" is
     only ever a sentence inside `summary` (`skillMatch.ts:471-477`) — there's no glanceable badge,
     so a recruiter who skims past the first sentence can't tell which kind of answer they're
     reading.
  5. **Minor CAL-1 drift:** the score digits (`ChatWidgets.tsx:179`, `className="font-display text-2xl
     font-bold ..."`) have no `tabular-nums`, so the glyph width shifts as the number streams in from
     the offline pass to the model's pass — the site's own convention for a big stat number
     (`src/chess/ChessFindings.tsx:160,171,186`) always pairs `font-display` with `tabular-nums`.

## What level 2 is

The analysis engine doesn't need more intelligence — it needs to stop being trapped inside a chat
bubble. Level 2 is: **the scorecard renders where the form is**, so pasting a JD and getting an
answer is one continuous, on-page action instead of a paste-then-notice-the-corner-popped-open
handoff; **the result is something a recruiter can immediately move**, by copying it or emailing it
onward without hunting for a tiny icon in a chat panel; **a good or bad score has an obvious next
click** into the destination the site already built for exactly this moment (`/hire`); and **the
provenance of the number is visible at a glance**, not just legible on a close read of the first
sentence. None of this is new intelligence — every primitive it needs (`matchJd`, `toFitReport`,
`streamReply`, `jdFitText`, `JdFitCard`, `/hire`, `profile.email`) already exists. This is wiring,
not invention.

## Concrete changes, ordered by value ÷ risk

### 1. Render the scorecard inline in `FitCheck.tsx`, not only in the console (highest value, medium risk)

This is the one structural fix; everything else below builds on top of it, but 2-6 are each still
worth doing even if this one is deferred.

**Files:** `src/FitCheck.tsx`, new `src/lib/useJdFit.ts`, `src/ChatWidgets.tsx` (export `JdFitCard`),
`src/FloatingChat.tsx` (route its existing jd branch through the same function so there is exactly
one implementation, not two).

- Extract the offline-then-model-supersedes logic that currently lives inline in `send()`
  (`FloatingChat.tsx:352-407`) into `src/lib/useJdFit.ts`:
  ```ts
  export function useJdFit() {
    const [report, setReport] = useState<JdFitReport | null>(null);
    const [status, setStatus] = useState<"idle" | "offline" | "streaming" | "done" | "error">("idle");
    const [errorText, setErrorText] = useState<string | null>(null);

    async function run(text: string) {
      const content = text.trim();
      if (!content) return;
      const jdMatch = matchJd(content);
      const hasOffline = jdMatch.asked > 0;
      if (hasOffline) { setReport(toFitReport(jdMatch, false)); setStatus("offline"); }
      else setStatus("streaming");

      let raw = "";
      let superseded = false;
      try {
        await streamReply([{ role: "user", content }], (delta) => {
          raw = superseded ? raw + delta : delta;
          superseded = true;
          setStatus("streaming");
          const parsed = parseChatBlocks(raw, false).find((b) => b.kind === "widget" && b.name === "jdfit");
          if (parsed?.kind === "widget" && parsed.data) setReport(parsed.data);
        }, "jd");
        setStatus("done");
      } catch (err) {
        if (hasOffline && !superseded) setReport(toFitReport(jdMatch, true));
        setErrorText(chatErrorText(err));
        setStatus("error");
      }
    }
    return { report, status, errorText, run };
  }
  ```
  This is a straight lift of logic that already works in `FloatingChat.tsx` — not new behaviour, just
  given a home both callers can share, so JD mode is still exactly one implementation, one request
  per submission, and the rate limit (`JD_RATE_WINDOWS`, `api/_lib/chat-handler.ts:123-126`) is spent
  once either way.
- `FitCheck.tsx`'s `run()` calls this hook's `run(text)` directly and renders `<JdFitCard report={...}
  onNavigate={...} />` (now exported from `ChatWidgets.tsx`) right under the form, inside its own
  `Reveal`. **It does not also call `openJdFit()`** — one submission, one request, one place the
  answer shows up. Keep a small secondary link once a report exists — "Ask a follow-up in the
  assistant →" — that calls `openJdFit(text)` on click, so the console path stays fully reachable
  (still true for `/jd`, still true for a recruiter who wants to interrogate a gap conversationally)
  without every submission being spent twice.
- `FloatingChat.tsx`'s jd branch of `send()` swaps its inline offline/model logic for the same hook
  (or the same extracted function, if hooks-in-a-non-component context is awkward there — a plain
  async function `runJdFit(content, onUpdate)` works for both call sites and avoids forcing
  `FloatingChat` to adopt a second piece of hook state). Either way: one function, two callers, not
  two copies of the offline→streaming→fallback logic to keep in sync.
- Streaming status text for the inline card: reuse the console's existing `role="log" aria-live="polite"`
  pattern (`FloatingChat.tsx:595-596`) on the wrapping `<div>` in `FitCheck.tsx`, so a screen reader
  gets exactly the same polite-not-assertive treatment already shipped and presumably already
  passing `e2e/a11y.spec.ts`.

### 2. "What happens next" footer on `JdFitCard` itself (high value, low risk)

**File:** `src/ChatWidgets.tsx` (`JdFitCard`, ~line 237, after the gaps block).

Add a footer strip, present whatever the score is (a low score is exactly when a recruiter deciding
"not this one" should still be able to reach a human instead of just closing the tab):

```tsx
<footer className="flex flex-wrap gap-2 border-t border-line bg-surface px-3 py-2.5">
  <ChatLink
    href="/hire"
    onNavigate={onNavigate}
    className={`${LINK_CLASS} inline-flex items-center gap-1 text-[11px] no-underline`}
  >
    90-second version & résumé <ArrowRight size={11} />
  </ChatLink>
  <a
    href={`mailto:siddharthpandalai990@gmail.com?subject=${encodeURIComponent(
      `Fit check — ${report.role ?? "your role"} (${report.score}/100)`,
    )}&body=${encodeURIComponent(jdFitText(report))}`}
    className={`${LINK_CLASS} ml-auto inline-flex items-center gap-1 text-[11px] no-underline`}
  >
    Email this to me <ArrowRight size={11} />
  </a>
</footer>
```
`jdFitText` is already exported from `chatBlocks.ts` — this is the one place on the whole site this
address is hardcoded rather than pulled from `profile.email`; `ChatWidgets.tsx` doesn't currently
import `profile.ts`, so either add that import (`profile.email`, same as `SiteFooter.tsx`/`Terminal.tsx`
already do) or pass the address down as a prop — prefer the import, it's the pattern the rest of the
site already uses. `/hire` needs no changes — it already is the destination this hands off to.

### 3. A dedicated copy button on the card (high value, low risk — and load-bearing once #1 ships)

**File:** `src/ChatWidgets.tsx` (`JdFitCard` header).

Once the card can render outside the console (change #1), the console's per-message copy icon
(`FloatingChat.tsx:659-660`) isn't there to lean on. Give the card its own:

```tsx
<button
  onClick={async () => {
    try { await navigator.clipboard.writeText(jdFitText(report)); setJustCopied(true); setTimeout(() => setJustCopied(false), 1500); }
    catch { /* clipboard blocked — nothing useful to say */ }
  }}
  className="..."
  aria-label="Copy fit scorecard"
>
  {justCopied ? <Check size={13} /> : <Copy size={13} />} Copy
</button>
```
Same 1.5s-then-revert pattern already used by `copyReply` (`FloatingChat.tsx:448-458`) — same icons
(`Check`/`Copy` already imported in `ChatWidgets.tsx` via lucide-react, just add the import), same
UX, no new pattern invented.

### 4. Provenance badge (medium value, low risk)

**Files:** `src/lib/chatBlocks.ts` (`JdFitReport`, `parseJdFit`), `api/_lib/jd-prompt.ts` (no change
needed — the model doesn't need to know this field exists), `src/lib/skillMatch.ts` (`toFitReport`),
`src/ChatWidgets.tsx` (`JdFitCard`).

Add an optional `source?: "ai" | "offline"` to `JdFitReport`. `toFitReport` always sets
`source: "offline"`. `parseJdFit` doesn't read it from the model's JSON (the model never emits it) —
it's set by the caller once a model chunk is known to have arrived, e.g. in the new `useJdFit`/
`runJdFit` from change #1, the same place `superseded` already flips to `true`:
`{ ...parsedReport, source: "ai" }`. Render as a small chip next to the score:

```tsx
<span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${
  report.source === "offline" ? "border-line text-muted" : "border-accent/40 text-accent"
}`}>
  {report.source === "offline" ? "instant match" : "AI read"}
</span>
```
This is additive to the schema (`parseJdFit` already treats unknown/missing fields as absent), so it
can't break an in-flight stream and needs no prompt change.

### 5. Match/gap count visible at a glance (medium value, low risk)

**File:** `src/ChatWidgets.tsx` (`JdFitCard` header, next to the score).

```tsx
<span className="font-mono text-[10px] tabular-nums text-muted">
  {report.strengths.length} matched · {report.gaps.length} gap{report.gaps.length === 1 ? "" : "s"}
</span>
```
So the gap count is readable in the header, before anyone scrolls past the strengths list — directly
serves "honesty about gaps made visible rather than buried," independent of whether change #1 ships.

### 6. `tabular-nums` on the score (low value, trivial risk)

**File:** `src/ChatWidgets.tsx:179`. Add `tabular-nums` to the score `<span>`'s className. One word.
Matches the existing convention in `src/chess/ChessFindings.tsx:160,171,186` and stops the digit
width from shifting when the offline score is replaced by the model's.

### 7. Auto-expand the console when JD fit still runs there (low value, low risk, only matters if #1 is deferred)

**File:** `src/FloatingChat.tsx`, in the `open-chat` listener (~line 269-274). When `detail.mode ===
"jd"`, also `setExpanded(true)` before the analysis starts — a scorecard deserves the wide view, not
the 370px default. If change #1 ships, this only matters for the "ask a follow-up" hand-off path, but
it's a two-line change either way.

## A11y + reduced-motion + SSR notes

- **SSR:** none of this reads `Date`/`window`/`Math.random` at render time. `useJdFit`'s `run()` only
  executes from a click/submit handler, same as today's `send()`. The `mailto:` href in change #2 is
  built from static profile data and the report already in state — no client-only value leaks into
  server-rendered markup.
- **axe, no allowlist:** `JdFitCard` already carries `aria-label="Job description fit analysis"` on
  its `<section>` — keep it whichever component renders it now. The new footer's two links/anchor need
  visible text (already do above) and normal focus styles — reuse `LINK_CLASS`, don't invent a new
  focus treatment. The copy button (change #3) needs `aria-label="Copy fit scorecard"` since its
  visible label is icon + "Copy" but the icon swaps on click — same pattern `copyReply`'s button
  already passes axe with.
- **Streaming region:** wrap the inline card's container in `role="log" aria-live="polite"` exactly as
  the console does (`FloatingChat.tsx:595-596`) — don't invent a second live-region convention for the
  same content type. Polite, never assertive: the score updates itself once (offline → model), it
  should not interrupt whatever the screen reader user is doing.
- **Reduced motion:** none of these changes add motion. If the inline card's first appearance gets a
  reveal transition (consistent with the rest of the section, which already wraps content in
  `<Reveal>`), that component already needs to be reduced-motion-safe site-wide — verify it is, don't
  add a second, unguarded transition next to it.
- **No giant decorative type:** the score is a real, meaningful number a screen reader must read as
  text — it must stay DOM text, not become SVG. (The giant-type SVG rule in the constraints is for
  decorative display type; this number is content, not decoration.)

## What NOT to do

- **Don't remove the console's JD path.** `/jd`, the slash command, and the "ask a follow-up" link all
  still need it. Change #1 redirects the *homepage section's* primary flow to render inline; it does
  not delete or gate the console's own `/jd` command, which stays exactly as useful for someone who's
  already mid-conversation with the assistant.
- **Don't call `streamReply` twice per submission.** If change #1 ships, `FitCheck.tsx` must be the
  only caller for that specific submit — don't also fire `openJdFit()` on the same click "just in case
  the console should show it too." That doubles cost against `JD_RATE_WINDOWS` (3/min, 12/hour per
  IP) for zero benefit, since the same report can simply be handed to the console via the follow-up
  link instead.
- **Don't add a shareable permalink (`/fit?data=...` or a URL-hash-encoded report).** It sounds like
  the "shareable result" this doc asks for, but it's a materially bigger lift (a new route, hash
  parsing, deciding how long a link stays valid, deciding what happens when `profile.ts` changes
  underneath an old link) for a use case `mailto:` + copy already cover. Don't build it speculatively.
- **Don't add a PDF export.** No dependency for it exists in the repo and `jdFitText()` plus `mailto:`
  already produce something a recruiter can paste into an ATS note or forward as-is. A PDF is a
  "later can scaffold for itself" feature, not a level-2 one.
- **Don't invent a new score-provenance vocabulary.** "AI read" / "instant match" (change #4) should
  read as a strict subset of what `toFitReport`'s `summary` sentence already says — don't let the
  badge and the sentence drift into disagreeing about what kind of answer this is.
- **Don't touch `api/_lib/jd-prompt.ts` or the rubric for any of this.** Every change above is client
  rendering and wiring; the scoring, the gap-floor, the injection guardrails in the prompt are already
  correct and are out of scope here.
- **Don't restyle `JdFitCard` for CAL-1 beyond `tabular-nums` (change #6) as part of this pass.** The
  amber/cyan re-theme is a site-wide token change, not a fit-check-specific one — doing it piecemeal
  here risks the card looking reskinned while the rest of the console hasn't caught up yet.
