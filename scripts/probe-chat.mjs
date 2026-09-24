// Probes a live /api/chat endpoint with a fixed set of questions and fails if
// any answer ends without a sentence terminator or a closing markdown block —
// the visible symptom of the length-stop truncation bug fixed in
// api/_lib/chat-handler.ts's normalizeStream (production: "…It features a
// 44-module registry" then [DONE]).
//
// MANUAL / PHASE-CLOSE TOOL, NOT A REQUIRED CI GATE: it spends real provider
// tokens against a live deployment, so it is never wired into a build or test
// script that runs unattended. Run it by hand after a chat-handler.ts change
// or a deploy, against a preview or production URL.
//
//   node scripts/probe-chat.mjs --base <url> [--n <count>]
//   node scripts/probe-chat.mjs --base=<url> [--n=<count>]   # = form also works
//   node scripts/probe-chat.mjs --self-test   # no network, checks the logic
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// One turn each, spanning the facts most likely to run long enough to hit a
// token ceiling (module counts, multi-item lists) — the shape that actually
// triggered the production bug.
export const QUESTIONS = [
  "What is PaymentsLab-KMP?",
  "Tell me about Doori.",
  "What's his experience with Kotlin Multiplatform?",
  "What did he build at Dice.tech?",
  "What is Gaddi?",
  "Tell me about the kmp-family toolkit.",
  "What's his GPS and location tracking work?",
  "What is Candidai?",
  "Tell me about his chess hobby.",
  "What rooms are on this site?",
];

/**
 * A reply is "complete" when it ends at a sentence terminator, a closing
 * markdown block (code fence, a `[[card]]` directive), or similar — anything
 * else, especially a trailing colon or a bare word, is the truncation shape
 * this probes for.
 *
 * ponytail: a heuristic, not a parser — same ceiling as chat-handler.ts's
 * lastSentenceEnd, which this deliberately mirrors so the probe and the fix
 * agree on what "complete" means.
 */
export function looksComplete(text) {
  const t = text.trim();
  if (!t) return false;
  if (/```$/.test(t)) return true; // closes a fenced code block
  if (/\]\]$/.test(t)) return true; // closes a [[card]] directive
  if (/[.!?][)"'\]]*$/.test(t)) return true; // ordinary sentence end
  return false;
}

async function askOnce(base, question) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (typeof evt.text === "string") text += evt.text;
      } catch {
        // partial or non-JSON event — skip
      }
    }
  }
  return text;
}

// Accepts both `--flag value` and `--flag=value` — the acceptance criteria
// and this file's own usage comment used to disagree on which one worked.
export function getFlag(argv, name) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

function parseArgs(argv) {
  const base = getFlag(argv, "base") ?? "";
  const n = Number(getFlag(argv, "n") ?? 10);
  return { base, n: Number.isFinite(n) && n > 0 ? Math.min(n, QUESTIONS.length) : QUESTIONS.length };
}

async function main() {
  const { base, n } = parseArgs(process.argv.slice(2));
  if (!base) {
    console.error("usage: node scripts/probe-chat.mjs --base <url> [--n <count>]");
    process.exit(2);
  }

  const questions = QUESTIONS.slice(0, n);
  const bad = [];
  let complete = 0;

  for (const q of questions) {
    try {
      const text = await askOnce(base, q);
      if (looksComplete(text)) {
        complete++;
      } else {
        bad.push({ q, tail: text.slice(-100) });
      }
    } catch (err) {
      bad.push({ q, tail: `ERROR: ${err.message}` });
    }
    await sleep(300); // stay well under the endpoint's own 10/min rate limit
  }

  console.log(`probe-chat: ${complete}/${questions.length} complete answers from ${base}`);
  if (bad.length) {
    console.error("Incomplete or failed answers:");
    for (const b of bad) console.error(`  - "${b.q}" -> …${b.tail}`);
    process.exit(1);
  }
}

/** No-network self-check for looksComplete — the only real logic in this
 *  file. `node scripts/probe-chat.mjs --self-test` */
function selfTest() {
  assert.equal(looksComplete("It features a 46-module registry."), true);
  assert.equal(looksComplete("It features a 46-module registry with real"), false); // the production bug shape
  assert.equal(looksComplete(""), false);
  assert.equal(looksComplete("```kotlin\nval x = 1\n```"), true);
  assert.equal(looksComplete("Check out [[rooms]]"), true);
  assert.equal(looksComplete("Here's the breakdown:"), false); // promises a list that never arrived
  assert.equal(looksComplete("Yes, he built that."), true);

  // both invocation forms from the usage comment must parse the same way
  assert.deepEqual(parseArgs(["--base", "https://x.test", "--n", "3"]), { base: "https://x.test", n: 3 });
  assert.deepEqual(parseArgs(["--base=https://x.test", "--n=3"]), { base: "https://x.test", n: 3 });

  console.log("probe-chat: self-test OK");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else main();
}
