/**
 * A job description scored against Siddharth's stack with no model involved.
 *
 * WHY THIS EXISTS. The LLM path is the good path — it reads nuance, weighs
 * seniority, and writes prose. It is also the fragile one: it can rate-limit,
 * it can 502, and (as a reasoning model shipping its answer in a field we don't
 * read) it can return a perfectly valid stream containing nothing at all. Every
 * one of those failure modes used to end at a recruiter looking at an empty
 * box. This module means the analyzer always has something true to say, because
 * matching a JD against a known stack is string work, not intelligence.
 *
 * It runs instantly, offline, costs nothing, and is not subject to any rate
 * limit — so it renders the moment the paste lands, and the model's richer
 * answer replaces it when (and only when) that arrives.
 *
 * SCOPE, DELIBERATELY. This is a floor, not a ceiling. It knows terms, not
 * meaning: it cannot tell a Staff role from a junior one, cannot read "5 years
 * Android" as a bar to clear, and cannot judge whether a project is comparable.
 * Everything it claims is defensible from a term appearing in the text; nothing
 * it says is a judgement call. The model still does the judging.
 *
 * KNOWN DELTA, MEASURED. On the real JD used to calibrate this (Android +
 * native iOS + React web) it scores 73 where the model says 58. The model is
 * right: it weighs how *central* each requirement is to the role, and two of
 * that JD's three pillars aren't his. This matcher weighs every term the same,
 * so a role whose incidental asks he happens to cover scores higher than it
 * deserves. The gap rows are accurate — they name both pillars — and the score
 * is labelled a keyword match, but do not read the number as a fit judgement.
 * Closing the delta by tuning weights against that one sample would be fitting
 * to noise; the model arriving ~1.6s later is the real answer.
 *
 * PUBLIC-REPO NOTE: this ships in the client bundle, so the tables below encode
 * only what the site already states publicly. Weak spots are never enumerated
 * here — a gap is only ever "the JD asked for X and X isn't in the stack",
 * derived from the pasted text, never from a stored list of shortcomings.
 */

import type { JdFitReport } from "./chatBlocks.ts";

/**
 * How well established a skill is. Weighting by depth is what keeps the score
 * honest: a JD that wants deep Compose and a bit of KMP shouldn't score the
 * same as one wanting deep KMP and a bit of Compose.
 */
export type Depth = "deep" | "working" | "familiar";

/**
 * Deliberately harsh on `familiar`.
 *
 * Measured against the model on a real JD (Android + native iOS + React web),
 * an earlier 0.45 scored 76 where the model — correctly — said 58. The matcher
 * had seen "ios" and "react" in the text and credited them, while the model
 * understood the JD wanted *native* iOS and *production* React, neither of
 * which is his. A keyword matcher cannot make that distinction, so it must not
 * price a shallow match anywhere near a real one.
 *
 * Erring low is the only safe direction here. An offline score that flatters
 * and is then corrected downward by the model reads as an unreliable tool, and
 * it is Siddharth's credibility with a recruiter that pays for it.
 */
const DEPTH_WEIGHT: Record<Depth, number> = { deep: 1, working: 0.7, familiar: 0.25 };

/** A requirement stated as "nice to have" counts, but not like a hard one. */
const PREFERRED_WEIGHT = 0.35;

export interface Skill {
  /** Display name — what the card calls it. */
  name: string;
  depth: Depth;
  /** Why he has it, in the card's voice. Public site facts only. */
  evidence: string;
  /** Every way a JD might name it. Matched whole-word, case-insensitively. */
  aliases: string[];
}

/**
 * The stack, as the site already publishes it (src/data/profile.ts).
 *
 * `aliases` is the load-bearing field: JDs say "JC", "Compose", "Jetpack
 * Compose" and "Compose UI" for one thing, and a matcher that only knows the
 * canonical spelling silently under-reports the fit.
 */
export const SKILLS: Skill[] = [
  {
    name: "Jetpack Compose",
    depth: "deep",
    evidence: "~87% of a ~960k-line production app is Compose, including the View interop layer",
    aliases: ["jetpack compose", "compose", "compose ui", "material 3", "material3", "material design 3"],
  },
  {
    name: "Kotlin",
    depth: "deep",
    evidence: "Primary language for 5+ years across every production app he's shipped",
    aliases: ["kotlin"],
  },
  {
    name: "Coroutines & Flow",
    depth: "deep",
    evidence: "StateFlow/SharedFlow and structured concurrency across ~180 ViewModels",
    aliases: ["coroutine", "coroutines", "kotlin coroutines", "flow", "stateflow", "sharedflow", "structured concurrency", "reactive programming", "rxjava"],
  },
  {
    name: "MVVM & Clean Architecture",
    depth: "deep",
    evidence: "Single-UiState MVI over a repository layer, ~180 ViewModels in production",
    aliases: ["mvvm", "mvi", "clean architecture", "architecture patterns", "repository pattern", "design patterns", "solid"],
  },
  {
    name: "Room / SQLite",
    depth: "deep",
    evidence: "24 schema migrations across 2 production databases; 47 sequential non-destructive migrations in Mileway (schema v48)",
    aliases: ["room", "sqlite", "sqldelight", "local database", "persistence", "orm", "datastore"],
  },
  {
    name: "Dependency injection (Hilt/Dagger)",
    depth: "deep",
    evidence: "Hilt across the whole graph — scoping, assisted injection, HiltWorker",
    aliases: ["hilt", "dagger", "dependency injection", "koin", "di framework"],
  },
  {
    name: "Android SDK & platform",
    depth: "deep",
    evidence: "5+ years; foreground services, WorkManager, background execution limits, OEM quirks",
    aliases: ["android", "android sdk", "android development", "native android", "workmanager", "foreground service", "foreground services", "background processing", "services", "broadcast receiver"],
  },
  {
    name: "Networking (Retrofit/OkHttp)",
    depth: "deep",
    evidence: "Retrofit + OkHttp with certificate pinning against a multi-tenant backend",
    aliases: ["retrofit", "okhttp", "rest", "rest api", "restful", "api integration", "networking", "graphql", "ktor"],
  },
  {
    name: "Mobile security",
    depth: "deep",
    evidence: "Android Keystore field-level encryption (AES-256), SSL pinning across 9 domains (5 SHA-256 pins), biometric access gate, EncryptedSharedPreferences/DataStore+Tink — VAPT-cleared",
    aliases: ["security", "encryption", "keystore", "ssl pinning", "certificate pinning", "biometric", "biometrics", "vapt", "penetration test", "owasp", "secure storage"],
  },
  {
    name: "Location & motion engineering",
    depth: "deep",
    evidence: "Predictive dead reckoning over GPS/IMU with Kalman smoothing and spike rejection — accuracy 50% → 95%; MotionFusion gravity/linear-acceleration filtering in Mileway",
    aliases: ["location", "gps", "geolocation", "sensor", "sensors", "maps", "google maps", "geofencing", "location tracking", "imu", "accelerometer", "kalman"],
  },
  {
    name: "CI/CD & release",
    depth: "deep",
    evidence: "Fastlane build/sign/upload, Play Store release ownership, Gradle Kotlin DSL",
    aliases: ["ci/cd", "ci cd", "continuous integration", "continuous delivery", "fastlane", "gradle", "jenkins", "github actions", "bitrise", "play store", "app store", "release management", "build system"],
  },
  {
    name: "Crash & analytics tooling",
    depth: "deep",
    evidence: "Crashlytics + Sentry + Mixpanel; drove an 80% crash reduction",
    aliases: ["crashlytics", "sentry", "firebase", "analytics", "mixpanel", "observability", "monitoring", "logging", "instrumentation"],
  },
  {
    name: "Kotlin Multiplatform",
    depth: "working",
    evidence: "Four shipped KMP/CMP projects targeting Android, iOS, desktop and Wasm",
    aliases: ["kmp", "kotlin multiplatform", "compose multiplatform", "cmp", "multiplatform", "cross-platform", "cross platform"],
  },
  {
    name: "iOS (via Compose Multiplatform)",
    depth: "familiar",
    evidence: "Ships iOS targets from shared KMP code — not a native UIKit/SwiftUI specialist",
    aliases: ["ios", "swift", "swiftui", "uikit", "xcode", "objective-c", "apple"],
  },
  {
    name: "Testing",
    depth: "working",
    evidence: "Unit tests over ViewModels and repositories with fakes; gdUnit4 on the Godot build",
    aliases: ["testing", "unit test", "unit testing", "unit tests", "junit", "espresso", "test automation", "tdd", "mockk", "mockito", "instrumentation test"],
  },
  {
    name: "Performance engineering",
    depth: "working",
    evidence: "Compose compiler metrics run during the migration push, recomposition/stability work; 80% crash reduction at 50k MAU",
    aliases: ["performance", "optimization", "optimisation", "profiling", "memory management", "anr", "jank", "baseline profile", "app startup", "rendering"],
  },
  {
    name: "Modular architecture",
    depth: "working",
    evidence: "Multi-module production codebase at ~960k LOC with feature-level boundaries",
    aliases: ["modular", "modularization", "modularisation", "multi-module", "multi module", "monorepo", "feature module"],
  },
  {
    name: "Team leadership & ownership",
    depth: "working",
    evidence: "Android platform owner at Dice.tech and product owner for the mobile surface",
    aliases: ["mentor", "mentoring", "mentorship", "lead", "leadership", "tech lead", "code review", "code reviews", "ownership", "stakeholder", "cross-functional", "agile", "scrum"],
  },
  {
    name: "AI-assisted development",
    depth: "working",
    evidence: "Agentic workflows in daily production use — Claude Code, Firebender, MCP servers",
    aliases: ["ai tools", "ai-assisted", "copilot", "github copilot", "cursor", "claude", "chatgpt", "llm", "genai", "generative ai", "mcp", "prompt engineering", "ai coding"],
  },
  {
    name: "Java",
    depth: "working",
    evidence: "Legacy Android modules and interop; Kotlin is the primary language",
    aliases: ["java"],
  },
  {
    name: "Flutter / Dart",
    depth: "familiar",
    evidence: "Dart listed among his languages; Android-native is where the depth is",
    aliases: ["flutter", "dart"],
  },
  {
    name: "Web frontend",
    depth: "familiar",
    evidence: "This site — React 19, TanStack Start, Vite, deployed on Vercel Edge",
    aliases: ["react", "typescript", "javascript", "frontend", "front-end", "web development", "next.js", "nextjs", "vue", "angular", "tailwind", "html", "css"],
  },
];

/**
 * Terms a JD may ask for that the stack doesn't cover. Naming them is what lets
 * the offline path report an honest gap instead of a suspiciously clean sheet.
 *
 * This is a vocabulary of general industry technologies, NOT a record of
 * anyone's weaknesses — a term is only ever reported when the pasted JD asks
 * for it, and it says nothing beyond "this JD wanted X".
 */
export const OFF_STACK_TERMS: Record<string, string> = {
  rust: "Rust",
  golang: "Go",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  docker: "Docker",
  terraform: "Terraform",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  "react native": "React Native",
  unity: "Unity",
  "machine learning": "Machine learning",
  "deep learning": "Deep learning",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  kafka: "Kafka",
  microservices: "Microservices",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  elasticsearch: "Elasticsearch",
  python: "Python",
  ruby: "Ruby",
  php: "PHP",
  "c#": "C#",
  ".net": ".NET",
  scala: "Scala",
  elixir: "Elixir",
  "spring boot": "Spring Boot",
  django: "Django",
  "embedded c": "Embedded C",
  webrtc: "WebRTC",
  blockchain: "Blockchain",
  solidity: "Solidity",
};

/**
 * Whole-word, case-insensitive containment.
 *
 * Written by hand rather than with `\b` because the terms include `c#`, `.net`
 * and `ci/cd`, whose edges are not word characters — `\b` places boundaries by
 * character class, so `\bc#\b` cannot match. This checks that the characters
 * adjacent to the hit are not letters/digits, which is the property actually
 * wanted, and it is what stops the two classic false positives in this domain:
 * "Java" matching JavaScript, and "Go" matching every "go-to" in the document.
 */
export function mentions(haystack: string, term: string): boolean {
  const h = haystack.toLowerCase();
  const t = term.toLowerCase();
  let from = 0;
  for (;;) {
    const i = h.indexOf(t, from);
    if (i === -1) return false;
    const before = i === 0 ? "" : h[i - 1];
    const after = i + t.length >= h.length ? "" : h[i + t.length];
    const edge = (c: string) => c === "" || !/[a-z0-9+]/.test(c);
    // "+" is an edge character so "C++" and "Compose + Material" behave, but a
    // trailing "+" must not let "java" match "java+" style run-ons either way.
    if (edge(before) && edge(after)) return true;
    from = i + t.length;
  }
}

/** A line that marks its content as optional rather than required. */
const PREFERRED_LINE = /\b(prefer(?:red|able|ably)?|nice[ -]to[ -]have|desirable|bonus|plus|ideally|good to have|advantage|a plus|would be great)\b/i;

/** A heading that puts the whole section that follows into "optional". */
const PREFERRED_HEADING = /^[\s#*_>\-•\d.)]*(nice[ -]to[ -]have|preferred|desirable|bonus|good to have|pluses)/i;

/**
 * Whether a term is asked for as a hard requirement or a nice-to-have.
 *
 * Reads the line the term is on, plus the section it sits under — "Nice to
 * have" is usually a heading with plain bullets beneath it, so line-level
 * checking alone would score every one of those bullets as mandatory.
 */
function preferenceByLine(text: string): boolean[] {
  const lines = text.split("\n");
  const out: boolean[] = [];
  let sectionPreferred = false;
  for (const line of lines) {
    const t = line.trim();
    const isHeading = t.length > 0 && t.length <= 80 && !/^[-*•]/.test(t);
    if (isHeading) {
      if (PREFERRED_HEADING.test(t)) sectionPreferred = true;
      else if (/^[\s#*_>\-•\d.)]*(requirement|must[ -]have|qualification|responsibilit|what you)/i.test(t)) sectionPreferred = false;
    }
    out.push(sectionPreferred || PREFERRED_LINE.test(line));
  }
  return out;
}

/** Is this term preferred-only everywhere it appears? */
function isPreferred(text: string, term: string): boolean {
  const lines = text.split("\n");
  const prefs = preferenceByLine(text);
  let seen = false;
  let allPreferred = true;
  for (let i = 0; i < lines.length; i++) {
    if (mentions(lines[i], term)) {
      seen = true;
      if (!prefs[i]) allPreferred = false;
    }
  }
  return seen && allPreferred;
}

export interface MatchedSkill {
  skill: Skill;
  /** The alias the JD actually used — worth echoing back verbatim. */
  askedAs: string;
  preferred: boolean;
}

export interface SkillMatchResult {
  matched: MatchedSkill[];
  /**
   * Skills the JD requires outright that he only has shallowly.
   *
   * Split out from `matched` because calling these strengths is how a fit tool
   * loses a recruiter's trust. When a JD hard-requires native iOS and what he
   * has is iOS-via-KMP, the honest rendering is a qualified gap carrying the
   * real evidence — which is independently what the model concluded on the JD
   * this was calibrated against. A *preferred* shallow skill stays in
   * `matched`: having some of a nice-to-have genuinely is a plus.
   */
  partial: MatchedSkill[];
  missing: { term: string; preferred: boolean }[];
  /** 0-100. Only meaningful when the JD named something recognisable. */
  score: number;
  /** How many distinct things the JD asked for that were recognised at all. */
  asked: number;
  role?: string;
}

/**
 * The role title, if the JD leads with one.
 *
 * Only the first few lines are considered: a JD mentions job titles throughout
 * ("reporting to the Engineering Manager", "partner with the Product Lead"),
 * and scanning the whole document reliably picks up the wrong one.
 */
export function extractRole(text: string): string | undefined {
  // Anchored to the START of the line, which is the whole trick. A title line
  // *is* the title; prose merely contains job words. Without the anchor,
  // "You will report to the Engineering Manager and partner with the Product
  // Lead" yields "Lead".
  const TITLE =
    /^(?:job title|role|position)\s*[:-]\s*|^/i;
  // "app" is separate from "application" on purpose — "Senior Mobile App
  // Developer" is a real title this missed, and `application` doesn't match it.
  const SHAPE =
    /^((?:senior|staff|principal|lead|sr\.?|junior|jr\.?|mid[- ]level)\s+)?((?:mobile|android|ios|software|full[ -]?stack|front[- ]?end|back[- ]?end|web|app|application|native)\s+)*(engineer|developer|architect|programmer)\b/i;

  for (const raw of text.split("\n").slice(0, 6)) {
    const t = raw.trim().replace(TITLE, "").trim();
    if (!t || t.length > 100) continue;
    if (!SHAPE.test(t)) continue;
    // Return the line rather than just the matched span, so a trailing
    // qualifier like "(ModalX)" or "— Payments" survives into the card.
    return t.replace(/\s+/g, " ");
  }
  return undefined;
}

/**
 * Score a JD against the stack. Pure, synchronous, no network.
 *
 * The score is share-of-weighted-demand: everything the JD asked for and got,
 * over everything it asked for, with hard requirements counting for roughly
 * three times a nice-to-have and shallower skills contributing less than deep
 * ones. A JD naming nothing recognisable scores 0 with `asked: 0`, which is the
 * caller's signal that there is nothing worth showing rather than a real zero.
 */
export function matchJd(text: string): SkillMatchResult {
  const all: MatchedSkill[] = [];
  for (const skill of SKILLS) {
    const hit = skill.aliases.find((a) => mentions(text, a));
    if (hit) all.push({ skill, askedAs: hit, preferred: isPreferred(text, hit) });
  }
  // Shallow + demanded outright = a qualified gap, not a strength (see `partial`).
  const partial = all.filter((x) => x.skill.depth === "familiar" && !x.preferred);
  const matched = all.filter((x) => !partial.includes(x));

  const missing: { term: string; preferred: boolean }[] = [];
  const seenLabels = new Set<string>();
  for (const [term, label] of Object.entries(OFF_STACK_TERMS)) {
    if (seenLabels.has(label) || !mentions(text, term)) continue;
    seenLabels.add(label);
    missing.push({ term: label, preferred: isPreferred(text, term) });
  }

  const weigh = (preferred: boolean, depth?: Depth) =>
    (preferred ? PREFERRED_WEIGHT : 1) * (depth ? DEPTH_WEIGHT[depth] : 1);

  // Credit earned: full weight for what he has, partial credit for the shallow
  // ones (shipping iOS through KMP is not nothing, it is just not native iOS).
  const earned = [...matched, ...partial].reduce((n, m) => n + weigh(m.preferred, m.skill.depth), 0);

  // Demand: everything asked for at its full asking weight. The shortfall on a
  // shallow skill, and the whole of an unmet term, both land here — which is
  // precisely what pulls the score below raw keyword coverage.
  const demanded =
    [...matched, ...partial].reduce((n, m) => n + weigh(m.preferred), 0) +
    missing.reduce((n, g) => n + weigh(g.preferred), 0);

  const asked = matched.length + partial.length + missing.length;
  const score = demanded > 0 ? Math.round((earned / demanded) * 100) : 0;
  return { matched, partial, missing, score, asked, role: extractRole(text) };
}

/**
 * A match rendered as the same `JdFitReport` the model produces, so it goes
 * through the existing card — the offline path needed no new UI at all.
 *
 * Capped at the card's comfortable size (4 strengths, 3 gaps) and ordered
 * deep-first, so the strongest true things are the ones that survive the cut.
 */
export function toFitReport(m: SkillMatchResult, final = false): JdFitReport {
  const rank: Record<Depth, number> = { deep: 0, working: 1, familiar: 2 };
  const strengths = [...m.matched]
    .sort((a, b) => rank[a.skill.depth] - rank[b.skill.depth] || Number(a.preferred) - Number(b.preferred))
    .slice(0, 4)
    .map((x) => ({ need: x.skill.name, evidence: x.skill.evidence }));

  // Qualified gaps lead: "has some of this" is more useful to a recruiter than
  // "has none of this", and it carries the evidence that makes it checkable.
  const gaps = [
    ...m.partial.map((p) => ({ need: p.skill.name, note: p.skill.evidence })),
    ...[...m.missing]
      .sort((a, b) => Number(a.preferred) - Number(b.preferred))
      .map((g) => ({
        need: g.term,
        note: g.preferred
          ? `Listed as a nice-to-have and not part of his stack.`
          : `Asked for here, and not something he's worked in.`,
      })),
  ].slice(0, 3);

  const unmet = m.partial.length + m.missing.length;
  return {
    score: m.score,
    role: m.role,
    summary:
      `Matched offline against ${m.matched.length} skill${m.matched.length === 1 ? "" : "s"} in his stack` +
      (unmet ? `, with ${unmet} this JD asks for that he doesn't fully cover` : "") +
      // `final` means the model never arrived, so promising it would be a lie.
      (final
        ? `. This is a keyword match rather than a full read — the detailed analysis couldn't be reached just now.`
        : `. This is a keyword match, not a judgement — the full read is on its way.`),
    strengths,
    gaps,
  };
}
