/**
 * The AI funnel, drawn from the code that actually runs it (idea-atlas
 * SYS-8). Every stage names the real exported symbol that performs it and
 * the file it lives in, never a private tier name or routing config
 * (idea-atlas's own "Candidai's tier-router vocabulary" reject). Rendered on
 * /ops through the site's existing lazy Mermaid path (idea-atlas SYS-8, I6).
 *
 * aiFunnel.test.ts asserts every symbol below is a real export of its file,
 * so this diagram cannot silently drift from the pipeline it claims to
 * describe; see idea-atlas SYS-11's "wiring guard" doctrine applied here
 * to the funnel itself, not just the endpoint markers.
 */

export interface AiFunnelStage {
  id: string;
  label: string;
  /** The real exported symbol this stage names. */
  symbol: string;
  /** Path relative to the repo root. */
  file: string;
  /** One sentence, the site's own language. */
  detail: string;
}

export const AI_FUNNEL_STAGES: AiFunnelStage[] = [
  {
    id: "cors",
    label: "CORS",
    symbol: "isAllowedOrigin",
    file: "api/_lib/chat-handler.ts",
    detail: "Only this site's own origin (or the native CMP client) may open the stream.",
  },
  {
    id: "rate-limit",
    label: "Rate limit",
    symbol: "checkRateLimit",
    file: "api/_lib/chat-handler.ts",
    detail: "A sliding window per client, tighter for the more expensive JD mode.",
  },
  {
    id: "estimate-tokens",
    label: "Estimate tokens",
    symbol: "estimateTokens",
    file: "api/_lib/chat-handler.ts",
    detail: "Sizes the outgoing request off what was actually sent, after condensing.",
  },
  {
    id: "pick-providers",
    label: "Pick providers",
    symbol: "pickProviders",
    file: "api/_lib/chat-handler.ts",
    detail: "Orders the configured providers by what this request actually costs.",
  },
  {
    id: "prompt-guard",
    label: "Prompt guard",
    symbol: "applyPromptGuard",
    file: "api/_lib/prompt-guard.ts",
    detail: "Fences the newest user turn and reasserts the output contract after it.",
  },
  {
    id: "provider-fallback",
    label: "Provider fallback",
    symbol: "classifyUpstream",
    file: "api/_lib/chat-handler.ts",
    detail: "Walks the provider ladder; a throttled or down rung tries the next one.",
  },
  {
    id: "stream",
    label: "Stream",
    symbol: "normalizeStream",
    file: "api/_lib/chat-handler.ts",
    detail: "Normalizes each provider's SSE shape into one delta format for the client.",
  },
];

/** Pure and deterministic: same stages in, same Mermaid source out. */
export function mermaidFromAiFunnel(stages: AiFunnelStage[] = AI_FUNNEL_STAGES): string {
  const lines = ["graph LR"];
  stages.forEach((stage, i) => {
    lines.push(`  ${stage.id}["${stage.label}"]`);
    if (i > 0) lines.push(`  ${stages[i - 1].id} --> ${stage.id}`);
  });
  return lines.join("\n");
}
