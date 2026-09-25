// Emits src/data/providers.ts from the sibling `PaymentsLab` checkout's 75
// provider docs (docs/providers/*.md), one Region/Archetype/Status-shipped
// catalog entry
// per file. idea-atlas.md#REC-2/#I3: one generator, three surfaces (the
// GatewayCompare widget, GatewayLab, and eventually the world's bell toran),
// none of them hand-typing a provider list of their own.
//
// Each doc writes its own free-text reasoning after the archetype letter
// (see docs/providers/acceptcard.md for the shape), so classifyArchetype
// reads only the leading token — see its own comment for the exact rule and
// the "other" bucket for the doc that genuinely doesn't fit (UPI's raw
// Android Intent has no SDK and no hosted checkout page).
//
// SIBLING KIND, same graceful-skip contract as gen-ops.mjs / gen-system-
// graph.mjs / gen-app-manifests.mjs: `PaymentsLab`'s docs/providers/ only
// exists checked out beside this repo on the maintainer's own machine (or
// refresh-media.yml's CI checkout, per L4). Absent sibling keeps whatever
// providers.ts already has committed, untouched byte-for-byte, and still
// exits 0 — a build machine with no sibling checkout is not a failure.
//
// Pure/IO-only building blocks are exported so a test can feed them fixture
// directories directly (no subprocess, no env var); only main() reads
// process.env and writes files, and it runs only when this file is executed
// directly — importing it for its exports never touches disk.
import { writeFileSync, existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src", "data", "providers.ts");

/** The catalog's own archetype vocabulary, in display order. "other" is the
 *  honest sixth bucket for a doc whose own text says it doesn't fit the
 *  lettered taxonomy (see classifyArchetype) — never forced into one of the
 *  five rather than silently miscounted. */
export const ARCHETYPES = [
  { id: "native-sdk", label: "Native SDK" },
  { id: "hosted-webview", label: "Hosted webview" },
  { id: "mobile-money", label: "Mobile money" },
  { id: "internal", label: "Internal rail" },
  { id: "stub", label: "Stub / KYC-gated" },
  { id: "other", label: "Uncategorized" },
];
const ARCHETYPE_LABEL = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a.label]));

/** Classifies a provider doc's raw Archetype text into one of ARCHETYPES.
 *  Two docs name their bucket in prose instead of a letter (wallet.md's
 *  "internal rail", the four Tier-4 stub catalog entries); the rest lead
 *  with an A/C/D letter — sometimes bare ("A (native SDK — ..."), sometimes
 *  prefixed ("Archetype-D-simplest" on cash.md, "shipped as C (hosted
 *  checkout)" on xendit.md). Whatever text follows the letter (a caveat, an
 *  unconfirmed identification, a "this demo runs it through the generic
 *  archetype-C mock" aside) never changes the bucket — only the leading
 *  token does. upi-intent.md's own doc text says outright that it "does not
 *  fit the A/C/D lettered taxonomy", so it falls to "other" rather than
 *  being forced into a bucket its own source disclaims. */
export function classifyArchetype(raw) {
  const text = raw.trim();
  if (/internal rail/i.test(text)) return "internal";
  if (/tier-4 stub/i.test(text)) return "stub";
  const m = /^(?:shipped as\s+)?(?:Archetype-)?([ACD])\b/i.exec(text);
  if (m) {
    const letter = m[1].toUpperCase();
    if (letter === "A") return "native-sdk";
    if (letter === "C") return "hosted-webview";
    return "mobile-money"; // D
  }
  return "other";
}

/** A `**Field:**` value, joined across its wrapped continuation lines (most
 *  are one line; a few — see savvy.md's Region — wrap) up to the next
 *  bullet or a blank line. null when the doc has no such field. */
function field(text, name) {
  const marker = `**${name}:**`;
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const rest = text.slice(idx + marker.length);
  const end = rest.search(/\n- \*\*|\n\n/);
  return (end >= 0 ? rest.slice(0, end) : rest).replace(/\n\s*/g, " ").trim();
}

/** The first backtick-quoted `SOME_TOKEN` in a status field — every doc's
 *  Status-shipped line leads with one (`MOCK_MODE`, `SANDBOX_READY`,
 *  `COMING_SOON`), verified against the full 75-doc corpus. Falls back to
 *  the raw text (truncated) for a doc that ever breaks that pattern, rather
 *  than dropping the field. */
function statusToken(raw) {
  const m = /`([A-Z_]+)`/.exec(raw ?? "");
  return m ? m[1] : (raw ?? "unknown").slice(0, 40);
}

/** Parses one provider doc's markdown into a catalog entry. Pure: same text
 *  in, same entry out. */
export function parseProviderDoc(text, filename) {
  const slug = basename(filename, ".md");
  const h1 = /^#\s+(.+)$/m.exec(text);
  const name = h1 ? h1[1].trim() : slug;
  const region = field(text, "Region") ?? "unconfirmed";
  const archetypeRaw = field(text, "Archetype") ?? "";
  const archetype = classifyArchetype(archetypeRaw);
  const status = statusToken(field(text, "Status shipped"));
  return { slug, name, region, archetype, archetypeLabel: ARCHETYPE_LABEL[archetype], status };
}

/** Scans a docs/providers-shaped directory into the full catalog, sorted by
 *  slug for a deterministic, diff-friendly order. Pure I/O: no network, no
 *  env var, so a test can point it at a fixture directory directly. Returns
 *  null when the directory does not exist — the caller decides the
 *  missing-sibling fallback, this function never guesses. */
export function buildProviders(dir) {
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseProviderDoc(readFileSync(join(dir, f), "utf8"), f));
}

async function main() {
  const reposRoot = process.env.CV_REPOS_ROOT ?? join(root, "..", "..");
  const providersDir = join(reposRoot, "Android", "PaymentsLab", "docs", "providers");

  const providers = buildProviders(providersDir);
  if (!providers) {
    if (existsSync(outFile)) {
      console.warn(`[gen-providers] ${providersDir} not found — keeping committed providers.ts`);
      return;
    }
    console.error(`[gen-providers] ${providersDir} not found and no committed providers.ts exists`);
    process.exit(1);
  }

  const banner =
    "// AUTO-GENERATED by scripts/gen-providers.mjs. Do not edit by hand.\n" +
    "// One entry per docs/providers/*.md in the `PaymentsLab` sibling checkout\n" +
    "// (Region/Archetype/Status-shipped headers). Drives GatewayCompare,\n" +
    "// GatewayLab and rails.ts's provider counts; see idea-atlas.md#REC-2.\n" +
    "// Run `npm run gen:providers` to refresh.\n" +
    "//\n" +
    "// A generic redaction note, not a provider-specific one: the same\n" +
    "// discipline that keeps every provider's credentials and PII out of this\n" +
    "// app's own logs (core:security's redaction layer) is why this catalog\n" +
    "// carries archetypes and regions only, never a live credential or endpoint.\n";

  const body =
    `export interface Provider {\n` +
    `  slug: string;\n` +
    `  name: string;\n` +
    `  region: string;\n` +
    `  archetype: string;\n` +
    `  archetypeLabel: string;\n` +
    `  status: string;\n` +
    `}\n\n` +
    `export const ARCHETYPES = ${JSON.stringify(ARCHETYPES, null, 2)} as const;\n\n` +
    `export const providers: Provider[] = ${JSON.stringify(providers, null, 2)} as const;\n`;

  const next = banner + body;
  if (existsSync(outFile) && readFileSync(outFile, "utf8") === next) {
    console.log("[gen-providers] no change — providers.ts left untouched");
    return;
  }
  writeFileSync(outFile, next);
  console.log(`[gen-providers] wrote ${providers.length} providers`);
}

// realpathSync, not a bare string compare: process.argv[1] is the path as
// invoked, import.meta.url is Node's fully resolved path, and macOS's
// os.tmpdir() (used by this script's own test) returns an unresolved
// /tmp/... that is itself a symlink into /private/... — see
// gen-project-stats.mjs's isMain for the same trap.
function isMain() {
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  await main();
}
