// Pulls the FULL TEXT of the archive pieces that ran in Excelsior, so the site
// can render them as readable pages instead of pictures of paper.
//
// Why this exists. /excelsior hosts 396 rendered magazine pages — which is a
// faithful artefact and a bad way to read: unselectable, unsearchable, invisible
// to crawlers, and punishing on a phone. Meanwhile the actual prose has been
// sitting in a public repo the whole time. The magazine should be the EVIDENCE;
// the writing should be the thing you can actually read.
//
// Same source and the same network-optional contract as gen-loopdown.mjs: if the
// fetch fails and a previous file exists, that file is kept, so a flaky network
// can never blank the writing.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "./lib/net.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src", "data", "archiveText.ts");
const RAW = "https://raw.githubusercontent.com/darkpandawarrior/the-loopdown/main/archive";

// Only the pieces that were printed in Excelsior. The rest of the archive stays
// a listing — this file is specifically the print-provenance set, and each entry
// pairs the prose with the page it ran on.
const PRINTED = [
  { slug: "the-loopdown-story", year: "2021", page: 44, note: "Rebel path, tagged REPETITION" },
  { slug: "ctc-cost-to-company", year: "2020", page: 36, note: "Cover story" },
  { slug: "prophecy-201112003", year: "2020", page: 39, note: "Cover story" },
  // The site text is the DRAFT. OCR of the printed pages 65-66 counts ~838
  // words against 3,184 here — roughly a quarter of it survived the page
  // count. So /read/deadline has been a director's cut all along; it just
  // never said so. printWords is approximate because it comes from OCR of a
  // scan, and it is stated as approximate on the page.
  { slug: "deadline", year: "2019", page: 65, printWords: 838 },
  { slug: "pointer-games", year: "2019", page: 48, note: "Episode 1 — “Nidra” Thama" },
  // Not print — this one ran on the Editorial Board's blog while he was on the
  // board. The byline there is the society account (as with every post on that
  // blog), so authorship rests on the drafts: v1 2019-06-01, v2 2019-07-17,
  // published 2019-08-19. Draft-before-publication is the chain.
  {
    slug: "its-a-doggone-life",
    year: "2019",
    url: "https://edboardmanit.wordpress.com/2019/08/19/its-a-doggone-life/",
    published: "2019-08-19",
    note: "Editorial Board blog",
  },
  // Never published anywhere. The drafts have sat in the archive with no live
  // reference, which meant the strongest argument that he writes — volume and
  // range — was invisible. This site is their first publication, and saying so
  // plainly is better than implying a provenance that does not exist.
  { slug: "chronicles-of-an-nre-kid", year: "", note: "First published here" },
  { slug: "honest-college-fests", year: "", note: "First published here" },
  { slug: "the-pun-force", year: "", note: "First published here" },
];

/**
 * These were written as prose with ONE newline between paragraphs, which
 * Markdown collapses into a single block — the 3,000-word pieces rendered as
 * one unbroken wall of text, which is exactly the problem this whole route
 * exists to fix. Give every prose line its own paragraph.
 *
 * Left alone: fenced code, and anything already carrying a block marker
 * (heading, quote, list, rule, table) so structure survives. Leading spaces are
 * trimmed because four of them would otherwise be parsed as an indented code
 * block, and several lines in these files start with one.
 */
function breakParagraphs(md) {
  const lines = md.split("\n");
  const out = [];
  let inFence = false;
  const isBlock = (l) => /^(#{1,6} |>|\s*[-*+] |\s*\d+\. |\||---|===)/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) inFence = !inFence;
    const line = inFence ? raw : raw.replace(/^\s+/, "");
    out.push(line);
    if (inFence) continue;
    const next = (lines[i + 1] ?? "").replace(/^\s+/, "");
    // Two adjacent prose lines are two paragraphs, not one.
    if (line.trim() && next.trim() && !isBlock(line) && !isBlock(next)) out.push("");
  }
  return out.join("\n");
}

/** Strip the YAML front matter and return {meta, body}. */
function split(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md.trim() };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: md.slice(m[0].length).trim() };
}

const out = [];
let failed = 0;

for (const p of PRINTED) {
  try {
    const res = await fetchWithTimeout(`${RAW}/${p.slug}.md`);
    if (!res.ok) throw new Error(String(res.status));
    const { meta, body: raw } = split(await res.text());
    // The files open with their own '# Title', which the route already renders
    // as the page <h1>. Two h1s is both a duplicate and an a11y heading-order
    // smell, so the body's copy goes.
    const body = breakParagraphs(raw.replace(/^#\s+.*\n+/, ""));
    out.push({
      slug: p.slug,
      title: meta.title || p.slug,
      form: meta.form || "",
      era: meta.era || "",
      blurb: meta.blurb || "",
      tags: meta.tags ? meta.tags.replace(/[[\]]/g, "").split(",").map((t) => t.trim()).filter(Boolean) : [],
      words: body.split(/\s+/).length,
      year: p.year,
      page: p.page ?? 0,
      url: p.url || "",
      published: p.published || "",
      printWords: p.printWords ?? 0,
      note: p.note || "",
      body,
    });
  } catch (e) {
    failed++;
    console.warn(`[gen-archive-text] ${p.slug}: ${e.message}`);
  }
}

if (failed && existsSync(outPath)) {
  console.warn(`[gen-archive-text] ${failed} fetch(es) failed — keeping the existing file rather than shipping a gap`);
  process.exit(0);
}

writeFileSync(
  outPath,
  `// AUTO-GENERATED by scripts/gen-archive-text.mjs — do not edit by hand.\n` +
    `// Source: github.com/darkpandawarrior/the-loopdown (archive/*.md)\n` +
    `// The prose that ran in Excelsior, paired with the page it ran on.\n` +
    `export interface PrintedPiece {\n` +
    `  slug: string;\n  title: string;\n  form: string;\n  era: string;\n  blurb: string;\n` +
    `  tags: string[];\n  words: number;\n` +
    `  year: string;\n` +
    `  /** PDF page index in the magazine, or 0 for pieces that never ran in print. */\n` +
    `  page: number;\n` +
    `  /** Live URL, for the piece published on the Editorial Board blog. */\n` +
    `  url: string;\n` +
    `  published: string;\n` +
    `  /** Approx words that actually ran in print, when the draft was cut. 0 if not cut. */\n  printWords: number;\n` +
    `  note: string;\n` +
    `  /** Markdown. Rendered with react-markdown, which the site already ships. */\n  body: string;\n` +
    `}\n\n` +
    `export const printedPieces: PrintedPiece[] = ${JSON.stringify(out, null, 2)};\n\n` +
    `export const pieceBySlug = (slug: string) => printedPieces.find((p) => p.slug === slug);\n`,
);

console.log(
  `[gen-archive-text] ${out.length} pieces, ${out.reduce((n, p) => n + p.words, 0).toLocaleString()} words → src/data/archiveText.ts`,
);
