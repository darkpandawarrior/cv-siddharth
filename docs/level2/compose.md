# The Compose Playground — Level 2

Files this spec touches:
- `src/ComposePlayground.tsx`
- `src/composeInterpreter.ts`
- `src/routes/compose.tsx`
- `api/_lib/compose-prompt.ts` (read-only reference, not changed)

## Current state (honest)

This is the strongest engineering artifact on the site and it undersells itself. What exists today:

- **Real interpreter.** `composeInterpreter.ts` is a hand-written tokenizer (`tokenize`) → recursive-descent parser (`class Parser`) → AST (`Program`/`Node`/`Expr`) → `renderNode` walk in `ComposePlayground.tsx`. No regex-templating, no lookup table. State is genuine: `applyActions` mutates a `StateMap` and React recomposes.
- **7 presets** (`PRESETS` in `ComposePlayground.tsx`, lines 353–536): Counter, Profile card, Toggle, Kursi role, Mileway, Animation, Layout. Good breadth — state, DS-token integration, `AnimatedVisibility`, layout weights.
- **AI generation** via `streamChat` → `/api/chat` with `mode: "compose"`, constrained by a real server-side grammar (`COMPOSE_SYSTEM_PROMPT`). This is honest: the model is generating into the *same* limited grammar the hand-parser accepts, not a separate more-capable path.
- **Error handling exists but is thin.** A parse failure throws a plain `Error` (e.g. `Expected "}" near "end of code"`) with no position — the visitor sees the message but has no way to find the offending character in a textarea with no line/column markers beyond the static gutter.
- **No proof-of-realness affordance.** Nothing in the UI demonstrates *why* this is a parser and not a canned demo. A skeptical engineer has to take the code comment's word for it, or open devtools.
- **No sharing.** A visitor who builds something interesting in the phone frame has no way to hand it to anyone — not a URL, not a copy button. The artifact's shareability (the thing that would get it linked from a LinkedIn comment or forwarded in a recruiter Slack) is zero.
- **The "supported" footer bar is truncated with only a `title` tooltip** (`ComposePlayground.tsx` line 866) — inaccessible on touch, and doesn't invite exploration since it just says what already fits on one truncated line.
- A11y baseline is decent: buttons get `aria-label`, motion is gated by `MOTION_OK`/`prefers-reduced-motion`, haptics no-op safely. But the error panel has no `aria-live`, so a screen-reader user editing code gets no announcement when a parse fails.

## What level 2 is

Right now the playground *works* and *looks* impressive for the ~8 seconds someone spends on it before scrolling on. Level 2 means: the first 5 seconds prove it's real (not told, *shown* — structurally, the way the rest of the site's thesis works), the first mistake a visitor makes teaches them something instead of just failing quietly, and the thing they build is one click from being a URL they can send someone. Concretely: a parse-tree view that makes "hand-written parser" self-evident, error messages with a line/column a human can act on, a share link, and a couple of small honesty/access fixes that were already overdue. No new dependencies, no new files — everything below lives inside the three files already doing this job.

## Concrete changes, ordered by value ÷ risk

### 1. Shareable snippets via URL param (highest value, lowest risk)

**Files:** `src/ComposePlayground.tsx`

Add a `c` search param that round-trips the editor contents. No compression library, no backend — `encodeURIComponent` + `btoa`/`atob`, which is native and sufficient (presets run 300–900 chars; even a sprawling visitor snippet stays well under any URL length concern).

```ts
// near the top of ComposePlayground.tsx, alongside the other pure helpers
function encodeShare(code: string): string {
  return btoa(encodeURIComponent(code)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeShare(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(atob(b64));
  } catch {
    return null; // malformed param — fall through to the default preset, never throw on load
  }
}
```

Initial state becomes a lazy initializer (the component only ever mounts client-side — the route already sets `ssr: false` in `src/routes/compose.tsx` — so reading `window.location` here is safe and doesn't need a `typeof window` guard beyond what the file already does elsewhere):

```ts
const [code, setCode] = useState<string>(() => {
  const c = new URLSearchParams(window.location.search).get("c");
  const decoded = c ? decodeShare(c) : null;
  return decoded ?? PRESETS[0].code;
});
```

Add a **Share** button next to the existing Reset button (same row, `ComposePlayground.tsx` ~line 740):

```tsx
<button
  onClick={async () => {
    const url = `${location.origin}${location.pathname}?c=${encodeShare(code)}`;
    await navigator.clipboard.writeText(url);
    setShareNote("link copied");
    setTimeout(() => setShareNote(null), 2000);
  }}
  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
>
  <Share2 size={12} /> Share
</button>
```

(`Share2` from `lucide-react`, already a project dependency — add to the existing import line 2.) `shareNote` is one more `useState<string | null>`, rendered as a small `aria-live="polite"` confirmation next to the button — reuses the exact pattern `aiNote` already uses lower in the file, so no new UI idiom.

`→ skipped: URL compression (LZ-string etc.) and a backend snippet store (short IDs, a KV table). Add compression only if a real preset regularly exceeds ~1500 chars after encoding; add a backend store only if someone asks for snippets to survive a full site redesign that changes the encoding scheme.`

### 2. "View parse tree" toggle — the actual proof (high value, low-medium risk)

**Files:** `src/ComposePlayground.tsx`

This is the direct answer to "how it proves it's a real interpreter." Don't write copy claiming it — show the AST. Add a two-way tab above the phone frame, replacing "simulated preview · state is live" as the *only* framing:

```tsx
const [view, setView] = useState<"preview" | "ast">("preview");
```

```tsx
<div className="flex items-center gap-1 rounded-full border border-line p-0.5 text-[11px] font-mono">
  <button onClick={() => setView("preview")} aria-pressed={view === "preview"}
    className={view === "preview" ? "rounded-full bg-accent px-3 py-1 text-ink" : "rounded-full px-3 py-1 text-muted"}>
    preview
  </button>
  <button onClick={() => setView("ast")} aria-pressed={view === "ast"}
    className={view === "ast" ? "rounded-full bg-accent px-3 py-1 text-ink" : "rounded-full px-3 py-1 text-muted"}>
    parse tree
  </button>
</div>
```

When `view === "ast"`, render `program` as formatted JSON instead of the phone frame contents, in the same 520px scroll region:

```tsx
<pre className="h-[520px] overflow-auto whitespace-pre-wrap break-words bg-[#0b0f0d] p-4 font-mono text-[11px] leading-relaxed text-accent2">
  {program ? JSON.stringify(program, null, 2) : ""}
</pre>
```

This is what actually moves the "canned demo" skepticism: a visitor can edit `fontSize = 72.sp` to `90.sp`, flip to the tree view, and watch the exact `{ t: "num", value: 90, unit: "sp" }` node change in real time — that's not fakeable by a lookup table. No new state derivation needed; `program` already exists in scope (line 678).

`→ skipped: syntax highlighting inside the JSON, a collapsible tree widget. Add if visitors' actual usage (once there's any signal — there isn't yet) shows people expanding it more than glancing.`

### 3. Error affordances — line/column instead of a bare message (medium-high value, medium risk)

**Files:** `src/composeInterpreter.ts`, `src/ComposePlayground.tsx`

Currently every thrown error is a bare `Error(string)`. Add position tracking with the smallest change that works: record a character offset per token, thread it through the one place that throws (`Parser.eatPunc` / the handful of inline `throw new Error(...)` calls), and compute line/col only when displaying, not while parsing.

`composeInterpreter.ts`:

```ts
type Tok = { pos: number } & (
  | { k: "id"; v: string }
  | { k: "num"; v: string }
  | { k: "str"; v: string }
  | { k: "punc"; v: string }
);
```

Tag each `toks.push(...)` call in `tokenize` with the offset the token *started* at (capture `const start = i;` before consuming, push `pos: start`). One extra field, zero behavior change to existing call sites that only read `.k`/`.v`.

Add one exported class and one helper:

```ts
export class ComposeParseError extends Error {
  constructor(message: string, public line: number, public col: number) { super(message); }
}

function lineColAt(src: string, pos: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, col };
}
```

`Parser` gets the source string in its constructor (`constructor(private toks: Tok[], private src: string)`) purely to resolve positions on throw, and `describe()`/`eatPunc` wrap their throws:

```ts
private fail(message: string, at?: Tok): never {
  const pos = (at ?? this.peek() ?? this.toks[this.toks.length - 1])?.pos ?? this.src.length;
  const { line, col } = lineColAt(this.src, pos);
  throw new ComposeParseError(message, line, col);
}
```

Replace the dozen `throw new Error(...)` call sites in `composeInterpreter.ts` with `this.fail(...)` — mechanical, same message strings, no new copy to write. `parseCompose` doesn't change shape (`export function parseCompose(src: string): Program`), it just now can throw `ComposeParseError` instead of `Error`.

`ComposePlayground.tsx`, in the `useMemo` that calls `parseCompose` (line ~678):

```ts
const { program, error, errorLine } = useMemo(() => {
  try {
    return { program: parseCompose(live), error: null as string | null, errorLine: null as number | null };
  } catch (e) {
    if (e instanceof ComposeParseError) return { program: null, error: `Line ${e.line}, col ${e.col}: ${e.message}`, errorLine: e.line };
    return { program: null, error: e instanceof Error ? e.message : String(e), errorLine: null };
  }
}, [live]);
```

Two visible payoffs for one small threading change:
- The error panel (line ~849) now reads `Line 12, col 3: Expected "}" near "end of code"` instead of a bare message — actionable.
- The line-number gutter (`gutterRef`, line ~805) highlights `errorLine` in the error red: `className={i + 1 === errorLine ? "text-[#ff8f8f]" : undefined}` on the per-line `<div>`.

Also add `role="alert" aria-live="assertive"` to the error `<div>` (line 849) and `aria-describedby` linking it from the `<textarea>` when `error` is non-null — the one real a11y gap here, cheap to close.

`→ skipped: squiggly underlines inside the textarea (needs a contentEditable or CodeMirror-class overlay — that's a new dependency, off the ladder). Line-number-in-gutter + line/col-in-message gets 90% of the value for near-zero added surface.`

### 4. A "broken on purpose" preset — the second half of proving realness (low risk, medium value)

**Files:** `src/ComposePlayground.tsx`

Add one entry to `PRESETS` that's intentionally malformed:

```ts
{
  label: "Break it",
  code: `Column(modifier = Modifier.padding(24.dp)) {
    Text("this preset is missing a closing brace on purpose")
    Button(onClick = { count++ }) { Text("tap") }
`,
},
```

Paired with change #3, tapping this chip now produces a real, specific `Line 4, col 1: Expected "}" near "end of code"` — a visitor can then delete the trailing `}` on purpose, watch the error appear live, retype it, watch it resolve. That loop (break it, see exactly what broke, fix it, watch it recover) is a more convincing "this is a real parser" demonstration than any amount of about-this-project copy, and it costs one preset entry.

`→ skipped: multiple broken presets covering every error class. One is enough to teach the affordance exists; the visitor's own typos supply the rest.`

### 5. Turn the truncated "supported" bar into a real reference (low value, low risk — cleanup)

**Files:** `src/ComposePlayground.tsx`

Line 866's `<p>` with `title={SUPPORTED}` is dead to touch users and low-signal even on desktop (a tooltip on a truncated single line). Swap for a native disclosure — zero JS, native platform feature, rung 4 on the ladder:

```tsx
<details className="mx-auto max-w-7xl">
  <summary className="cursor-pointer font-mono text-[10px] text-muted marker:text-accent">
    supported grammar — {PRESETS.length} examples, tap to expand
  </summary>
  <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">{SUPPORTED}</p>
</details>
```

`<details>/<summary>` is keyboard- and screen-reader-native (no `role`/`aria-expanded` wiring needed, the browser supplies it), which is also the correct a11y answer, not just the lazy one.

## A11y + reduced-motion + SSR notes

- **SSR:** No change to the SSR posture. `src/routes/compose.tsx` already sets `ssr: false` and lazy-loads `ComposePlayground`; every addition above (`window.location`, `navigator.clipboard`) only ever executes after that client-only mount, same guarantee the file already leans on for `hapticTap`/`MOTION_OK`. Nothing here runs at module scope — the `useState` lazy initializer for `code` still only runs on first client render.
- **Reduced motion:** The preview/AST tab switch (#2) is a state swap with no transition by default — add `transition: MOTION_OK ? "opacity 0.2s ease" : undefined` on the swapped container if a crossfade is wanted, but a hard swap is also correct and needs no gate at all. Nothing else here introduces new motion.
- **Axe / a11y surface:** #3's `role="alert" aria-live="assertive"` on the error panel and `aria-describedby` on the textarea are net-new correctness, not just decoration — closes a real gap (silent-to-screen-reader parse failures). #5's `<details>` is a straight a11y upgrade over the current `title`-only truncation. The new Share/tab-toggle buttons need the same `aria-label`/`aria-pressed` discipline already used elsewhere in this file (see the existing Reset button for the pattern) — spelled out inline above.
- **Giant decorative type:** N/A — nothing here adds large DOM text; the AST view is monospace body-sized `<pre>`, not decorative.

## What NOT to do

- **Do not add a real Kotlin/JVM-in-WASM path.** The entire credibility of this feature is that it's honestly a simulation of a curated grammar, stated as such in the file header comment. A visitor who pastes real multi-file Compose and gets a `Line 1, col 1` error is the *correct* outcome, not a bug to chase — expanding grammar coverage is a separate, unbounded project or unless a specific commonly-attempted construct is actually annoying to leave out.
- **Do not build a snippet backend** (short URLs, a database of saved playgrounds, view counts). That's server surface, ongoing cost, and moderation risk for a solo-maintained public site, for a feature the base64 URL param already serves adequately.
- **Do not add a code-editing library** (CodeMirror/Monaco) to get squiggly-underline errors or syntax highlighting. It's a new dependency for a feature the line-number-gutter highlight already covers at acceptable fidelity, and it would balloon the lazy-loaded chunk this route exists specifically to keep small (see the route comment in `src/routes/compose.tsx`).
- **Do not rename or restructure `PRESETS`** into categories/tabs. Seven (soon eight) flat chips is still scannable; a taxonomy is solving a problem that doesn't exist yet.
- **Do not explain the AI-generation grammar constraint in visitor-facing copy** ("the AI can only use a limited subset..."). It's already honestly documented in code comments for the engineer who reads source; the visitor-facing proof is the parse-tree view and the Break-it preset doing the explaining structurally, not a paragraph.
