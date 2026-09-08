import { describe, expect, it } from "vitest";
import { matchAnswer, offlineAnswerText } from "./answersMatch.ts";
import { ANSWERS } from "../data/source/answers.ts";

describe("matchAnswer", () => {
  // The acceptance line this proves: "with /api/chat forced to 503 the widget
  // answers >= 10 questions from the generated corpus." Every entry's OWN
  // question is the floor case — if the matcher can't find an answer from its
  // own words, it can't find one from a visitor's paraphrase either.
  it(`matches every one of its own ${ANSWERS.length} questions (>= 10 required)`, () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(10);
    for (const a of ANSWERS) {
      expect(matchAnswer(a.question, ANSWERS)?.id, `question: "${a.question}"`).toBe(a.id);
    }
  });

  it("matches a real paraphrase, not just the exact question", () => {
    expect(matchAnswer("how can I get in touch or email him", ANSWERS)?.id).toBe("availability");
    expect(matchAnswer("tell me about the Doori app", ANSWERS)?.id).toBe("doori");
  });

  it("returns undefined for a query with no real overlap", () => {
    expect(matchAnswer("xyzzy plugh qux", ANSWERS)).toBeUndefined();
  });

  it("returns undefined for an empty query", () => {
    expect(matchAnswer("   ", ANSWERS)).toBeUndefined();
  });
});

describe("offlineAnswerText", () => {
  it("includes the answer text and a link to its anchor", () => {
    const a = ANSWERS[0];
    const text = offlineAnswerText(a);
    expect(text).toContain(a.answer);
    expect(text).toContain(a.anchor);
  });
});
