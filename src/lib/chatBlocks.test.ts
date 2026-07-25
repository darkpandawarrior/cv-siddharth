import { describe, it, expect } from "vitest";
import { parseChatBlocks, parseJdFit, plainText, speakableText } from "./chatBlocks.ts";
import { projects, projectBySlug } from "../data/profile.ts";

describe("parseChatBlocks", () => {
  it("returns a single text block for plain prose", () => {
    expect(parseChatBlocks("Hi, I'm **Sid**.")).toEqual([{ kind: "text", text: "Hi, I'm **Sid**." }]);
  });

  it("returns nothing for empty or whitespace-only content", () => {
    expect(parseChatBlocks("")).toEqual([]);
    expect(parseChatBlocks("\n\n  ")).toEqual([]);
  });

  it("splits a directive on its own line out of the surrounding text", () => {
    expect(parseChatBlocks("Here it is:\n\n[[project:mileway]]\n\nWant the architecture?")).toEqual([
      { kind: "text", text: "Here it is:" },
      { kind: "widget", name: "project", arg: "mileway" },
      { kind: "text", text: "Want the architecture?" },
    ]);
  });

  it("parses argument-less directives", () => {
    expect(parseChatBlocks("Plenty:\n\n[[rooms]]")).toEqual([
      { kind: "text", text: "Plenty:" },
      { kind: "widget", name: "rooms", arg: undefined },
    ]);
  });

  it("parses several directives in one reply", () => {
    const blocks = parseChatBlocks("Numbers:\n\n[[metrics]]\n\nStack:\n\n[[skills]]");
    expect(blocks.map((b) => (b.kind === "widget" ? b.name : "text"))).toEqual(["text", "metrics", "text", "skills"]);
  });

  it("handles back-to-back directives with no prose between them", () => {
    expect(parseChatBlocks("[[project:kursi]]\n[[project:mileway]]")).toEqual([
      { kind: "widget", name: "project", arg: "kursi" },
      { kind: "widget", name: "project", arg: "mileway" },
    ]);
  });

  it("lower-cases the name and arg so casing from the model can't break lookups", () => {
    expect(parseChatBlocks("[[Project:MileWay]]")).toEqual([{ kind: "widget", name: "project", arg: "mileway" }]);
  });

  it("passes unknown names through — validation belongs to the renderer", () => {
    expect(parseChatBlocks("[[nope:whatever]]")).toEqual([{ kind: "widget", name: "nope", arg: "whatever" }]);
  });

  it("parses a directive inline inside a sentence", () => {
    expect(parseChatBlocks("See [[project:kursi]] for the engine.")).toEqual([
      { kind: "text", text: "See" },
      { kind: "widget", name: "project", arg: "kursi" },
      { kind: "text", text: "for the engine." },
    ]);
  });

  // ── The streaming rule: a half-arrived directive must never be shown ──────
  describe("partial streams", () => {
    for (const tail of ["[[", "[[p", "[[proj", "[[project", "[[project:", "[[project:mile", "[[project:mileway", "[[project:mileway]"]) {
      it(`hides the unterminated tail ${JSON.stringify(tail)} while keeping the text before it`, () => {
        expect(parseChatBlocks(`Here it is:\n\n${tail}`)).toEqual([{ kind: "text", text: "Here it is:" }]);
      });
    }

    it("hides a half-streamed directive that follows a completed one", () => {
      expect(parseChatBlocks("[[rooms]]\n\nand also\n\n[[project:mile")).toEqual([
        { kind: "widget", name: "rooms", arg: undefined },
        { kind: "text", text: "and also" },
      ]);
    });

    it("renders the widget as soon as the closing brackets arrive", () => {
      expect(parseChatBlocks("Here it is:\n\n[[project:mileway]]")).toEqual([
        { kind: "text", text: "Here it is:" },
        { kind: "widget", name: "project", arg: "mileway" },
      ]);
    });

    it("holds back a lone trailing bracket — a provider can chunk between the two", () => {
      expect(parseChatBlocks("Here it is:\n\n[")).toEqual([{ kind: "text", text: "Here it is:" }]);
    });

    it("only holds the bracket back while it is the last character", () => {
      expect(parseChatBlocks("arr[0] is fine")).toEqual([{ kind: "text", text: "arr[0] is fine" }]);
    });

    it("keeps prose that merely contains a double bracket (it would never close)", () => {
      expect(parseChatBlocks("An array of arrays looks like [[ 1, 2 ]")).toEqual([
        { kind: "text", text: "An array of arrays looks like [[ 1, 2 ]" },
      ]);
    });

    it("never leaks a bracket at any point of a character-by-character stream", () => {
      const full = "Mileway is the one:\n\n[[project:mileway]]\n\nAnd the rooms:\n\n[[rooms]]\n\nAsk away.";
      for (let i = 0; i <= full.length; i++) {
        const blocks = parseChatBlocks(full.slice(0, i));
        for (const b of blocks) {
          if (b.kind === "text") expect(b.text, `leaked at prefix length ${i}`).not.toMatch(/\[\[|\]\]/);
        }
      }
      // …and the finished stream still yields both widgets.
      expect(parseChatBlocks(full).filter((b) => b.kind === "widget")).toHaveLength(2);
    });
  });
});

/* ── The JD fit scorecard: the one directive that carries a JSON payload ──── */

const REPORT = {
  score: 78,
  role: "Senior Android Engineer",
  summary: "Strong on Compose and platform ownership; no production KMP.",
  strengths: [{ need: "Compose at scale", evidence: "92% of a 738k-LOC app", project: "mileway" }],
  gaps: [{ need: "10+ years", note: "5+ years of Android, not 10." }],
};
const directive = (payload: unknown) => `[[jdfit:${JSON.stringify(payload)}]]`;

describe("parseChatBlocks — jdfit payloads", () => {
  it("parses a complete payload into a widget block carrying the report", () => {
    expect(parseChatBlocks(`Here's the read:\n\n${directive(REPORT)}`)).toEqual([
      { kind: "text", text: "Here's the read:" },
      { kind: "widget", name: "jdfit", data: REPORT },
    ]);
  });

  it("keeps parsing the reply after a payload closes", () => {
    const blocks = parseChatBlocks(`${directive(REPORT)}\n\nWant the case study?\n\n[[project:mileway]]`);
    expect(blocks.map((b) => (b.kind === "widget" ? b.name : b.text))).toEqual([
      "jdfit",
      "Want the case study?",
      "project",
    ]);
  });

  it('does not end the directive at a "]]" inside a payload string', () => {
    const tricky = { ...REPORT, summary: "The JD used [[brackets]] oddly." };
    expect(parseChatBlocks(directive(tricky))).toEqual([{ kind: "widget", name: "jdfit", data: tricky }]);
  });

  it("renders nothing (and never throws) for a malformed payload", () => {
    for (const raw of [
      '[[jdfit:{"score":78,}]]', // trailing comma
      "[[jdfit:{score: 78}]]", // unquoted key
      "[[jdfit:{}]]", // no score, no summary
      '[[jdfit:{"score":"78","summary":"x"}]]', // score as a string
      '[[jdfit:{"score":78}]]', // no summary
      '[[jdfit:{"summary":"x"}]]', // no score
      '[[jdfit:{"score":null,"summary":"x"}]]',
    ]) {
      expect(parseChatBlocks(raw), raw).toEqual([]);
      expect(parseChatBlocks(`Before.\n\n${raw}\n\nAfter.`), raw).toEqual([
        { kind: "text", text: "Before." },
        { kind: "text", text: "After." },
      ]);
    }
  });

  it("never leaks raw JSON at any point of a character-by-character stream", () => {
    const full = `Honest read:\n\n${directive(REPORT)}\n\nHappy to go deeper.`;
    for (let i = 0; i <= full.length; i++) {
      for (const b of parseChatBlocks(full.slice(0, i))) {
        if (b.kind === "text") {
          expect(b.text, `leaked at prefix length ${i}`).not.toMatch(/\[\[|\]\]|[{}]|"score"/);
        } else {
          // A widget only ever appears once its payload is complete and valid.
          expect(b.data, `partial data at prefix length ${i}`).toEqual(REPORT);
        }
      }
    }
    expect(parseChatBlocks(full).filter((b) => b.kind === "widget")).toHaveLength(1);
  });

  it("hides the text after an opener that never closes", () => {
    // A payload the model abandoned mid-object: nothing after it is renderable,
    // and the tail must not fall out as prose.
    expect(parseChatBlocks('Read:\n\n[[jdfit:{"score":78,"summary":"oops')).toEqual([
      { kind: "text", text: "Read:" },
    ]);
  });
});

describe("parseJdFit", () => {
  const base = JSON.stringify({ score: 50, summary: "ok" });

  it("clamps and rounds the score instead of trusting it", () => {
    expect(parseJdFit(JSON.stringify({ score: 140, summary: "x" }))?.score).toBe(100);
    expect(parseJdFit(JSON.stringify({ score: -20, summary: "x" }))?.score).toBe(0);
    expect(parseJdFit(JSON.stringify({ score: 78.6, summary: "x" }))?.score).toBe(79);
    expect(parseJdFit(JSON.stringify({ score: Infinity, summary: "x" }))).toBeNull();
  });

  it("rejects payloads that aren't an object", () => {
    for (const raw of ["[1,2]", '"a string"', "42", "null", "", "   "]) {
      expect(parseJdFit(raw), raw).toBeNull();
    }
  });

  it("truncates over-long strings and caps the row count", () => {
    const parsed = parseJdFit(
      JSON.stringify({
        score: 50,
        summary: "s".repeat(900),
        role: "r".repeat(900),
        strengths: Array.from({ length: 20 }, () => ({ need: "n".repeat(900), evidence: "e" })),
        gaps: Array.from({ length: 20 }, () => ({ need: "n", note: "x" })),
      }),
    )!;
    expect(parsed.summary).toHaveLength(400);
    expect(parsed.role).toHaveLength(120);
    expect(parsed.strengths).toHaveLength(6);
    expect(parsed.gaps).toHaveLength(6);
    expect(parsed.strengths[0].need).toHaveLength(240);
  });

  it("drops rows that are the wrong shape rather than failing the whole card", () => {
    const parsed = parseJdFit(
      JSON.stringify({
        score: 50,
        summary: "ok",
        strengths: [{ need: "a", evidence: "b" }, { need: "no evidence" }, "nope", null, 7],
        gaps: [{ need: "a", note: "" }, { need: "b", note: "c" }],
      }),
    )!;
    expect(parsed.strengths).toEqual([{ need: "a", evidence: "b", project: undefined }]);
    expect(parsed.gaps).toEqual([{ need: "b", note: "c" }]);
  });

  it("defaults missing rows to empty arrays", () => {
    expect(parseJdFit(base)).toEqual({
      score: 50,
      role: undefined,
      summary: "ok",
      strengths: [],
      gaps: [],
    });
  });

  it("lower-cases the project slug so an invented one just misses", () => {
    const parsed = parseJdFit(
      JSON.stringify({ score: 50, summary: "ok", strengths: [{ need: "a", evidence: "b", project: "MileWay" }] }),
    )!;
    expect(parsed.strengths[0].project).toBe("mileway");
    expect(projectBySlug(parsed.strengths[0].project!)?.slug).toBe("mileway");

    for (const project of ["../../etc/passwd", "https://evil.com", "not-a-project"]) {
      const bad = parseJdFit(JSON.stringify({ score: 50, summary: "ok", strengths: [{ need: "a", evidence: "b", project }] }))!;
      expect(projectBySlug(bad.strengths[0].project!), project).toBeUndefined();
    }
  });
});

/**
 * The directive surface is attacker-adjacent: a visitor can steer what the
 * model writes, so anything a directive can reach has to be inert on its own.
 *
 * The other half of that guarantee is structural rather than testable here:
 * directives are parsed ONLY from assistant content. Both surfaces render a
 * user turn as plain text — `{m.content}` in src/FloatingChat.tsx and the
 * echoed `“{question}”` in src/Terminal.tsx's AskBlock — so a visitor typing
 * `[[rooms]]` sees those eight characters back, not a rendered grid.
 */
describe("widget-directive safety", () => {
  it("resolves a project directive only against real slugs", () => {
    expect(projectBySlug("mileway")?.slug).toBe("mileway");
    for (const injected of [
      "evil",
      "mileway-evil",
      "../../etc/passwd",
      "https://evil.com",
      "mileway ",
      "MILEWAY", // the parser lowercases; a raw lookup must still not match
      "",
    ]) {
      expect(projectBySlug(injected), injected).toBeUndefined();
    }
  });

  it("hands the renderer a lowercased slug that a hallucinated arg can't fake", () => {
    const [block] = parseChatBlocks("[[project:NotAProject]]");
    expect(block).toEqual({ kind: "widget", name: "project", arg: "notaproject" });
    expect(projectBySlug((block as { arg: string }).arg)).toBeUndefined();
  });

  it("parses every real slug back to its project (the happy path still works)", () => {
    for (const p of projects) {
      const [block] = parseChatBlocks(`[[project:${p.slug}]]`);
      expect(block).toEqual({ kind: "widget", name: "project", arg: p.slug });
      expect(projectBySlug(p.slug)).toBe(p);
    }
  });
});

// What the reader actually says out loud. Two bugs live here: speaking the
// widget directives ("bracket bracket project colon mileway"), and speaking
// markdown punctuation ("star star ninety-two percent star star").
describe("speakableText", () => {
  it("drops the widget directives entirely", () => {
    expect(speakableText("Mileway is offline-first.\n\n[[project:mileway]]\n\nWant the case study?")).toBe(
      "Mileway is offline-first. Want the case study?",
    );
    expect(speakableText("Every room on this site:\n\n[[rooms]]")).toBe("Every room on this site:");
  });

  it("still speaks the fit scorecard — it IS the answer, not navigation", () => {
    const spoken = speakableText(
      'Here is the read.\n\n[[jdfit:{"score":74,"role":"Android Lead","summary":"Strong core match.","strengths":[{"need":"Kotlin","evidence":"738k LOC"}],"gaps":[{"need":"8+ years","note":"I have 5+"}]}]]',
    );
    expect(spoken).toContain("Fit: 74/100");
    expect(spoken).toContain("Strong core match.");
    expect(spoken).not.toContain("[[");
  });

  it("strips markdown emphasis, headings, quotes, rules and list markers", () => {
    expect(speakableText("**92%** of a _738k_ LOC app")).toBe("92% of a 738k LOC app");
    expect(speakableText("## Results\n\n- 80% crash reduction\n- 95% GPS accuracy")).toBe(
      "Results 80% crash reduction 95% GPS accuracy",
    );
    expect(speakableText("> He shipped it.\n\n---\n\n1. First\n2. Second")).toBe("He shipped it. First Second");
    expect(speakableText("~~old~~ new")).toBe("old new");
  });

  it("speaks a link's words, never its href", () => {
    const spoken = speakableText("Try [The Lab Bench](/lab) or [my résumé](/resume).");
    expect(spoken).toBe("Try The Lab Bench or my résumé.");
    expect(spoken).not.toContain("/lab");
  });

  it("unwraps inline code but drops a fenced block — nobody wants Kotlin read aloud", () => {
    expect(speakableText("Type `/jd` to start.")).toBe("Type /jd to start.");
    expect(speakableText("Like this:\n\n```kotlin\nval x = 1\n```\n\nThat's it.")).toBe("Like this: That's it.");
    // A block still streaming has no closing fence yet — hide it anyway.
    expect(speakableText("Like this:\n\n```kotlin\nval x =")).toBe("Like this:");
  });

  it("leaves ordinary prose (and its punctuation) alone", () => {
    const prose = "I cut crashes 80% at Dice.tech — 50k+ MAU, 22k DAU. Want the numbers?";
    expect(speakableText(prose)).toBe(prose);
  });

  it("is the copy text, minus the markdown — one source, two outputs", () => {
    const reply = "**Mileway** is offline-first.\n\n[[project:mileway]]";
    expect(plainText(reply)).toBe("**Mileway** is offline-first.");
    expect(speakableText(reply)).toBe("Mileway is offline-first.");
  });
});
