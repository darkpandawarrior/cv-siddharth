import { describe, it, expect } from "vitest";
import { matchJd, mentions, extractRole, toFitReport, SKILLS } from "./skillMatch.ts";
import { parseChatBlocks } from "./chatBlocks.ts";

describe("mentions", () => {
  it("matches whole words only", () => {
    expect(mentions("We use Kotlin daily", "kotlin")).toBe(true);
    expect(mentions("kotlin-first codebase", "kotlin")).toBe(true);
    expect(mentions("Kotlinesque syntax", "kotlin")).toBe(false);
  });

  it("does not let Java match JavaScript", () => {
    // The classic false positive in every naive skill matcher.
    expect(mentions("Strong JavaScript required", "java")).toBe(false);
    expect(mentions("Java and Kotlin", "java")).toBe(true);
  });

  it("handles terms whose edges aren't word characters", () => {
    // `\b` cannot match these at all, which is why mentions() is hand-written.
    expect(mentions("Experience with C# and .NET", "c#")).toBe(true);
    expect(mentions("Own the CI/CD pipeline", "ci/cd")).toBe(true);
    expect(mentions("Deploy with .NET Core", ".net")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(mentions("JETPACK COMPOSE", "jetpack compose")).toBe(true);
  });
});

describe("extractRole", () => {
  it("reads the title off the top of the JD", () => {
    expect(extractRole("Senior Android Engineer\n\nAbout us…")).toMatch(/senior android engineer/i);
  });

  it("ignores job titles buried in the body", () => {
    const jd = "Overview\n" + "x".repeat(50) + "\n\nYou will report to the Engineering Manager and partner with the Product Lead.";
    // Nothing title-shaped in the first lines → better to say nothing than guess.
    expect(extractRole(jd)).toBeUndefined();
  });
});

describe("matchJd", () => {
  const ANDROID_JD = `
Senior Android Engineer

Requirements
- 5+ years of Kotlin and native Android development
- Deep Jetpack Compose experience
- Coroutines and Flow
- Room persistence and Retrofit networking
- Hilt dependency injection

Nice to have
- Kotlin Multiplatform
- Kubernetes
`.trim();

  it("finds the skills a matching JD asks for", () => {
    const m = matchJd(ANDROID_JD);
    const names = m.matched.map((x) => x.skill.name);
    expect(names).toContain("Kotlin");
    expect(names).toContain("Jetpack Compose");
    expect(names).toContain("Coroutines & Flow");
    expect(names).toContain("Room / SQLite");
    expect(names).toContain("Dependency injection (Hilt/Dagger)");
  });

  it("scores a well-matched Android role high", () => {
    expect(matchJd(ANDROID_JD).score).toBeGreaterThan(70);
  });

  it("names what the JD wants that isn't in the stack", () => {
    expect(matchJd(ANDROID_JD).missing.map((g) => g.term)).toContain("Kubernetes");
  });

  it("treats a nice-to-have section as optional, not mandatory", () => {
    const m = matchJd(ANDROID_JD);
    expect(m.missing.find((g) => g.term === "Kubernetes")?.preferred).toBe(true);
    expect(m.matched.find((x) => x.skill.name === "Kotlin Multiplatform")?.preferred).toBe(true);
    // …while a hard requirement is not marked optional.
    expect(m.matched.find((x) => x.skill.name === "Kotlin")?.preferred).toBe(false);
  });

  it("scores a genuinely mismatched role low", () => {
    const backend = `
Staff Backend Engineer

Requirements
- 8+ years of Rust and Go
- Kubernetes cluster administration
- PostgreSQL and Kafka at scale
- Terraform and AWS
`.trim();
    const m = matchJd(backend);
    expect(m.score).toBeLessThan(30);
    expect(m.missing.length).toBeGreaterThanOrEqual(4);
  });

  it("reports asked:0 for text that names nothing recognisable", () => {
    // The caller's signal to show nothing rather than a misleading zero.
    const m = matchJd("We are looking for a wonderful person to join our lovely team.");
    expect(m.asked).toBe(0);
    expect(m.score).toBe(0);
  });

  it("calls a hard-required shallow skill a gap, not a strength", () => {
    // The accuracy fix that matters most: term-matching would happily credit
    // "iOS" to someone who only ships it through KMP, and a fit tool that
    // flatters is worse than no fit tool.
    const jd = "Senior Mobile Engineer\n\nRequirements\n- Kotlin and Jetpack Compose\n- Native iOS development in Swift and SwiftUI";
    const m = matchJd(jd);
    expect(m.partial.map((p) => p.skill.name)).toContain("iOS (via Compose Multiplatform)");
    expect(m.matched.map((x) => x.skill.name)).not.toContain("iOS (via Compose Multiplatform)");
    // …and it surfaces in the card as a gap carrying the honest evidence.
    const r = toFitReport(m);
    const ios = r.gaps.find((g) => /iOS/.test(g.need));
    expect(ios?.note).toMatch(/not a native/i);
  });

  it("keeps a shallow skill as a strength when it's only a nice-to-have", () => {
    const jd = "Senior Android Engineer\n\nRequirements\n- Kotlin\n\nNice to have\n- Some iOS exposure";
    const m = matchJd(jd);
    expect(m.matched.map((x) => x.skill.name)).toContain("iOS (via Compose Multiplatform)");
    expect(m.partial).toHaveLength(0);
  });

  it("never scores above a matching role when pillars are missing", () => {
    const androidOnly = matchJd("Senior Android Engineer\n\nRequirements\n- Kotlin, Jetpack Compose, Coroutines, Room, Hilt");
    const androidPlusUncovered = matchJd(
      "Senior Engineer\n\nRequirements\n- Kotlin, Jetpack Compose, Coroutines, Room, Hilt\n- Native iOS in Swift\n- Rust and Kubernetes",
    );
    expect(androidPlusUncovered.score).toBeLessThan(androidOnly.score);
  });

  it("is not fooled by a JD that only mentions skills to say they're unnecessary", () => {
    // Honest limitation, asserted so it stays known: this is a keyword matcher
    // and does not read negation. The model is what handles nuance.
    const m = matchJd("Requirements\n- No Kotlin experience needed, we will train you");
    expect(m.matched.map((x) => x.skill.name)).toContain("Kotlin");
  });
});

describe("toFitReport", () => {
  const JD = `
Senior Android Engineer

Requirements
- Kotlin, Jetpack Compose, Coroutines, Room, Hilt, Retrofit
- Android SDK and WorkManager
- Rust and Kubernetes
`.trim();

  it("produces a card the existing renderer can display", () => {
    const r = toFitReport(matchJd(JD));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(r.strengths)).toBe(true);
    expect(Array.isArray(r.gaps)).toBe(true);
  });

  it("respects the card's row budget", () => {
    const r = toFitReport(matchJd(JD));
    expect(r.strengths.length).toBeLessThanOrEqual(4);
    expect(r.gaps.length).toBeLessThanOrEqual(3);
  });

  it("leads with the deepest skills when it has to cut", () => {
    const r = toFitReport(matchJd(JD));
    // Every surviving strength carries real evidence, not a bare label.
    for (const s of r.strengths) expect(s.evidence.length).toBeGreaterThan(20);
  });

  it("says plainly that it is a keyword match, not a judgement", () => {
    expect(toFitReport(matchJd(JD)).summary).toMatch(/keyword match/i);
  });
});

/* ── The round trip that actually ships ────────────────────────────────────
 * FloatingChat renders the offline card by emitting `[[jdfit:{…}]]` into the
 * assistant bubble, exactly as the model would. If anything in a generated
 * payload breaks the directive parser, the card renders as NOTHING — which is
 * the precise failure this whole feature exists to prevent, reintroduced from
 * the other end. So the emitted string is parsed back here, through the real
 * parser, on JDs chosen to carry the characters that would break it. */
describe("the emitted directive survives the real parser", () => {
  const emit = (jd: string) => `[[jdfit:${JSON.stringify(toFitReport(matchJd(jd)))}]]`;

  const HOSTILE = `
Senior Android Engineer — "Platform" Team (50% travel)
Requirements
- Kotlin, Jetpack Compose, Room, Hilt
- Experience with C#, .NET and CI/CD
- Comfort with JSON payloads like {"a": [1,2]} and regex \\d+
- Must handle 100% of edge cases — "no excuses", said the CTO
- Rust and Kubernetes
`.trim();

  it("parses back into a jdfit widget with usable data", () => {
    const blocks = parseChatBlocks(emit(HOSTILE), true);
    const card = blocks.find((b) => b.kind === "widget" && b.name === "jdfit");
    expect(card, "the directive did not parse into a jdfit widget").toBeDefined();
    expect(card && "data" in card ? card.data : undefined).toBeTruthy();
  });

  it("leaks no raw directive syntax or JSON into the visible text", () => {
    const blocks = parseChatBlocks(emit(HOSTILE), true);
    const visible = blocks.filter((b) => b.kind === "text").map((b) => (b.kind === "text" ? b.text : "")).join("");
    expect(visible).not.toContain("[[");
    expect(visible).not.toContain('"score"');
  });

  it("round-trips the score, role and rows unchanged", () => {
    const source = toFitReport(matchJd(HOSTILE));
    const blocks = parseChatBlocks(emit(HOSTILE), true);
    const card = blocks.find((b) => b.kind === "widget" && b.name === "jdfit");
    const data = card && "data" in card ? card.data : undefined;
    expect(data?.score).toBe(source.score);
    expect(data?.role).toBe(source.role);
    expect(data?.strengths.length).toBe(source.strengths.length);
    expect(data?.gaps.length).toBe(source.gaps.length);
  });

  it("holds for a JD with quotes and braces in the role line itself", () => {
    const jd = 'Senior Mobile App Developer (ModalX) — "the {best} role"\n\nRequirements\n- Kotlin and Jetpack Compose\n- Rust';
    const blocks = parseChatBlocks(emit(jd), true);
    const card = blocks.find((b) => b.kind === "widget" && b.name === "jdfit");
    expect(card && "data" in card ? card.data : undefined).toBeTruthy();
  });
});

describe("the skill table itself", () => {
  it("has no duplicate aliases across skills", () => {
    // A duplicate would make the match order-dependent and the score unstable.
    const seen = new Map<string, string>();
    for (const s of SKILLS) {
      for (const a of s.aliases) {
        expect(seen.has(a), `"${a}" is claimed by both ${seen.get(a)} and ${s.name}`).toBe(false);
        seen.set(a, s.name);
      }
    }
  });

  it("gives every skill evidence specific enough to defend", () => {
    for (const s of SKILLS) expect(s.evidence.length, s.name).toBeGreaterThan(20);
  });
});
