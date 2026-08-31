// Emits the Compose Multiplatform twin's data layer from THIS repo's data
// modules. Four of the eight sources below carry their own AUTO-GENERATED
// banner (store.ts, weeb.ts, writing.ts, anthology.ts), so a hand-written
// Kotlin copy of them is a second transcript that no generator refreshes.
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
    note: "Left behind: every story `body` (448 KB) and every `sigil` (206 KB of\ninline animated SVG). /read is not ported and Compose has no SVG-string\nrenderer, so both would be dead weight in a wasm bundle a visitor\ndownloads. `mark` goes with them for the same reason.",
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
