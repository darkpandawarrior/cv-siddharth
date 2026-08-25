// Pulls The Morkinstar Journals — two seasons, twenty entries — from The Loopdown.
//
// Why this is its own generator and not part of gen-loopdown.mjs. That script emits
// a LISTING: titles, slugs, tags, counts. This one emits a READABLE WORK: full prose
// for twenty stories plus a starmap plus twenty-one field plates. Different payload,
// different cadence, and a listing that suddenly weighed forty thousand words would
// be the wrong shape for the /#writing hub that consumes it.
//
// Same source and the same network-optional contract as gen-archive-text.mjs: if a
// fetch fails and a previous file exists, that file is kept, so a flaky network can
// never blank the writing.
//
// The plates are copied into public/p/anthology/plates/ as real static assets rather
// than inlined, because twenty-one base64 images in a TS module is a megabyte the
// client would parse on every load for pictures most readers never scroll to.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { fetchWithTimeout } from "./lib/net.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src", "data", "anthology.ts");
const plateDir = join(root, "public", "p", "anthology", "plates");
const REPO = "https://raw.githubusercontent.com/darkpandawarrior/the-loopdown/main";

const bail = (msg) => {
  if (existsSync(outPath)) {
    console.warn(`[gen-anthology] ${msg} — keeping the existing file rather than shipping a gap`);
    process.exit(0);
  }
  console.warn(`[gen-anthology] ${msg} — and no previous file to fall back to`);
  process.exit(0); // never fail the build over the fiction
};

let registry;
try {
  const res = await fetchWithTimeout(`${REPO}/data/registry.json`);
  if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
  registry = await res.json();
} catch (e) {
  bail(`registry fetch failed (${e.message})`);
}

const src = registry.anthology;
if (!src?.entries?.length) bail("registry carries no anthology block");

// Strip the frontmatter and the H1: the page renders its own title, and a second
// one in the body would be a duplicate heading (axe flags it, and it reads badly).
// The .trim() between the two replaces is load-bearing and was missing at first.
// A source file reads `---\n...\n---\n\n# Title`, so removing the frontmatter
// leaves a blank line in front of the heading and `^#` never matches. The H1
// survived into the body, react-markdown rendered it, and every anthology
// reading page shipped with two h1 elements: the page's own and the body's.
// Caught on the live site, not by a type error, which is why anthology.test.ts
// now asserts it.
const strip = (md) =>
  md.replace(/^---\n[\s\S]*?\n---\n/, "").trim().replace(/^#\s+.*\n+/, "").trim();

mkdirSync(plateDir, { recursive: true });
let failed = 0;
const entries = [];

for (const e of src.entries) {
  try {
    const res = await fetchWithTimeout(`${REPO}/${e.file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = strip(await res.text());

    let plate = "";
    if (e.plate) {
      const img = await fetchWithTimeout(`${REPO}/${e.plate}`);
      if (img.ok) {
        const name = basename(e.plate);
        writeFileSync(join(plateDir, name), Buffer.from(await img.arrayBuffer()));
        plate = `/p/anthology/plates/${name}`;
      }
    }

    // The sigil is inlined rather than linked, unlike the plate. It is under 3KB
    // of SVG, it animates itself on first paint, and it sits next to the title
    // where a second network round trip would show as a hole in the header.
    let sigil = "";
    const sigKey = `s${e.season}-${String(e.idx).padStart(2, "0")}`;
    const sig = await fetchWithTimeout(`${REPO}/fiction/morkinstar-journals/assets/sigils/${sigKey}.svg`);
    if (sig.ok) sigil = (await sig.text()).trim();

    entries.push({
      season: e.season,
      idx: e.idx,
      slug: e.slug,
      title: e.title,
      // Season 1 files to the Directory and is numbered by entry. Season 2 files to
      // nobody and is numbered by page. Exactly one of these is ever set.
      entry: e.entry ? Number(e.entry) : 0,
      page: e.page ? Number(e.page) : 0,
      // Season 3 only, from the entry's own frontmatter. Left undefined (so
      // JSON.stringify drops the key) for seasons 1 and 2 rather than
      // defaulted to 0, since 0 isn't a valid kindling ordinal to guard
      // against on the reading page.
      ...(e.kindling ? { kindling: Number(e.kindling) } : {}),
      planet: e.planet || "",
      system: e.system && e.system !== "[none]" ? e.system : "",
      phenomenon: e.phenomenon || "",
      blurb: e.blurb || "",
      words: Number(e.words) || 0,
      plate,
      sigil,
      body,
    });
  } catch (err) {
    failed++;
    console.warn(`[gen-anthology] ${e.slug}: ${err.message}`);
  }
}

if (failed) bail(`${failed} fetch(es) failed`);

// Unfiled work: fiction in this universe with no season, no series and no
// designation. It is NOT one of the forty-eight, which is why it arrives on its
// own array from the registry and stays on its own array here. Four seasons and
// forty-eight entries are printed on four pages and asserted by guards; an
// unfiled piece must not move either number.
//
// It gets no plate and no sigil. A sigil is hashed from the entity an entry is
// about and a plate is a season's object, and this piece belongs to neither.
const unfiled = [];
for (const u of src.unfiled ?? []) {
  const res = await fetchWithTimeout(`${REPO}/${u.file}`);
  if (!res.ok) bail(`unfiled ${u.slug}: HTTP ${res.status}`);
  unfiled.push({
    idx: Number(u.idx) || unfiled.length + 1,
    slug: u.slug,
    title: u.title,
    // Printed, never resolved. The corpus uses square brackets for a value a
    // form requires and nobody has filled in, so this IS the designation.
    series: u.series || "[unassigned]",
    blurb: u.blurb || "",
    words: Number(u.words) || 0,
    tags: u.tags ?? [],
    body: strip(await res.text()),
  });
}

// Two shared art objects: the mark that has no sound (used as the section
// divider) and the bestiary of the fourteen, whose fourteenth slot is empty.
let mark = "";
try {
  const r = await fetchWithTimeout(`${REPO}/fiction/morkinstar-journals/assets/mark.svg`);
  if (r.ok) mark = (await r.text()).trim();
} catch { /* the divider degrades to a plain rule, which is fine */ }

let fourteen = "";
try {
  const r = await fetchWithTimeout(`${REPO}/fiction/morkinstar-journals/assets/web/the-fourteen.jpg`);
  if (r.ok) {
    writeFileSync(join(plateDir, "the-fourteen.jpg"), Buffer.from(await r.arrayBuffer()));
    fourteen = "/p/anthology/plates/the-fourteen.jpg";
  }
} catch { /* optional */ }

// The tellers, drawn. These are real raster art rather than generated geometry,
// because canon law five is that the heroes lose and the tellers are why there
// is a story at all, and a person is the one thing a hashed sigil cannot be.
// They live under public/ like the plates: ten drawings is not payload for a
// module every reader of the hub has to parse.
const witnessDir = join(root, "public", "p", "anthology", "witnesses");
mkdirSync(witnessDir, { recursive: true });
// A teller ships whether or not there is a drawing of them.
//
// This loop used to `continue` past the push when the art fetch failed, so an
// undrawn teller vanished from the site entirely. The catch below has always
// said "a missing portrait degrades to no portrait, which is survivable", which
// is the correct behaviour and was not the behaviour: the comment described one
// thing and the code four lines above it did another. Season Four's fourteen
// tellers were harvested, passed the upstream registry, and still did not
// appear here, because none of them has been drawn yet.
//
// Law five is about who told it. The site already renders an undrawn teller as
// a deliberate card rather than a broken image, so the only thing dropping the
// record achieved was deciding a person does not exist until an illustrator
// gets to them.
const witnesses = [];
for (const w of src.witnesses ?? []) {
  let art = "";
  try {
    const r = await fetchWithTimeout(`${REPO}/${w.art}`);
    if (!r.ok) throw new Error(`portrait HTTP ${r.status}`);
    // The source art is ~1.9MB apiece. Nothing on the web needs that, and
    // public/ feeds gen-images.mjs which will derive AVIF/WebP siblings from
    // whatever it finds here, so hand it something already sane.
    await sharp(Buffer.from(await r.arrayBuffer()))
      .resize({ width: 1100, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(join(witnessDir, `${w.id}.jpg`));
    art = `/p/anthology/witnesses/${w.id}.jpg`;
  } catch { /* Undrawn, or the fetch failed. Either way the record still ships. */ }
  witnesses.push({ id: w.id, name: w.name, entry: w.entry, of: w.of, did: w.did, art });
}

// Hang each portrait off its entry so the reading page can show the teller
// beside the story they are the reason for.
for (const e of entries) {
  const key = `s${e.season}-${String(e.idx).padStart(2, "0")}`;
  // `entry` is a key OR a list of them, because one person can be the teller of
  // more than one piece. Hevrit tells the first Season Four notice and the last.
  // A strict === here silently gave the finale no teller at all.
  const w = witnesses.find((x) => (Array.isArray(x.entry) ? x.entry : [x.entry]).includes(key));
  e.witness = w ? { id: w.id, name: w.name, did: w.did, art: w.art } : null;
}

const meta = {
  slug: src.slug,
  mark,
  fourteen,
  witnesses,
  title: src.title,
  tagline: src.tagline,
  seasons: src.seasons,
  starmap: src.starmap ?? { systems: {}, worlds: [], fences: [] },
};

writeFileSync(
  outPath,
  `// AUTO-GENERATED by scripts/gen-anthology.mjs — do not edit by hand.\n` +
    `// Source: github.com/darkpandawarrior/the-loopdown (fiction/morkinstar-journals)\n` +
    `// Four seasons of framed short fiction, their field plates, the starmap, and\n` +
    `// any unfiled work that has no season yet.\n` +
    `export interface AnthologyEntry {\n` +
    `  season: number;\n  idx: number;\n  slug: string;\n  title: string;\n` +
    `  /** Season 1 only. The Directory's journal number. 0 in season 2. */\n  entry: number;\n` +
    `  /** Season 2 only. Page N of 91. 0 in season 1. */\n  page: number;\n` +
    `  /** Season 3 only. The frontmatter burn order, 1-13 for a withdrawn page,\n` +
    `   *  14 for the one page he keeps. Absent for seasons 1 and 2. */\n  kindling?: number;\n` +
    `  planet: string;\n  system: string;\n  phenomenon: string;\n  blurb: string;\n  words: number;\n` +
    `  /** Path under public/, or "" if the plate could not be fetched. */\n  plate: string;\n` +
    `  /** Inline animated SVG, hashed from the entity the entry is about. */\n  sigil: string;\n` +
    `  /** The teller this story is the reason for, when it has one. */\n  witness: AnthologyWitness | null;\n` +
    `  /** Markdown, frontmatter and H1 removed. Rendered with react-markdown. */\n  body: string;\n` +
    `}\n\n` +
    `export interface AnthologyWitness {\n`  +
    `  id: string; name: string; did: string; art: string;\n  /** "s1-04" style key of the entry they belong to. */\n  entry?: string;\n  of?: string;\n` +
    `}\n\n` +
    `export interface StarWorld {\n` +
    `  n: string; s: string;\n` +
    `  /** Offset within its system, or null when the world's own record says its\n` +
    `   *  position is not given or not known. Null means UNDRAWN: see isUnplaced\n` +
    `   *  in Starmap.tsx. A sentinel like [0,0,0] would draw the withheld world\n` +
    `   *  at the centre of the map, which is worse than where it used to be. */\n` +
    `  o: number[] | null;\n` +
    `  /** lit | open | concluded | ruin | self */\n  st: string;\n` +
    `  /** Reader key, "season-idx", when the world has an entry to open. */\n  k?: string;\n` +
    `  d: string;\n` +
    `  /** The Concluded count at which this world goes dark. */\n  at?: number;\n` +
    `}\n\n` +
    `export interface Starmap {\n` +
    `  systems: Record<string, number[]>;\n  worlds: StarWorld[];\n  fences: string[][];\n` +
    `}\n\n` +
    `export interface AnthologySeason { n: number; title: string; blurb: string }\n\n` +
    `export const anthology = ${JSON.stringify(meta, null, 2)} as {\n` +
    `  slug: string; title: string; tagline: string;\n` +
    `  mark: string; fourteen: string; witnesses: AnthologyWitness[];\n  seasons: AnthologySeason[]; starmap: Starmap;\n};\n\n` +
    `export const anthologyEntries: AnthologyEntry[] = ${JSON.stringify(entries, null, 2)};\n\n` +
    `export const entryBySlug = (slug: string) => anthologyEntries.find((e) => e.slug === slug);\n` +
    `export const entriesOfSeason = (n: number) => anthologyEntries.filter((e) => e.season === n);\n\n` +
    `/** Fiction in this universe with no season, series or designation. Kept off\n` +
    ` *  AnthologyEntry on purpose: it is not one of the forty-eight. */\n` +
    `export interface UnfiledPiece {\n` +
    `  idx: number; slug: string; title: string;\n` +
    `  /** The frontmatter's own answer, printed. Usually "[unassigned]". */\n  series: string;\n` +
    `  blurb: string; words: number; tags: string[];\n` +
    `  /** Markdown, frontmatter and H1 removed. */\n  body: string;\n` +
    `}\n\n` +
    `export const unfiledPieces: UnfiledPiece[] = ${JSON.stringify(unfiled, null, 2)};\n\n` +
    `export const unfiledBySlug = (slug: string) => unfiledPieces.find((p) => p.slug === slug);\n`,
);

const words = entries.reduce((n, e) => n + e.words, 0);
console.log(
  `[gen-anthology] ${entries.length} entries across ${meta.seasons.length} seasons, ` +
    `${words.toLocaleString()} words, ${entries.filter((e) => e.plate).length} plates, ` +
    `${unfiled.length} unfiled → src/data/anthology.ts`,
);
