// Fails the build when the answer layer (arch-L11) stops being true:
//   1. a citation anchor no longer resolves in the actual built HTML,
//   2. the FAQPage / Article JSON-LD it emits stops being structurally valid,
//   3. an answer's own prose has been hand-retyped into a second file.
//
// WHY A REAL BUILD, NOT A UNIT TEST. `src/data/source/answers.ts` cites real
// DOM ids that live on OTHER pages (a home section, a project's <main>, the
// résumé) — a unit test importing those components in isolation would prove
// nothing about whether the id survives a real `vite build`. So this script
// builds the site (unless SKIP_BUILD=1, for a caller that already just did),
// boots `vite preview` on its own port, and fetches the real response bytes.
//
// Run standalone: `node scripts/check-answers.mjs`. Wired as `npm run
// check:answers`. CHECK_ANSWERS_PORT overrides the default port (kept off
// 4173/Playwright's ports so a parallel `npm run serve`/e2e run never
// collides with this one).
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ANSWERS } from "../src/data/source/answers.ts";
import { buildFaqJsonLd, parseAnchor } from "../src/lib/faqJsonLd.ts";
import { buildArticleJsonLd } from "../src/lib/project-jsonld.ts";
import { projects } from "../src/data/profile.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.CHECK_ANSWERS_PORT ?? "4310";
const BASE = `http://localhost:${PORT}`;
const failures = [];

// ── 1. Structural JSON-LD validity ──────────────────────────────────────
const faq = buildFaqJsonLd(ANSWERS);
if (faq["@type"] !== "FAQPage") failures.push("FAQPage: @type is not FAQPage");
if (faq.mainEntity.length !== ANSWERS.length) failures.push(`FAQPage: mainEntity has ${faq.mainEntity.length} entries, expected ${ANSWERS.length}`);
for (const q of faq.mainEntity) {
  if (q["@type"] !== "Question" || typeof q.name !== "string" || !q.name) failures.push(`FAQPage: malformed Question entry: ${JSON.stringify(q)}`);
  if (q.acceptedAnswer?.["@type"] !== "Answer" || typeof q.acceptedAnswer?.text !== "string" || !q.acceptedAnswer.text)
    failures.push(`FAQPage: malformed acceptedAnswer for "${q.name}"`);
}

const articleProject = projects.find((p) => p.detail);
if (!articleProject) failures.push("Article: no project with `detail` exists to build one from");
else {
  const article = buildArticleJsonLd(articleProject);
  if (article?.["@type"] !== "Article") failures.push("Article: @type is not Article");
  if (!article?.headline) failures.push("Article: missing headline");
  if (!article?.articleBody) failures.push("Article: missing articleBody");
  if (!article?.url?.startsWith("http")) failures.push("Article: url is not absolute");
}

// ── 2. No answer text hand-retyped into a second file ───────────────────
// Scoped to src/ (api/_lib/system-prompt.ts and public/llms*.txt are
// GENERATED from this same array — a mechanical copy, not a second hand-
// authored source — so they're outside this scan by construction, not by an
// exclusion list).
const SOURCE_FILE = join(root, "src", "data", "source", "answers.ts");
function walkTs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}
const srcFiles = walkTs(join(root, "src")).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
for (const a of ANSWERS) {
  for (const field of [a.question, a.answer]) {
    const owners = srcFiles.filter((f) => f.text.includes(field)).map((f) => f.path);
    const extra = owners.filter((p) => p !== SOURCE_FILE);
    if (extra.length) failures.push(`duplicate text (also hand-typed in ${extra.join(", ")}): "${field}"`);
  }
}

// ── 3. Every citation anchor resolves in the real built HTML ────────────
async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return; // server is up and answering, even a 404 proves that
    } catch {
      /* not listening yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`preview server did not come up on ${url} within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function checkAnchors() {
  const byPath = new Map();
  for (const a of ANSWERS) {
    const { path, id } = parseAnchor(a.anchor);
    if (!byPath.has(path)) byPath.set(path, new Set());
    byPath.get(path).add(id);
  }

  for (const [path, ids] of byPath) {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
      failures.push(`anchor: ${path} returned HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    for (const id of ids) {
      const re = new RegExp(`id=["']${id}["']`);
      if (!re.test(html)) failures.push(`anchor: ${path}#${id} — no element with id="${id}" in the built HTML`);
    }
  }
}

async function main() {
  if (!process.env.SKIP_BUILD) {
    console.log("check-answers: building…");
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  }

  console.log(`check-answers: starting preview on :${PORT}…`);
  const server = spawn("npx", ["vite", "preview", "--port", PORT, "--strictPort"], { cwd: root, stdio: "pipe" });
  let serverErr = "";
  server.stderr?.on("data", (d) => { serverErr += String(d); });

  try {
    await waitForServer(BASE);
    await checkAnchors();
  } finally {
    server.kill();
  }

  if (failures.length) {
    console.error(`check-answers: ${failures.length} failure(s):\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
    if (serverErr) console.error(`preview server stderr:\n${serverErr}`);
    process.exit(1);
  }
  console.log(
    `check-answers: ${ANSWERS.length} answers, ${ANSWERS.length} citation anchors resolved, FAQPage + Article valid, no duplicate text.`,
  );
}

main().catch((err) => {
  console.error("check-answers: crashed —", err);
  process.exit(1);
});
