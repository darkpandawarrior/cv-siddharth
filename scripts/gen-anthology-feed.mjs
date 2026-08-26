// Emits public/anthology.xml — an Atom feed of The Morkinstar Journals.
//
// Runs after gen:anthology in the build chain, so it reads the freshly-synced
// src/data/anthology.ts and needs no network of its own.
//
// THE RULE THAT MATTERS, and it is why this file imports rather than reimplements:
// entry #2300 stops mid-sentence because the Directory never got to finish it,
// and a feed builder is precisely the machinery that finishes such a sentence.
// Every one of them either trims to a sentence boundary or appends an ellipsis.
// So the summary is the AUTHORED blurb, run through the same describes() the
// reading page's meta tags use, and an entry whose blurb came off the prose
// ships with no summary at all rather than a completed one. An absent summary
// is a smaller lie than a finished sentence.
//
// anthologyFeed.test.ts holds the artifact to that, by reading the emitted XML
// rather than this source.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anthology, anthologyEntries, unfiledPieces } from "../src/data/anthology.ts";
import { describes } from "../src/lib/describes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "anthology.xml");

const SITE = "https://cv-siddharth.vercel.app";
const HUB = `${SITE}/anthology`;
const SELF = `${SITE}/anthology.xml`;
const AUTHOR = "Siddharth Pandalai";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Publication order, which is also reading order: season, then the Directory's
// own filing order inside it. The unfiled work follows the four seasons, since
// it is not part of the run and must not look like a fifth.
const items = [
  ...[...anthologyEntries].sort((a, b) => a.season - b.season || a.idx - b.idx).map((e) => ({
    slug: e.slug,
    title: e.title,
    // The season and its object, so a feed reader sees the four media without
    // having to open anything. theme labels live on the site; this is the
    // season's own title from the registry.
    context: anthology.seasons.find((s) => s.n === e.season)?.title ?? "",
    summary: describes(e),
    words: e.words,
  })),
  ...unfiledPieces.map((p) => ({
    slug: p.slug,
    title: p.title,
    // Printed, not resolved. "[unassigned]" IS the designation.
    context: p.series,
    // An unfiled piece has no Terminologies divider and no mid-sentence
    // contract, but it goes through the same rule rather than around it: a
    // second path is a second thing to get wrong.
    summary: describes(p),
    words: p.words,
  })),
];

const entries = items
  .map((it) => {
    const url = `${SITE}/read/${it.slug}`;
    const parts = [it.context, `${it.words.toLocaleString()} words`].filter(Boolean).join(" · ");
    // The summary is the blurb or nothing. `parts` is site metadata, not prose,
    // so it can never complete a sentence and always ships.
    const summary = it.summary ? `${parts}. ${it.summary}` : parts;
    return `  <entry>
    <title>${esc(it.title)}</title>
    <link href="${esc(url)}" rel="alternate"/>
    <id>${esc(url)}</id>
    <summary>${esc(summary)}</summary>
  </entry>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(anthology.title)}</title>
  <subtitle>${esc(anthology.tagline)}</subtitle>
  <link href="${SELF}" rel="self" type="application/atom+xml"/>
  <link href="${HUB}" rel="alternate" type="text/html"/>
  <id>${HUB}</id>
  <author><name>${esc(AUTHOR)}</name></author>
${entries}
</feed>
`;

writeFileSync(outPath, xml);
const withSummary = items.filter((i) => i.summary).length;
console.log(
  `gen-anthology-feed: ${items.length} entries → public/anthology.xml ` +
    `(${items.length - withSummary} withheld a summary rather than finish a sentence)`,
);
