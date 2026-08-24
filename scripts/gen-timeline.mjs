// scripts/gen-timeline.mjs
/**
 * Emits src/data/timeline.ts — the monthly series the /playground terrain is
 * built from. The ground you drive over IS this file; nothing about the
 * landscape is invented.
 *
 * HONESTY IS THE WHOLE CONTRACT HERE. A terrain is a claim about his career
 * drawn at 1:1 scale, so every lane carries its own `source` and `resolution`
 * and the world prints them. The trap this file exists to avoid was found on
 * 2026-08-24: public GitHub contributions read 2021:1, 2022:3, 2023:2,
 * 2024:0 — not because he stopped working but because Jugnoo and Dice are
 * private company repos. Rendering that as "the code lane" would have drawn a
 * four-year hole in the middle of his career on his own CV. So public GitHub
 * is its own lane, labelled `open source`, and the lane that represents
 * employment is built from employment dates instead.
 *
 * Per the house generator contract (gen-chess-stats.mjs, gen-project-stats.mjs):
 * a missing or unparseable source NEVER fails the build and NEVER writes a
 * degraded file — the previous committed output is left exactly as it was.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "./lib/net.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/data/timeline.ts");

const FROM = "2019-01";
const now = new Date();
const TO = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

/** Every "YYYY-MM" from FROM to TO inclusive. Months with no data must exist
 *  as zero — a missing key renders as absent geometry, which reads as broken
 *  terrain rather than as a quiet month. */
function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
const MONTHS = monthRange(FROM, TO);
const zero = () => Object.fromEntries(MONTHS.map((m) => [m, 0]));
const ymOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/* ── chess: 14,119 lichess games, one row per game, real timestamps ───────── */
function chessLane() {
  const cache = join(root, ".chess-cache/lichess-games.json");
  if (!existsSync(cache)) return null;
  let games;
  try {
    const parsed = JSON.parse(readFileSync(cache, "utf8"));
    games = Array.isArray(parsed) ? parsed : parsed.games ?? Object.values(parsed)[0];
  } catch { return null; }
  if (!Array.isArray(games) || games.length === 0) return null;
  const months = zero();
  let counted = 0;
  for (const g of games) {
    const t = g.createdAt ?? g.lastMoveAt;
    if (typeof t !== "number") continue;
    const ym = ymOf(new Date(t));
    if (ym in months) { months[ym]++; counted++; }
  }
  if (counted === 0) return null;
  return {
    key: "chess", label: "chess", unit: "games played", resolution: "month",
    source: "lichess game archive, one row per game",
    months, total: counted,
  };
}

/* ── open source: the public contribution calendar, labelled for what it is ── */
async function openSourceLane() {
  const token = process.env.GITHUB_TOKEN;
  const years = [...new Set(MONTHS.map((m) => m.slice(0, 4)))];
  const months = zero();
  let counted = 0;
  for (const y of years) {
    const q = `{ user(login:"darkpandawarrior"){ contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z"){ contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
    let json;
    try {
      if (token) {
        const res = await fetchWithTimeout("https://api.github.com/graphql", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) return null;
        json = await res.json();
      } else {
        const { execFileSync } = await import("node:child_process");
        json = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${q}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      }
    } catch { return null; }
    const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
    if (!Array.isArray(weeks)) return null;
    for (const w of weeks) for (const d of w.contributionDays ?? []) {
      const ym = d.date.slice(0, 7);
      if (ym in months && d.contributionCount > 0) { months[ym] += d.contributionCount; counted += d.contributionCount; }
    }
  }
  if (counted === 0) return null;
  return {
    key: "opensource", label: "open source", unit: "public contributions", resolution: "month",
    source: "GitHub public contribution calendar — PUBLIC repos only; the Jugnoo and Dice work is on private company repos and is deliberately not counted here",
    months, total: counted,
  };
}

/* ── work: employment spans, because commit counts cannot see private repos ── */
const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
function parseWhen(s) {
  const t = s.trim().toLowerCase();
  if (t === "present" || t === "now") return TO;
  const m = t.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) { const i = MONTH_NAMES.indexOf(m[1]); if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`; }
  const y = t.match(/^(\d{4})$/);
  return y ? `${y[1]}-01` : null;
}
async function workLane() {
  let profileMod;
  try { profileMod = await import(join(root, "src/data/profile.ts")); } catch { return null; }
  // Walk the whole module for any object carrying a `period` — the roles are
  // nested and the export name has moved before; finding them by shape rather
  // than by path keeps this generator from breaking on a refactor.
  const roles = [];
  const seen = new Set();
  (function walk(v) {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (typeof v.period === "string" && (v.company || v.role || v.title || v.org)) {
      roles.push({
        period: v.period,
        label: v.company ?? v.org ?? v.role ?? v.title,
        role: v.role ?? v.title ?? "",
        // The achievement bullets ARE the Jugnoo and Dice years. Those repos
        // are private, so no commit graph can show that work — but it is
        // documented, dated by the role that contains it, and every claim in
        // it is already covered by the claim-audit. Counting them is honest
        // where counting commits would have been a lie of omission.
        points: Array.isArray(v.points) ? v.points : [],
      });
    }
    for (const x of Object.values(v)) walk(x);
  })(profileMod);
  if (roles.length === 0) return null;

  const months = zero();
  const milestones = [];
  for (const r of roles) {
    const [a, b] = r.period.split(/\s*[-–—]\s*/);
    const from = parseWhen(a ?? ""), to = parseWhen(b ?? a ?? "");
    if (!from || !to) continue;
    const span = monthRange(from, to).filter((m) => m in months);
    if (span.length === 0) continue;

    // Height is documented delivered scope, not headcount: a role that shipped
    // more carries a taller plateau for exactly as long as it ran.
    const scope = Math.max(1, r.points.length);
    for (const ym of span) months[ym] += scope;

    milestones.push({ ym: span[0], lane: "work", kind: "role", label: `${r.label} — ${r.role}`.trim() });

    // Spread the bullets evenly across the role so they are things you drive
    // PAST rather than a stack at one coordinate. They inherit the role's
    // dates because that is the resolution the source actually has.
    r.points.forEach((pt, i) => {
      const text = typeof pt === "string" ? pt : (pt?.text ?? pt?.label ?? "");
      if (!text) return;
      const ym = span[Math.min(span.length - 1, Math.floor(((i + 0.5) / r.points.length) * span.length))];
      milestones.push({ ym, lane: "work", kind: "delivered", label: String(text).slice(0, 180) });
    });
  }
  const total = Object.values(months).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return {
    key: "work", label: "work", unit: "documented deliverables in force", resolution: "month",
    source: "employment periods and their achievement bullets from profile.ts — measured as documented delivered scope rather than commits, because the Jugnoo and Dice repositories are private and a public commit graph would show a four-year hole where the work actually was",
    months, total, milestones,
  };
}

/* ── writing: yearly resolution, and says so ─────────────────────────────── */
async function writingLane() {
  const months = zero();
  const milestones = [];
  let counted = 0;
  const bump = (ym, n, label, kind) => {
    if (!(ym in months)) return;
    months[ym] += n; counted += n;
    if (label) milestones.push({ ym, lane: "writing", kind, label });
  };
  try {
    const { excelsiorEditions } = await import(join(root, "src/data/excelsior.ts"));
    for (const e of excelsiorEditions ?? []) bump(`${e.year}-06`, Math.max(1, Math.round(e.pages / 40)), `Excelsior ${e.year}`, "edition");
  } catch { /* optional */ }
  try {
    const { facets } = await import(join(root, "src/data/facets.ts"));
    for (const f of facets ?? []) if (typeof f.authored === "string") bump(f.authored.slice(0, 7), 1, null, "piece");
  } catch { /* optional */ }
  try {
    const { printedPieces } = await import(join(root, "src/data/archiveText.ts"));
    for (const p of printedPieces ?? []) {
      const y = String(p.year ?? p.published ?? "").match(/(20\d{2})/);
      if (y) bump(`${y[1]}-06`, 1, null, "piece");
    }
  } catch { /* optional */ }
  if (counted === 0) return null;
  return {
    key: "writing", label: "writing", unit: "pieces published", resolution: "year",
    source: "Excelsior editions, printed archive and the facet chronology — most carry a year but no month, so this lane is plotted at year resolution and must not be read month-to-month",
    months, total: counted, milestones,
  };
}

/* ── emit ────────────────────────────────────────────────────────────────── */
const lanes = (await Promise.all([workLane(), chessLane(), writingLane(), openSourceLane()])).filter(Boolean);

// A partial derive is the dangerous case, not an empty one. On CI the chess
// cache is gitignored and `gh` is absent, so chessLane() and openSourceLane()
// both return null while work/writing still succeed — and writing that file
// would silently delete two thirds of the terrain while exiting 0. So the
// rule is regression, not emptiness: never emit fewer lanes than the
// committed file already has.
const previousLaneCount = (() => {
  if (!existsSync(OUT)) return 0;
  try { return (readFileSync(OUT, "utf8").match(/"key":\s*"/g) ?? []).length; } catch { return 0; }
})();

if (lanes.length === 0 || lanes.length < previousLaneCount) {
  console.error(
    `gen-timeline: derived ${lanes.length} lane(s) but the committed file has ${previousLaneCount} — ` +
    `leaving src/data/timeline.ts untouched (missing source: chess cache and/or GitHub credentials)`,
  );
  process.exit(0);
}

for (const l of lanes) {
  const entries = Object.entries(l.months);
  const [pk, pv] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  l.peak = { ym: pk, v: pv };
}

const body = `// AUTO-GENERATED by scripts/gen-timeline.mjs — do not edit by hand.
//
// The /playground terrain is built from this file: ground height under the
// wheels is \`lanes[].months[ym]\`. Every lane states its own source and
// resolution because the landscape is a claim about a real career and has to
// be answerable for itself. Notably \`opensource\` counts PUBLIC repositories
// only — it is not a measure of how much he worked.
export interface TimelineLane {
  key: string;
  label: string;
  unit: string;
  resolution: "month" | "year";
  source: string;
  months: Record<string, number>;
  total: number;
  peak: { ym: string; v: number };
  milestones?: { ym: string; lane: string; kind: string; label: string }[];
}
export interface Timeline {
  generatedAt: string;
  from: string;
  to: string;
  months: string[];
  lanes: TimelineLane[];
}

export const timeline: Timeline = ${JSON.stringify({ generatedAt: new Date().toISOString(), from: FROM, to: TO, months: MONTHS, lanes }, null, 2)};
`;

writeFileSync(OUT, body);
console.log(`gen-timeline: ${lanes.length} lanes, ${MONTHS.length} months ${FROM}..${TO}`);
for (const l of lanes) console.log(`  ${l.key.padEnd(11)} total=${String(l.total).padEnd(6)} peak=${l.peak.ym} (${l.peak.v})  [${l.resolution}]`);
