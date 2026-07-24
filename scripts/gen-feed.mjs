// Emits public/feed.xml — an Atom feed of The Loopdown's field notes (the
// `lessons` in src/data/writing.ts). Runs after gen:loopdown in the build
// chain, so it reads the freshly-synced writing.ts (no network of its own).
// One entry per lesson; published lessons link to their canonical post, the
// rest to the /loopdown hub.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writing } from "../src/data/writing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "feed.xml");

const SITE = "https://cv-siddharth.vercel.app";
const HUB = `${SITE}/loopdown`;
const SELF = `${SITE}/feed.xml`;
const FEED_TITLE = "The Loopdown — Siddharth Pandalai";
const FEED_SUBTITLE = "Field notes from an engineer who writes — Android, Kotlin, and KMP, each lesson starring a personified bug.";
const AUTHOR = "Siddharth Pandalai";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// `created` is a plain YYYY-MM-DD; Atom needs RFC 3339 (date + time + tz).
const rfc3339 = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? `${d}T00:00:00Z` : new Date(d || Date.now()).toISOString());

const seriesTitle = (id) => writing.series.find((s) => s.id === id)?.title;

function summaryOf(l) {
  const from = seriesTitle(l.series);
  const lead = from ? `Field notes from “${from}”` : "Field notes";
  const topic = l.pillar ? ` on ${l.pillar}` : "";
  const tags = (l.tags || []).length ? ` Topics: ${(l.tags || []).join(", ")}.` : "";
  return `${lead}${topic}.${tags}`;
}

// Newest lesson first — same ordering the /loopdown hub shows.
const lessons = [...writing.lessons].sort((a, b) => (b.created || "").localeCompare(a.created || ""));
const updated = lessons.length ? rfc3339(lessons[0].created) : new Date().toISOString();

const entries = lessons
  .map((l) => {
    const link = l.status === "published" && l.live ? l.live : `${HUB}#${l.slug}`;
    const id = `${HUB}#${l.slug}`; // stable, unique, permanent per lesson
    const when = rfc3339(l.created);
    return `  <entry>
    <title>${esc(l.title)}</title>
    <link href="${esc(link)}" rel="alternate"/>
    <id>${esc(id)}</id>
    <published>${when}</published>
    <updated>${when}</updated>
    <summary>${esc(summaryOf(l))}</summary>
  </entry>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(FEED_TITLE)}</title>
  <subtitle>${esc(FEED_SUBTITLE)}</subtitle>
  <link href="${SELF}" rel="self" type="application/atom+xml"/>
  <link href="${HUB}" rel="alternate" type="text/html"/>
  <id>${HUB}</id>
  <updated>${updated}</updated>
  <author><name>${esc(AUTHOR)}</name></author>
${entries}
</feed>
`;

writeFileSync(outPath, xml);
console.log(`gen-feed: ${lessons.length} entries → public/feed.xml`);
