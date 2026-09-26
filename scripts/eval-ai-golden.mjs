#!/usr/bin/env node
// eval-ai-golden.mjs
//
// idea-atlas SYS-11 / master-plan M31 (critic C4 fix): the golden eval that
// checks the JD analyser's score against 5 synthetic fixtures with expected
// bands, WITHOUT ever being a required PR gate. It calls a real model, so a
// run is inherently non-deterministic (model sampling, provider-side version
// drift), so it belongs only in .github/workflows/ai-golden-eval.yml (dispatch
// + weekly, added by P2-wire), never in the build gate this repo requires
// for every merge (npx tsc -b && npm run lint && npx vitest run && npm run
// build). Without a provider key configured, this writes status "not-run"
// and exits 0. With a key, a band miss is recorded and shown on /ops as
// "last measured: N/5, <date>", never turned into a failing exit code, so a
// required gate elsewhere can never go red on sampling variance (SYS-3's own
// "marked, not hidden" doctrine, applied to the site's own AI gate).
//
// ponytail: this reuses the SAME condense/guard/parse pipeline pieces
// chat-handler.ts calls (condenseJd, promptFence's guard, chatBlocks'
// parseJdFit, all leaf modules with zero imports of their own), but calls
// each provider directly with `stream: false` instead of importing
// chat-handler.ts's PROVIDERS/pickProviders/normalizeStream. Those import
// api/_lib siblings by `.js` specifier (e.g. "./system-prompt.js"), a
// convention @vercel/node's own bundler rewrites at deploy time; this script
// runs under plain `node` in a GitHub Actions job with no bundler, where
// that specifier cannot resolve to the sibling .ts file. Ceiling: the four
// endpoint/model defaults below can drift from chat-handler.ts's own copy.
// Upgrade path: once this script is invoked through the same bundler-aware
// runner chat-handler.test.ts already runs under (vitest), replace this
// block with a direct import of PROVIDERS/pickProviders/normalizeStream.
import { writeFileSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { condenseJd } from "../api/_lib/jd-condense.ts";
import { JD_SYSTEM_PROMPT } from "../api/_lib/jd-prompt.ts";
import { guard } from "../src/lib/promptFence.ts";
import { parseJdFit } from "../src/lib/chatBlocks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = join(root, "e2e/fixtures/jd-golden");
const OUT_FILE = join(root, "src/data/generated/aiEval.ts");

// Same four env vars chat-handler.ts's PROVIDERS array checks, same model
// defaults, same override vars, kept in this one place, not fanned out
// across the file.
const PROVIDERS = [
  {
    name: "groq",
    key: process.env.GROQ_API_KEY,
    call: async (key, system, content) => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
          messages: [{ role: "system", content: system }, { role: "user", content }],
          max_tokens: 1024,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? null;
    },
  },
  {
    name: "gemini",
    key: process.env.GEMINI_API_KEY,
    call: async (key, system, content) => {
      const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: content }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      return text || null;
    },
  },
  {
    name: "cerebras",
    key: process.env.CEREBRAS_API_KEY,
    call: async (key, system, content) => {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.CEREBRAS_MODEL ?? "llama-3.3-70b",
          messages: [{ role: "system", content: system }, { role: "user", content }],
          max_tokens: 1024,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? null;
    },
  },
  {
    name: "anthropic",
    key: process.env.ANTHROPIC_API_KEY,
    call: async (key, system, content) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.content?.find((b) => b.type === "text")?.text ?? null;
    },
  },
].map((p) => ({ ...p, key: p.key || null })); // undefined -> null, a clean falsy check below

function loadFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")));
}

/** One fixture through the real fence/condense pipeline and the provider
 *  ladder; null score/provider if every configured provider fails. */
async function evalFixture(fixture, providers) {
  const guarded = guard(condenseJd(fixture.jdText), "jd");
  for (const provider of providers) {
    let text;
    try {
      text = await provider.call(provider.key, JD_SYSTEM_PROMPT, guarded);
    } catch {
      continue; // this candidate is down; the next one is always worth trying
    }
    if (!text) continue;
    const report = parseJdFit(text);
    if (!report) continue;
    return { id: fixture.id, score: report.score, provider: provider.name };
  }
  return { id: fixture.id, score: null, provider: null };
}

function writeResult(result) {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const body = `// AUTO-GENERATED by scripts/eval-ai-golden.mjs. Do not edit by hand.
// idea-atlas SYS-11: 5 synthetic JD fixtures (e2e/fixtures/jd-golden/*.json)
// run through the real fence/condense pipeline. Only ever run from
// .github/workflows/ai-golden-eval.yml (dispatch + weekly), never a
// required PR gate; see this file's own header for why. A band miss is
// descriptive here and on /ops, never a build failure (master-plan M31).
export interface AiEvalRow {
  id: string;
  score: number | null;
  withinBand: boolean | null;
  provider: string | null;
}
export interface AiEval {
  status: "not-run" | "measured";
  measuredAt: string | null;
  rows: AiEvalRow[];
  summary: string;
}
export const aiEval: AiEval = ${JSON.stringify(result, null, 2)};
`;
  writeFileSync(OUT_FILE, body);
}

async function main() {
  const providers = PROVIDERS.filter((p) => p.key);
  if (providers.length === 0) {
    writeResult({
      status: "not-run",
      measuredAt: null,
      rows: [],
      summary: "not run (no key in this environment)",
    });
    console.log("eval-ai-golden: no provider key configured, wrote status 'not-run'.");
    return;
  }

  const fixtures = loadFixtures();
  const rows = [];
  for (const fixture of fixtures) {
    const result = await evalFixture(fixture, providers);
    const withinBand =
      result.score === null ? null : result.score >= fixture.band.min && result.score <= fixture.band.max;
    rows.push({ id: result.id, score: result.score, withinBand, provider: result.provider });
  }
  const measured = rows.filter((r) => r.withinBand !== null);
  const passCount = rows.filter((r) => r.withinBand === true).length;
  const measuredAt = new Date().toISOString().slice(0, 10);
  writeResult({
    status: "measured",
    measuredAt,
    rows,
    summary: `${passCount}/${measured.length} within band, ${measuredAt}`,
  });
  console.log(`eval-ai-golden: ${passCount}/${measured.length} within band.`);
}

main().catch((err) => {
  // Never a build failure (M31): a thrown error still writes a legible
  // record instead of leaving aiEval.ts stale, and always exits 0.
  console.error("eval-ai-golden: run failed, writing an error record:", err);
  writeResult({ status: "not-run", measuredAt: null, rows: [], summary: `not run (error: ${String(err)})` });
});
