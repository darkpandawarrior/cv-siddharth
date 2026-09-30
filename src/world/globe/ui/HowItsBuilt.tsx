import { useState } from "react";
import { buildHowItsBuiltEntries, type Provenance } from "./howItsBuiltData.ts";

// LANE V7 (wave 7, "How it's built" panel). Its own lazy chunk (Inspector.tsx
// only React.lazy()-imports this file), so a visitor who never opens it never
// pays for it -- check-budget.mjs proves it never lands in the eager Globe
// chunk.

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {
            // Clipboard permission denied or unavailable (e.g. an insecure
            // context) -- no crash, and never claim a copy that didn't happen.
          });
      }}
      className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// GLSL syntax colouring: CSS classes only, no highlighting dependency. A
// small regex tokenizer classifies each token; every shade below is the
// existing zinc scale Inspector.tsx already uses for text (never a brand
// token -- --color-signal/--color-probe are reserved for live/claim data,
// per globe-lanes.md's colour rule, and a shader listing is neither).
const GLSL_KEYWORDS = new Set(["void", "uniform", "varying", "if", "else", "return", "const"]);
const GLSL_TYPES = new Set(["vec2", "vec3", "vec4", "mat3", "mat4", "float", "int", "bool", "sampler2D"]);
const TOKEN_RE = /(\/\/[^\n]*)|(#include\s*<[^>]*>)|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z0-9_]+)/g;

function tokenizeGlsl(code: string): { text: string; cls: string }[] {
  const tokens: { text: string; cls: string }[] = [];
  const re = new RegExp(TOKEN_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const [text, comment, directive, num, word] = m;
    if (comment || directive) tokens.push({ text, cls: "text-zinc-500" });
    else if (num) tokens.push({ text, cls: "text-zinc-400" });
    else if (word) tokens.push({ text, cls: GLSL_KEYWORDS.has(word) ? "text-zinc-100 font-semibold" : GLSL_TYPES.has(word) ? "text-zinc-200" : "text-zinc-300" });
    else tokens.push({ text, cls: "text-zinc-500" });
  }
  return tokens;
}

function ShaderBlock({ name, code }: { name: string; code: string }) {
  const tokens = tokenizeGlsl(code);
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-zinc-500">{name}</span>
        <CopyButton text={code} />
      </div>
      <pre
        tabIndex={0}
        className="max-h-48 overflow-auto rounded-lg border border-line/60 bg-ink/70 p-2 font-mono text-xs leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={t.cls}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function ProvenanceRow({ p }: { p: Provenance }) {
  return (
    <div className="mb-1.5 rounded-lg border border-line/60 p-2">
      <p className="text-zinc-300">{p.label}</p>
      <p className="break-all text-muted" title={p.endpoint}>
        {p.endpoint}
      </p>
      {p.fetchedAt && <p className="text-muted">fetched {p.fetchedAt}</p>}
      <p className="text-muted">{p.licenceUrl ? <a href={p.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline">{p.licence}</a> : p.licence}</p>
    </div>
  );
}

export default function HowItsBuilt() {
  const entries = buildHowItsBuiltEntries();
  return (
    <div data-how-its-built className="mt-2 max-h-64 overflow-y-auto rounded-2xl glass-panel p-3 font-mono text-xs text-zinc-300">
      {entries.map((e) => (
        <section key={e.id} className="mb-3 last:mb-0">
          <h4 className="mb-1 break-words text-zinc-100">{e.title}</h4>
          {e.description && <p className="mb-2 break-words">{e.description}</p>}
          {e.shaders.map((s, i) => (
            <ShaderBlock key={i} name={s.name} code={s.code} />
          ))}
          {e.provenance.map((p, i) => (
            <ProvenanceRow key={i} p={p} />
          ))}
        </section>
      ))}
    </div>
  );
}
