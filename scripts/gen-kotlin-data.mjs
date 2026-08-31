// Emits the Compose Multiplatform twin's data layer from THIS repo's data
// modules. Nine of the sources below carry their own AUTO-GENERATED banner
// (store.ts, weeb.ts, writing.ts, anthology.ts, ops.ts, archiveText.ts,
// chess.ts, chessDeep.ts, excelsior.ts), so a hand-written Kotlin copy of
// them is a second transcript that no generator refreshes.
// CvProfileData.kt already paid for that once: it carried ~960k-LOC and
// ~964k-LOC for the same app, in the same file, transcribed by hand from a
// stale intermediate. So the Kotlin is generated on the same schedule the
// TypeScript is, and neither side is anybody's memory of the other.
//
// Same .ts-import trick scripts/gen-system-prompt.mjs uses: Node strips the
// types, so the source of truth is imported rather than parsed.
//
// Run `npm run gen:kotlin` to refresh (wired into predev/prebuild).
//
// GRACEFUL SKIP: if the KMP repo is not checked out beside this one, print a
// line and exit 0. Same contract gen-images.mjs uses for a missing ffmpeg:
// a sibling repo's absence must never fail this repo's build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import { storeApps, fleet, liveClients, pastClients, delisted, fleetStats, lastShipped, storeGeneratedAt } from "../src/data/store.ts";
import { weeb } from "../src/data/weeb.ts";
import { writing } from "../src/data/writing.ts";
import { societies, boardProfiles, boardArc, loopdownOrigin, coverStory2021 } from "../src/data/beforeTheCode.ts";
import { anthology, anthologyEntries, unfiledPieces, siblingSeries } from "../src/data/anthology.ts";
import {
  SEASON_CANON,
  NAMED_THIRTEEN,
  COUNT_LEDGER,
  RENDERING_DOCTRINE,
  RENDERINGS,
  RIG_CONSTRAINTS,
  RIG_CONSTRAINTS_NOTE,
  TETHER,
  TETHER_DOCTRINE,
  STANDARD_INTERVALS,
  MILGALAXAL_NOTE,
  AFTERLIVES_NOTE,
} from "../src/data/canonLore.ts";
import {
  S2_AUDIT_KILLS,
  S2_MISSING_BEAT,
  S2_NEGATIVE_CONTROL,
  S3_FIRST_DESIGN,
  S4_FENCE,
  AUDIT_METHOD,
  PORTRAIT_ITERATIONS,
  VOICE_CONSTRAINTS,
  PIPELINE_STAGES,
  RETROACTION_STANDARD,
  SPEND,
  RECEIPTS,
} from "../src/data/making.ts";
import { perimeter, leverage, drift, opsGeneratedAt } from "../src/data/ops.ts";
import { printedPieces } from "../src/data/archiveText.ts";
import { chess } from "../src/data/chess.ts";
import { chessDeep } from "../src/data/chessDeep.ts";
import { excelsiorEditions } from "../src/data/excelsior.ts";
import { excelsiorMarks } from "../src/data/excelsiorMarks.ts";
import { NODES, EDGES } from "../src/data/storyMap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kmpRoot = join(root, "..", "cv-siddharth-kmp");
const outDir = join(kmpRoot, "cmp-shared/src/composeMain/kotlin/com/siddharth/cv/shared/data/generated");
const PKG = "com.siddharth.cv.shared.data.generated";

// ── The escaper ─────────────────────────────────────────────────────────────
// The one part of this script that silently breaks a build if it is wrong. The
// corpora carry quotes, backslashes, newlines, control characters, non-ASCII
// (Grïnjdarlay, Sœlvi, Xærion) and dollar signs — and a bare $ opens a template
// expression in Kotlin, so an un-escaped one is a compile error two thousand
// lines into a generated file. Non-ASCII goes through untouched: the file is
// written UTF-8 and kotlinc reads UTF-8.

/** Every literal this emits must match: no raw quote, backslash, $, CR or LF. */
const WELL_FORMED = /^"(?:[^"\\$\n\r]|\\[\\"$ntr]|\\u[0-9a-f]{4})*"$/;

function ktString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (c === "\\") out += "\\\\";
    else if (c === '"') out += '\\"';
    else if (c === "$") out += "\\$";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += c;
  }
  out += '"';
  // Belt and braces: this fires on every string in every corpus, not just the
  // ten in the table below, so a character class nobody anticipated is caught
  // here rather than by kotlinc.
  assert.match(out, WELL_FORMED, `escaper produced a malformed literal for ${JSON.stringify(s)}`);
  return out;
}

function selfCheck() {
  const cases = [
    ["plain", '"plain"'],
    ['he said "no"', '"he said \\"no\\""'],
    ["C:\\path", '"C:\\\\path"'],
    ["$5 and ${x}", '"\\$5 and \\${x}"'],
    ["line\nbreak", '"line\\nbreak"'],
    ["tab\there", '"tab\\there"'],
    ["cr\r\n", '"cr\\r\\n"'],
    ["Grïnjdarlay Sœlvi Xærion Miéville", '"Grïnjdarlay Sœlvi Xærion Miéville"'],
    ["bell\u0007", '"bell\\u0007"'],
    ['\\"$', '"\\\\\\"\\$"'],
    ["", '""'],
  ];
  for (const [input, want] of cases) {
    assert.equal(ktString(input), want, `escaper: ${JSON.stringify(input)}`);
  }
}
selfCheck();

// ── The schema DSL ──────────────────────────────────────────────────────────
// One serializer driven by these nodes, not eight bespoke emitters. The shapes
// are known (they are in the .ts files), so nothing here infers a type.
const S = "String";
const I = "Int";
const D = "Double";
const B = "Boolean";
const list = (of) => ({ k: "list", of });
const dict = (key, of) => ({ k: "map", key, of });
const nul = (of) => ({ k: "opt", of });
const obj = (name, fields, doc) => ({ k: "obj", name, fields, doc });

function ktType(node) {
  if (typeof node === "string") return node;
  if (node.k === "list") return `List<${ktType(node.of)}>`;
  if (node.k === "map") return `Map<${node.key}, ${ktType(node.of)}>`;
  if (node.k === "opt") return `${ktType(node.of)}?`;
  if (node.k === "obj") return node.name;
  throw new Error(`unknown schema node: ${JSON.stringify(node)}`);
}

const isOpt = (node) => typeof node === "object" && node.k === "opt";
const PAD = (n) => "    ".repeat(n);

/** listOf(a, b) on one line when it fits, one item per line when it does not. */
function wrap(open, parts, depth) {
  const flat = `${open}${parts.join(", ")})`;
  if (!flat.includes("\n") && flat.length + PAD(depth).length <= 108) return flat;
  return `${open}\n${parts.map((p) => PAD(depth + 1) + p).join(",\n")},\n${PAD(depth)})`;
}

function render(node, v, depth, where) {
  if (isOpt(node)) return v === null || v === undefined ? "null" : render(node.of, v, depth, where);
  assert.notEqual(v, undefined, `${where}: missing value for non-nullable ${ktType(node)}`);
  assert.notEqual(v, null, `${where}: null for non-nullable ${ktType(node)}`);
  if (node === S) {
    assert.equal(typeof v, "string", `${where}: expected String, got ${typeof v}`);
    return ktString(v);
  }
  if (node === I) {
    assert.ok(Number.isInteger(v), `${where}: expected Int, got ${JSON.stringify(v)}`);
    return String(v);
  }
  if (node === D) {
    assert.equal(typeof v, "number", `${where}: expected Double, got ${typeof v}`);
    return Number.isInteger(v) ? `${v}.0` : String(v);
  }
  if (node === B) {
    assert.equal(typeof v, "boolean", `${where}: expected Boolean, got ${typeof v}`);
    return v ? "true" : "false";
  }
  if (node.k === "list") {
    assert.ok(Array.isArray(v), `${where}: expected an array`);
    if (v.length === 0) return "emptyList()";
    return wrap("listOf(", v.map((x, i) => render(node.of, x, depth + 1, `${where}[${i}]`)), depth);
  }
  if (node.k === "map") {
    const entries = Object.entries(v);
    if (entries.length === 0) return "emptyMap()";
    const parts = entries.map(([key, x]) => {
      const lhs = node.key === I ? String(Number(key)) : ktString(key);
      assert.notEqual(lhs, "NaN", `${where}: map key ${key} is not an Int`);
      return `${lhs} to ${render(node.of, x, depth + 1, `${where}.${key}`)}`;
    });
    return wrap("mapOf(", parts, depth);
  }
  if (node.k === "obj") {
    const parts = Object.entries(node.fields).map(([f, ft]) => {
      assert.ok(f in v || isOpt(ft), `${where}: ${node.name}.${f} is absent and not nullable`);
      return `${f} = ${render(ft, v[f], depth + 1, `${where}.${f}`)}`;
    });
    return wrap(`${node.name}(`, parts, depth);
  }
  throw new Error(`unknown schema node: ${JSON.stringify(node)}`);
}

/** Every obj node reachable from a file's vals, in first-seen order. */
function collectClasses(node, seen) {
  if (typeof node === "string") return;
  if (node.k === "obj") {
    const sig = Object.entries(node.fields).map(([f, t]) => `${f}: ${ktType(t)}`);
    const prev = seen.get(node.name);
    if (prev) {
      assert.deepEqual(prev.sig, sig, `data class ${node.name} declared twice with different fields`);
      return;
    }
    seen.set(node.name, { sig, doc: node.doc });
    for (const t of Object.values(node.fields)) collectClasses(t, seen);
    return;
  }
  collectClasses(node.of, seen);
}

function emit({ out, source, note, vals }) {
  const classes = new Map();
  for (const v of vals) collectClasses(v.type, classes);

  const banner = [
    `// AUTO-GENERATED by cv-siddharth/scripts/gen-kotlin-data.mjs. Do not edit by hand.`,
    `// Source of truth: cv-siddharth/${source}`,
    `// Run \`npm run gen:kotlin\` in the React repo to refresh; this file is`,
    `// rewritten wholesale and any hand edit is lost on the next build.`,
    ...(note ? note.split("\n").map((l) => `// ${l}`.trimEnd()) : []),
  ].join("\n");

  const decls = [...classes].map(([name, { sig, doc }]) =>
    [doc ? `/** ${doc} */` : null, `data class ${name}(`, ...sig.map((f) => `    val ${f},`), `)`]
      .filter(Boolean)
      .join("\n"),
  );

  const body = vals.map(
    ({ name, type, value, doc }) =>
      [doc ? `/** ${doc} */` : null, `val ${name}: ${ktType(type)} = ${render(type, value, 0, name)}`]
        .filter(Boolean)
        .join("\n"),
  );

  const text = [`package ${PKG}`, banner, ...decls, ...body].join("\n\n") + "\n";
  const path = join(outDir, out);
  // Idempotent: an unchanged file is not rewritten, so a second run leaves no
  // diff and no mtime churn for Gradle to react to.
  if (existsSync(path) && readFileSync(path, "utf8") === text) return { out, changed: false, text };
  writeFileSync(path, text);
  return { out, changed: true, text };
}

// ── Shape prep ──────────────────────────────────────────────────────────────
// Every mapping below is a rename or a union-flattening done at generation
// time against the imported module. None of it restates a fact.

// `fleet` / `delisted` are the flat forms of liveClients[].apps / pastClients[].apps
// (verified id-for-id: 89 and 84 both ways), so only the grouped shape is emitted.
// The one thing the flat form carries that the grouped one does not is per-app
// setUpByHim, which /shipped prints as a total, so it is joined back on by id.
const setUpById = new Map([...fleet, ...delisted].map((a) => [a.id, a.setUpByHim]));
const withSetUp = (apps) =>
  apps.map((a) => {
    assert.ok(setUpById.has(a.id), `store: ${a.id} is in a client but not in fleet/delisted`);
    return { ...a, setUpByHim: setUpById.get(a.id) };
  });

const witnessOf = (w) => ({
  ...w,
  // `entry` is "s1-04" for all but one witness, who belongs to two entries.
  // Kotlin has no union, and one list reads better than two fields.
  entries: w.entry === undefined ? [] : Array.isArray(w.entry) ? w.entry : [w.entry],
});

const starWorlds = anthology.starmap.worlds.map((w) => ({
  name: w.n,
  system: w.s,
  offset: w.o,
  state: w.st,
  keys: w.k === undefined ? [] : Array.isArray(w.k) ? w.k : [w.k],
  detail: w.d,
  darkAt: w.at ?? null,
}));

// The /chess "rhythm" tab reads `hours` from public/chess/corpus.json, not from
// src/data/chess.ts — the corpus is 220 KB the React room fetches at runtime so
// it never lands in a bundle. Only the 24+24 hour rows and the commit-sample
// footnote are wanted here, and reading them at generation time is what keeps
// the twin off a network round-trip for fifty numbers. Both files are written
// by the same generator (scripts/gen-chess-stats.mjs), so they never disagree.
const corpusPath = join(root, "public/chess/corpus.json");
assert.ok(existsSync(corpusPath), `gen-kotlin-data: ${corpusPath} is missing; run npm run gen:chess`);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const corpusHours = corpus.hours;
assert.equal(corpusHours.chess.length, 24, "corpus.json: hours.chess must carry 24 rows");
assert.equal(corpusHours.commits.length, 24, "corpus.json: hours.commits must carry 24 rows");

// The three panes ChessRoom.tsx renders as three.js scenes each ship a NON-WEBGL
// branch that is plain 2D or plain text, and those branches were the thing this
// emitter was missing rather than a renderer. What each needs:
//
//  - The Arc's flat fallback (`src/ChessArc.tsx`) reads `chess.arc`, the WEEKLY
//    downsample that already ships in the bundled summary: 190 points across
//    three chess.com formats, not the corpus's 4,500. gen-chess-stats.mjs
//    asserts the downsample's per-format maximum still equals the peak printed
//    beside it, so the ranges the fallback quotes are the real ones.
//  - The Graveyard's no-WebGL branch is `corpus.graveyard`, 64 ints per view.
//  - Repertoire's is `corpus.repertoireByPlatform`, flattened here into the
//    year-ordered shape `chess/repertoireModel.ts:repertoireYears` builds, so
//    the twin does that nesting walk once at generation time rather than in a
//    composable. A slice's `share` stays NULLABLE: a thin platform-year quotes
//    no percentage on either side.
//  - `corpus.positions` is the guess-the-move quiz: 60 final positions, and the
//    only thing drawn from them is the FEN's piece placement, so no move
//    generator is involved.
//
// Still left behind: `corpus.arc` (the un-downsampled per-game series, only the
// three.js ribbon needs that resolution) and `corpus.openings` (850 rows the
// scenes aggregate; nothing 2D reads it).
const arcSeries = chess.arc.filter((a) => a.points.length > 1);
assert.ok(arcSeries.length > 0, "chess.ts: arc has no series with more than one point");
const arcStamps = arcSeries.flatMap((a) => a.points.map((p) => p.t));
const arcFrom = Math.min(...arcStamps);
const arcTo = Math.max(...arcStamps);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
// Interior January firsts, the only shared reference between bands. Same range
// ChessArc.tsx builds: first year + 1 through the last year inclusive.
const arcYearTicks = [];
for (let y = new Date(arcFrom).getUTCFullYear() + 1; y <= new Date(arcTo).getUTCFullYear(); y++) {
  arcYearTicks.push(Date.UTC(y, 0, 1));
}

assert.equal(corpus.graveyard.losses.length, 64, "corpus.json: graveyard.losses must be 64 squares");
assert.equal(corpus.graveyard.wins.length, 64, "corpus.json: graveyard.wins must be 64 squares");

const REP_PLATFORMS = ["lichess", "chesscom"];
const repertoireByPlatform = Object.keys(corpus.repertoireByPlatform)
  .sort()
  .map((year) => ({
    year,
    platforms: REP_PLATFORMS.flatMap((key) => {
      const slice = corpus.repertoireByPlatform[year][key];
      return slice
        ? [
            {
              key,
              blackGames: slice.blackGames,
              thin: slice.thin,
              openings: slice.openings.map((o) => ({ ...o, share: o.share ?? null })),
            },
          ]
        : [];
    }),
  }));
assert.ok(
  repertoireByPlatform.every((y) => y.platforms.length > 0),
  "corpus.json: a repertoire year carries no platform",
);

// ── Schemas ─────────────────────────────────────────────────────────────────
const Ref = obj("CanonRef", { slug: S, label: S }, "An entry a law points at. `slug` resolves against anthologyEntries.");
const Point = obj("CanonPoint", { term: S, gloss: S }, "A named idea and its gloss. Serves season points and doctrine consequences alike.");
const Witness = obj(
  "AnthologyWitness",
  { id: S, name: S, entries: list(S), of: nul(S), did: S, art: S },
  "A teller. `entries` is empty on the copy embedded in an entry, which knows its own key.",
);

const files = [
  {
    out: "CvStoreData.kt",
    source: "src/data/store.ts",
    note: "Left behind: `fleet` and `delisted`, the flat app lists that liveClients\nand pastClients already carry grouped by client. Their per-app\n`setUpByHim` flag is joined onto the grouped apps instead.",
    vals: [
      {
        name: "storeApps",
        doc: "The three apps that get their own card.",
        type: list(obj("StoreApp", { id: S, name: S, rating: D, installs: S, url: S, role: S, employer: S, icon: S })),
        value: storeApps,
      },
      {
        name: "liveClients",
        doc: "White-label clients still on the Play Store, one card each.",
        type: list(
          obj("LiveClient", {
            key: S,
            name: S,
            developer: S,
            icon: S,
            color: nul(S),
            setUpByHim: B,
            rating: nul(D),
            apps: list(
              obj("LiveApp", { id: S, name: S, url: S, side: S, installs: S, rating: nul(D), updated: S, setUpByHim: B }),
            ),
          }),
        ),
        value: liveClients.map((c) => ({ ...c, apps: withSetUp(c.apps) })),
      },
      {
        name: "pastClients",
        doc: "Clients whose builds are gone. Every url is a web.archive.org snapshot.",
        type: list(
          obj("PastClient", {
            key: S,
            name: S,
            icon: nul(S),
            color: nul(S),
            setUpByHim: B,
            lastSeen: S,
            firstSeen: S,
            apps: list(obj("PastApp", { id: S, name: S, url: S, side: S, rating: nul(D), lastSeen: S, setUpByHim: B })),
          }),
        ),
        value: pastClients.map((c) => ({ ...c, apps: withSetUp(c.apps) })),
      },
      {
        name: "fleetStats",
        type: obj("FleetStats", {
          branches: I,
          clients: I,
          live: I,
          setUpByHim: I,
          carryingHisCommits: I,
          installFloor: I,
          developers: I,
          delisted: I,
          archiveChecked: I,
          predatingHim: I,
          joined: S,
          clientsLive: I,
          clientsGone: I,
        }),
        value: fleetStats,
      },
      {
        name: "lastShipped",
        doc: "Live-versus-gone counts per year, for the timeline strip.",
        type: list(obj("ShippedYear", { year: I, live: I, gone: I })),
        value: lastShipped,
      },
      { name: "storeGeneratedAt", type: S, value: storeGeneratedAt },
    ],
  },

  {
    out: "CvWeebData.kt",
    source: "src/data/weeb.ts",
    note: "Left behind: `duplicates`, a data-hygiene artefact of the AniList match\nthat no surface renders.",
    vals: [
      {
        name: "weeb",
        doc: "The anime and manga ledger behind /weeb. Every figure on that page renders from here.",
        type: obj("WeebData", {
          generatedAt: S,
          anime: obj("WeebAnime", {
            total: I,
            matched: I,
            byWatch: dict(S, I),
            scoreDist: dict(I, I),
            scored: I,
            seasonsOut: I,
            seasonsDone: I,
            behindCount: I,
            pairedCount: I,
            unwatchedSeasons: I,
            deepestGaps: list(obj("WeebGap", { name: S, gap: I })),
            caughtUp: obj("WeebCaughtUp", {
              completed: obj("WeebBucket", { n: I, pct: D }),
              paused: obj("WeebBucket", { n: I, pct: D }),
              watching: obj("WeebBucket", { n: I, pct: D }),
            }),
          }),
          manga: obj("WeebManga", { total: I, byRead: dict(S, I), chaptersRead: I }),
          stale: list(
            obj(
              "WeebStale",
              { name: S, title: S, romaji: S, english: nul(S), sequel: S, year: nul(I), status: S },
              "A series with a sequel out that he has not started.",
            ),
          ),
          divergence: obj("WeebDivergence", {
            n: I,
            top: list(obj("WeebDivergenceRow", { name: S, mine: I, crowd: I, delta: I })),
            bottom: list(obj("WeebDivergenceRow", { name: S, mine: I, crowd: I, delta: I })),
          }),
        }),
        value: weeb,
      },
    ],
  },

  {
    out: "CvWritingData.kt",
    source: "src/data/writing.ts",
    vals: [
      {
        name: "writingLessons",
        doc: "The Loopdown field notes. `live` is empty until a post is published.",
        type: list(
          obj("WritingLesson", {
            title: S,
            slug: S,
            pillar: nul(S),
            series: nul(S),
            status: nul(S),
            created: nul(S),
            live: nul(S),
            tags: list(S),
            links: obj("PostLinks", { devto: nul(S), linkedin: nul(S), medium: nul(S), hashnode: nul(S) }),
          }),
        ),
        value: writing.lessons.map((l) => ({ ...l, links: l.links ?? {} })),
      },
      {
        name: "writingSeries",
        type: list(obj("WritingSeries", { id: S, title: S, episodes: I })),
        value: writing.series,
      },
      {
        name: "writingArchive",
        doc: "Older pieces, before the field notes. `words` is a string upstream and stays one.",
        type: list(
          obj("WritingArchivePiece", { title: S, slug: S, form: nul(S), era: nul(S), words: nul(S), tags: list(S), blurb: nul(S) }),
        ),
        value: writing.archive,
      },
      {
        name: "writingCast",
        doc: "Recurring names across the archive, with how often each appears.",
        type: list(obj("WritingCastMember", { id: S, appearances: I })),
        value: writing.cast,
      },
    ],
  },

  {
    out: "CvBeforeTheCodeData.kt",
    source: "src/data/beforeTheCode.ts",
    vals: [
      {
        name: "societies",
        type: list(
          obj("Society", { name: S, role: S, years: S, blurb: S, links: list(obj("SocietyLink", { label: S, url: S })) }),
        ),
        value: societies,
      },
      {
        name: "boardProfiles",
        doc: "The three EB Profiles the board wrote about him, 2019-21. `page` indexes the PDF.",
        type: list(
          obj("BoardProfile", { year: S, page: I, title: S, role: S, question: S, quote: S, direction: S, gloss: nul(S) }),
        ),
        value: boardProfiles,
      },
      {
        name: "loopdownOrigin",
        doc: "Where the name came from: a story in Excelsior '21.",
        type: obj("LoopdownOrigin", { year: S, page: I, story: S }),
        value: loopdownOrigin,
      },
      {
        name: "coverStory2021",
        type: obj("CoverStory", { page: I, paths: list(obj("CoverPath", { name: S, page: I })) }),
        value: coverStory2021,
      },
      { name: "boardArc", doc: "The throughline the three profiles describe, stated plainly.", type: S, value: boardArc },
    ],
  },

  {
    out: "CvAnthologyData.kt",
    source: "src/data/anthology.ts",
    note: "Left behind: every story `body` (448 KB), every `sigil` (206 KB of\ninline animated SVG), and `mark`. The ported /read serves the nine\nExcelsior pieces in CvArchiveTextData.kt, not the anthology, and Compose\nhas no SVG-string renderer — so all three would be dead weight in a wasm\nbundle a visitor downloads.",
    vals: [
      {
        name: "anthology",
        doc: "Series-level meta: the tellers, the seasons, and the starmap.",
        type: obj("AnthologyMeta", {
          slug: S,
          title: S,
          tagline: S,
          fourteen: S,
          witnesses: list(Witness),
          seasons: list(obj("AnthologySeason", { n: I, title: S, blurb: S })),
          starmap: obj("Starmap", {
            systems: dict(S, list(I)),
            worlds: list(
              obj(
                "StarWorld",
                { name: S, system: S, offset: nul(list(I)), state: S, keys: list(S), detail: S, darkAt: nul(I) },
                "`offset` is null when the record says the position is not known. `keys` are \"season-idx\" reader keys.",
              ),
            ),
            fences: list(list(S)),
          }),
        }),
        value: {
          ...anthology,
          witnesses: anthology.witnesses.map(witnessOf),
          starmap: { ...anthology.starmap, worlds: starWorlds },
        },
      },
      {
        name: "anthologyEntries",
        doc: "Every published entry, in corpus order. `entry` is season 1 only, `page` season 2 only, `kindling` season 3 only.",
        type: list(
          obj("AnthologyEntry", {
            season: I,
            idx: I,
            slug: S,
            title: S,
            entry: I,
            page: I,
            kindling: nul(I),
            planet: S,
            system: S,
            phenomenon: S,
            blurb: S,
            words: I,
            plate: S,
            witness: nul(Witness),
          }),
        ),
        value: anthologyEntries.map((e) => ({ ...e, witness: e.witness ? witnessOf(e.witness) : null })),
      },
      {
        name: "unfiledPieces",
        doc: "Work with no season yet.",
        type: list(obj("UnfiledPiece", { idx: I, slug: S, title: S, series: S, blurb: S, words: I, tags: list(S) })),
        value: unfiledPieces,
      },
      {
        name: "siblingSeries",
        type: list(
          obj("SiblingSeries", {
            slug: S,
            title: S,
            tagline: S,
            medium: S,
            entries: list(obj("SiblingEntry", { idx: I, slug: S, title: S, blurb: S, words: I, plate: S })),
          }),
        ),
        value: siblingSeries,
      },
    ],
  },

  {
    out: "CvCanonData.kt",
    source: "src/data/canonLore.ts",
    note: "Left behind: TETHER's `pattern`, a JavaScript regex source that only the\nTypeScript test re-derives the counts with.",
    vals: [
      {
        name: "seasonCanon",
        doc: "Per-season doctrine, keyed by season number. A season with no row renders thin, never blank.",
        type: dict(
          I,
          obj("SeasonCanon", {
            laws: list(
              obj(
                "CanonLaw",
                { n: I, name: S, gloss: S, contested: nul(S), seenAt: Ref, alsoAt: list(Ref) },
                "`n` is continuous across seasons. `contested` marks one storyteller's position rather than settled canon.",
              ),
            ),
            thesis: S,
            points: list(Point),
            spoils: nul(S),
          }),
        ),
        value: Object.fromEntries(
          Object.keys(SEASON_CANON)
            .map(Number)
            .sort((a, b) => a - b)
            // `laws` is absent on seasons that added none, `alsoAt` on the two
            // laws with no second entry that clears the admission bar. Both are
            // an empty list here rather than a nullable one: no surface wants
            // the difference between "none" and "not stated".
            .map((n) => [
              n,
              {
                ...SEASON_CANON[n],
                laws: (SEASON_CANON[n].laws ?? []).map((l) => ({ ...l, alsoAt: l.alsoAt ?? [] })),
              },
            ]),
        ),
      },
      { name: "namedThirteen", type: list(S), value: NAMED_THIRTEEN },
      {
        name: "countLedger",
        doc: "The count's arithmetic, shown rather than asserted: 27 names across 28 lines.",
        type: list(obj("CountLedgerRow", { line: S, value: S })),
        value: COUNT_LEDGER,
      },
      {
        name: "renderingDoctrine",
        type: obj("RenderingDoctrine", { claim: S, mechanism: list(S), pull: S, consequences: list(Point) }),
        value: RENDERING_DOCTRINE,
      },
      {
        name: "renderings",
        doc: "The four states of the rig. `state` is held | strained | failed | refused; `witnessId` resolves against anthology.witnesses.",
        type: list(obj("Rendering", { state: S, witnessId: S, slug: S, note: S })),
        value: RENDERINGS,
      },
      {
        name: "rigConstraints",
        type: list(obj("RigConstraint", { species: S, world: S, constraint: S })),
        value: RIG_CONSTRAINTS,
      },
      { name: "rigConstraintsNote", type: S, value: RIG_CONSTRAINTS_NOTE },
      {
        name: "tether",
        doc: "Measured against the corpus, not recalled. canonLore.test.ts re-derives these three.",
        type: list(obj("TetherRow", { value: I, label: S })),
        value: TETHER,
      },
      { name: "tetherDoctrine", type: S, value: TETHER_DOCTRINE },
      {
        name: "standardIntervals",
        doc: "`blank` marks the two intervals named at founding with no length, so the cell renders empty rather than as data.",
        type: list(obj("StandardInterval", { interval: S, realm: S, length: S, blank: B })),
        value: STANDARD_INTERVALS.map((i) => ({ ...i, blank: i.blank === true })),
      },
      { name: "milgalaxalNote", type: S, value: MILGALAXAL_NOTE },
      { name: "afterlivesNote", type: S, value: AFTERLIVES_NOTE },
    ],
  },

  {
    out: "CvMakingData.kt",
    source: "src/data/making.ts",
    vals: [
      {
        name: "s2AuditKills",
        doc: "The six Season Two premises a blind cross-lab audit named as somebody else's.",
        type: list(obj("KillRecord", { premise: S, namedAs: S, fate: S })),
        value: S2_AUDIT_KILLS,
      },
      { name: "s2MissingBeat", type: S, value: S2_MISSING_BEAT },
      { name: "s2NegativeControl", type: S, value: S2_NEGATIVE_CONTROL },
      {
        name: "s3FirstDesign",
        type: obj("S3Design", { premise: S, findings: list(obj("S3Finding", { title: S, note: S })), replacement: S }),
        value: S3_FIRST_DESIGN,
      },
      { name: "s4Fence", type: obj("S4Fence", { named: S, finding: S, quote: S }), value: S4_FENCE },
      {
        name: "auditMethod",
        type: obj("AuditMethod", { send: S, gate: S, whyNotSelfAssessed: S, summary: S }),
        value: AUDIT_METHOD,
      },
      {
        name: "portraitIterations",
        doc: "The art passes, including the two defects that shipped before they were caught.",
        type: obj("PortraitIterations", { firstSet: S, firstFix: S, secondDefect: S, theFix: S, trap: S }),
        // firstSet is a one-field object upstream; flattened rather than shipped
        // as a data class with a single `verdict` in it.
        value: { ...PORTRAIT_ITERATIONS, firstSet: PORTRAIT_ITERATIONS.firstSet.verdict },
      },
      { name: "voiceConstraints", type: list(S), value: VOICE_CONSTRAINTS },
      { name: "pipelineStages", type: list(obj("PipelineStage", { step: S, detail: S })), value: PIPELINE_STAGES },
      { name: "retroactionStandard", type: S, value: RETROACTION_STANDARD },
      {
        name: "spend",
        doc: "US dollars, actual.",
        type: obj("Spend", {
          totalUsd: D,
          firstBuildUsd: D,
          secondBuildUsd: D,
          auditsUsd: D,
          artUsd: D,
          note: S,
        }),
        value: SPEND,
      },
      { name: "receipts", type: list(obj("Receipt", { label: S, href: S })), value: RECEIPTS },
    ],
  },

  {
    out: "CvOpsData.kt",
    source: "src/data/ops.ts",
    vals: [
      {
        name: "opsPerimeter",
        doc: "Every generated corpus, its stamp, and the SLA it is judged against.",
        type: list(obj("PerimeterEntry", { file: S, generatedAt: S, slaDays: I, generator: S })),
        value: perimeter,
      },
      {
        name: "opsLeverage",
        doc: "Shared modules and the sibling repos consuming them.",
        type: list(obj("LeverageEntry", { id: S, modules: I, repos: list(S) })),
        value: leverage,
      },
      {
        name: "opsDrift",
        doc: "Pinned upstreams and how far behind each pin has fallen. `behind` is null when it could not be measured.",
        type: list(obj("DriftEntry", { repo: S, upstream: S, pin: S, behind: nul(I), pinnedAt: nul(S) })),
        value: drift,
      },
      { name: "opsGeneratedAt", type: S, value: opsGeneratedAt },
    ],
  },

  {
    out: "CvArchiveTextData.kt",
    source: "src/data/archiveText.ts",
    note:
      "Bodies are INCLUDED here, unlike CvAnthologyData.kt where they are not.\n" +
      "/read is the only surface that renders them and they are what it is, so\n" +
      "dropping them would ship the route as a stub. 85,299 bytes of UTF-8 prose\n" +
      "across nine pieces, which is 89 KB of Kotlin string literal and compresses\n" +
      "hard on the wire.\n" +
      "\n" +
      "The markdown in these bodies was measured, not assumed: across all nine,\n" +
      "the only constructs present are `> ` blockquote (9 lines, the leading\n" +
      "blurb of each piece) and *italic* (3 lines). No headings, bold, lists,\n" +
      "links, code, rules or tables. A renderer for /read needs those two.",
    vals: [
      {
        name: "printedPieces",
        doc: "The prose that ran in Excelsior. `page` is the PDF page index, 0 for a piece that never ran in print; `printWords` is what actually ran when the draft was cut, 0 when it was not.",
        type: list(
          obj("PrintedPiece", {
            slug: S,
            title: S,
            form: S,
            era: S,
            blurb: S,
            tags: list(S),
            words: I,
            year: S,
            page: I,
            url: S,
            published: S,
            printWords: I,
            note: S,
            body: S,
          }),
        ),
        value: printedPieces,
      },
    ],
  },

  {
    out: "CvChessData.kt",
    source: "src/data/chess.ts, src/data/chessDeep.ts, public/chess/corpus.json",
    note:
      "Scoped to the surfaces that port: ChessFindings, ChessVsCommits, and the\n" +
      "non-WebGL branch each of ChessRoom's three three.js panes already ships.\n" +
      "Left behind from chess.ts: length, material, firstMoveWhite, clutch,\n" +
      "checkmate, tilt, colour, accuracy, bestUpset and puzzle, read only by the\n" +
      "scenes themselves, the engine-backed board and the daily puzzle, none of\n" +
      "which port. `arc` IS taken: it is the weekly downsample the flat fallback\n" +
      "ChessArc.tsx draws, 190 points rather than corpus.arc's ~4,500.\n" +
      "From corpus.json: hours, graveyard, repertoireByPlatform and positions.\n" +
      "Still left there: corpus.arc (per-game resolution only the ribbon needs)\n" +
      "and corpus.openings (850 aggregate rows nothing 2D reads).\n" +
      "`boardTime` is flattened: its nested chesscom block contributes only\n" +
      "`games`, and its per-class hours are not rendered anywhere.\n" +
      "\n" +
      "The three honesty constraints the React copy carries are properties of\n" +
      "this data, not of that file: combinedHours ADDS two different\n" +
      "measurements (lichess self-report plus a figure derived from chess.com PGN\n" +
      "wall clock), the two platforms are a handoff rather than parallel\n" +
      "accounts, and a repertoire year's Scandinavian share is a floor because it\n" +
      "sums only the lines that made that year's top five.",
    vals: [
      {
        name: "chess",
        doc: "Everything the Findings tab renders. Every figure is generator output; nothing here is typed by hand.",
        type: obj("ChessStats", {
          generatedAt: S,
          span: obj("ChessSpan", { from: S, to: S }),
          totals: obj("ChessTotals", { games: I, wins: I, losses: I, draws: I, hours: I }),
          boardTime: obj(
            "ChessBoardTime",
            { lichessHours: I, chesscomHours: I, combinedHours: I, chesscomGames: I, note: S },
            "`combinedHours` is two measurement methods added together, not one metric. `note` says which.",
          ),
          thesis: obj(
            "ChessThesis",
            {
              decidedOnClock: D,
              lossesOnTime: D,
              winsOnTime: D,
              sampleSize: I,
              deciles: list(
                obj(
                  "ChessDecile",
                  { bucket: I, win: D, loss: D, gap: D },
                  "Mean fraction of the starting clock still left. `bucket` is 0-based; the axis step is 100 / deciles.size.",
                ),
              ),
            },
            "Fractions, not percentages: multiply by 100 to print.",
          ),
          discipline: obj("ChessDiscipline", {
            distinctDays: I,
            spanDays: I,
            longestDayStreak: I,
            longestWin: I,
            longestLoss: I,
          }),
          sessionDecay: list(
            obj("ChessSessionGame", { position: I, winRate: D, n: I }, "Win rate by how deep into one sitting the game was. `n` is thin at the tail and is rendered with it."),
          ),
          activityByYear: list(obj("ChessActivityYear", { year: S, lichess: I, chesscom: I })),
          repertoire: list(
            obj("ChessRepertoireYear", {
              year: S,
              openings: list(obj("ChessOpeningShare", { name: S, count: I, share: D })),
            }),
          ),
          platforms: list(
            obj("ChessPlatform", {
              id: S,
              url: S,
              joined: S,
              lastActive: S,
              games: I,
              provisional: B,
              peaks: list(obj("ChessPeak", { format: S, rating: I, at: nul(S) })),
              puzzles: nul(obj("ChessPuzzleStats", { peak: I, solved: I })),
            }),
          ),
        }),
        value: {
          generatedAt: chess.generatedAt,
          span: chess.span,
          totals: chess.totals,
          boardTime: {
            lichessHours: chess.boardTime.lichessHours,
            chesscomHours: chess.boardTime.chesscomHours,
            combinedHours: chess.boardTime.combinedHours,
            chesscomGames: chess.boardTime.chesscom.games,
            note: chess.boardTime.note,
          },
          thesis: chess.thesis,
          discipline: chess.discipline,
          sessionDecay: chess.sessionDecay,
          activityByYear: chess.activityByYear,
          repertoire: chess.repertoire,
          platforms: chess.platforms.map((p) => ({
            ...p,
            peaks: p.peaks.map((k) => ({ ...k, at: k.at ?? null })),
            // `last` is dropped: the surface prints the peak and the solved count.
            puzzles: p.puzzles ? { peak: p.puzzles.peak, solved: p.puzzles.solved } : null,
          })),
        },
      },
      {
        name: "chessDeep",
        doc: "The second pass: how the game was found, which time control, how it ended, and when the opening book ran out. Win rates and shares here are PERCENTAGES, unlike chess.thesis.",
        type: obj("ChessDeep", {
          generatedAt: S,
          lastSeenOnLichess: S,
          sampleSize: I,
          bySource: list(obj("ChessSourceRow", { source: S, n: I, winRate: D })),
          byTimeControl: list(obj("ChessTimeControlRow", { tc: S, n: I, winRate: D })),
          byEnding: list(obj("ChessEndingRow", { status: S, n: I, share: D })),
          book: obj("ChessBook", {
            medianPly: I,
            deep: obj("ChessBookArm", { n: I, winRate: D }),
            shallow: obj("ChessBookArm", { n: I, winRate: D }),
          }),
        }),
        value: chessDeep,
      },
      {
        name: "chessHours",
        doc: "The rhythm tab: two 24-hour distributions on one axis, each normalised to its own busiest hour. Hours are IST. `winRate` is a fraction; every hour in the corpus has one, so it is not nullable here.",
        type: obj("ChessHours", {
          games: list(obj("ChessHourGames", { hour: I, n: I, winRate: D })),
          commits: list(obj("ChessHourCommits", { hour: I, n: I })),
          commitSample: obj(
            "ChessCommitSample",
            { n: I, total: I, from: S },
            "The commit half is capped by GitHub's search API: `n` of `total` matching commits since `from`. Shapes are comparable, volumes are not.",
          ),
        }),
        value: {
          games: corpusHours.chess,
          commits: corpusHours.commits,
          commitSample: corpusHours.commitSample,
        },
      },
      {
        name: "chessArc",
        doc:
          "The rating arc as the flat fallback draws it: one band per platform, each on its OWN vertical scale. " +
          "The two rating pools are not comparable, so a shared axis would draw a decline the games do not support. " +
          "Only `t` is shared. Weekly-sampled, which is what the fallback's own caption says it is.",
        type: obj("ChessArcCorpus", {
          series: list(
            obj("ChessArcSeries", {
              platform: S,
              format: S,
              points: list(obj("ChessArcPoint", { t: D, rating: I }, "`t` is a ms epoch, held as a Double because it does not fit an Int.")),
            }),
          ),
          fromDay: S,
          toDay: S,
          yearTicks: list(D),
        }),
        value: {
          series: arcSeries.map((a) => ({
            platform: a.platform,
            format: a.format,
            points: a.points.map((p) => ({ t: p.t, rating: p.r })),
          })),
          fromDay: isoDay(arcFrom),
          toDay: isoDay(arcTo),
          yearTicks: arcYearTicks,
        },
      },
      {
        name: "chessGraveyard",
        doc:
          "Terminal-position square counts, index 0-63 = a1-h8: how many games of that outcome ended with a piece, " +
          "either side's, still standing there. chess.com's games ONLY — lichess's export ships no FEN, so their " +
          "final positions were never recorded and are not in this board.",
        type: obj("ChessGraveyard", { losses: list(I), wins: list(I) }),
        value: { losses: corpus.graveyard.losses, wins: corpus.graveyard.wins },
      },
      {
        name: "chessRepertoireByPlatform",
        doc:
          "The black repertoire keyed by year and then platform, already flattened into year order. The nesting is " +
          "the honest one: an opening's fall on lichess and its return on chess.com are two WITHIN-platform " +
          "observations either side of the handoff, and nothing may flatten them into one series. `share` is null " +
          "when the generator marked the platform-year thin, and stays null all the way to the screen.",
        type: list(
          obj("ChessRepertoireYearByPlatform", {
            year: S,
            platforms: list(
              obj("ChessRepertoirePlatformSlice", {
                key: S,
                blackGames: I,
                thin: B,
                openings: list(obj("ChessRepertoirePlatformOpening", { name: S, count: I, share: nul(D) })),
              }),
            ),
          }),
        ),
        value: repertoireByPlatform,
      },
      {
        name: "chessPositions",
        doc:
          "The guess-the-move quiz: the last position of a finished game, and how it actually went. Only the FEN's " +
          "piece-placement and side-to-move fields are read, so nothing here needs a move generator. chess.com only, " +
          "for the same reason the graveyard is.",
        type: list(obj("ChessQuizPosition", { fen: S, result: S, speed: S, at: S, myRating: I })),
        value: corpus.positions,
      },
    ],
  },

  {
    out: "CvStoryMapData.kt",
    source: "src/data/storyMap.ts",
    note:
      "The constellation moved out of StoryMap.tsx into src/data/storyMap.ts so a\n" +
      "Node script can import it; the component re-exports all three names, so no\n" +
      "importer changed. `x` and `y` are normalised 0..1 and `r` is a radius in\n" +
      "the same units the React canvas uses at its own scale — multiply by the\n" +
      "drawing surface, do not treat either as pixels.\n" +
      "\n" +
      "`target` is \"chat\", a \"#hash\", or an external URL. The hash forms are\n" +
      "\"#top\", \"#work\", \"#project/<slug>\" and \"#<section>\"; classifying it is the\n" +
      "screen's job, the same single place React classifies it.",
    vals: [
      {
        name: "storyMapNodes",
        type: list(obj("StoryMapNode", { id: S, label: S, sub: nul(S), x: D, y: D, r: D, color: S, target: S })),
        value: NODES.map((n) => ({ ...n, sub: n.sub ?? null })),
      },
      {
        name: "storyMapEdges",
        doc: "Undirected wiring between node ids. Both endpoints resolve against storyMapNodes.",
        type: list(obj("StoryMapEdge", { from: S, to: S })),
        value: EDGES.map(([from, to]) => {
          const ids = new Set(NODES.map((n) => n.id));
          assert.ok(ids.has(from) && ids.has(to), `storyMap: edge ${from}-${to} names a node that does not exist`);
          return { from, to };
        }),
      },
    ],
  },

  {
    out: "CvExcelsiorData.kt",
    source: "src/data/excelsior.ts, src/data/excelsiorMarks.ts",
    note:
      "The reader ships no bitmaps. Page images stream from the live site at\n" +
      "/excelsior/pages/<year>/p<NNN>.webp, NNN zero-padded to three — the same\n" +
      "path src/data/excelsior.ts builds, kept as a rule rather than 396 emitted\n" +
      "strings. webp on purpose: skiko has no AVIF decoder.\n" +
      "\n" +
      "`page` on a mark is the PDF page index the reader addresses, which is NOT\n" +
      "always the number printed on the page: 2019 and 2021 print at offset 0,\n" +
      "2020 prints two lower. Every one was verified by opening the rendered\n" +
      "page, because the PDFs carry no text layer.",
    vals: [
      {
        name: "excelsiorEditions",
        doc: "`pages` is the page count; `source` is MANIT's own PDF, the canonical copy this was rendered from.",
        type: list(obj("ExcelsiorEdition", { year: S, pages: I, source: S })),
        value: excelsiorEditions,
      },
      {
        name: "excelsiorMarks",
        doc: "Hand-curated deep links into the reader. `kind` is wrote | about | credit. `readSlug` resolves against printedPieces, and is null for a mark with no readable version.",
        type: list(obj("ExcelsiorMark", { year: S, page: I, label: S, note: S, kind: S, readSlug: nul(S) })),
        value: excelsiorMarks.map((m) => {
          // The two corpora are curated apart, so the cross-link is checked
          // here rather than discovered as a dead tap on the reader.
          assert.ok(["wrote", "about", "credit"].includes(m.kind), `excelsiorMarks: ${m.label} has kind "${m.kind}"`);
          const known = excelsiorEditions.some((e) => e.year === m.year);
          assert.ok(known, `excelsiorMarks: ${m.label} is in ${m.year}, which is not an edition`);
          if (m.readSlug) {
            const hit = printedPieces.some((p) => p.slug === m.readSlug);
            assert.ok(hit, `excelsiorMarks: ${m.label} reads /read/${m.readSlug}, which is not in archiveText.ts`);
          }
          return { ...m, readSlug: m.readSlug ?? null };
        }),
      },
    ],
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────
if (!existsSync(kmpRoot)) {
  console.log(`gen-kotlin-data: ${kmpRoot} is not checked out, skipping the Compose twin.`);
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });

let changed = 0;
for (const spec of files) {
  const r = emit(spec);
  if (r.changed) changed++;
  console.log(`gen-kotlin-data: ${r.changed ? "wrote" : "unchanged"} ${r.out} (${r.text.split("\n").length} lines)`);
}
console.log(`gen-kotlin-data: ${files.length} files, ${changed} changed.`);
