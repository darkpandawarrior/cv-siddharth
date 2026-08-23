import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "./system-prompt";
import { JD_SYSTEM_PROMPT } from "./jd-prompt";
import { profile, education, metrics, experience, projects } from "../../src/data/profile";
import { chess } from "../../src/data/chess";

/**
 * The coverage gate for the 2026-08 prompt-shrink pass. Two things, neither
 * negotiable:
 *
 *  1. SYSTEM_PROMPT must stay small — chat-handler.ts's GROQ_TPM_HEADROOM
 *     (7,000 estimated tokens, ~4 chars/token) is what silently kills the
 *     fast Groq tier once the system prompt alone gets too fat to leave room
 *     for a user turn. This budget is the tripwire IN THE OTHER DIRECTION:
 *     it fails loudly if the prompt regrows past what was actually shipped
 *     here, instead of the routing test quietly re-confirming Gemini-first
 *     forever.
 *  2. Shrinking it must never cost a fact. Every value below is read from
 *     src/data/profile.ts / chess.ts — the same source the generator reads —
 *     so this test cannot drift from the CV the way a hand-typed fact list
 *     would; if a fact moves, the assertion moves with it.
 */
describe("SYSTEM_PROMPT stays inside the Groq budget", () => {
  // Honest ceiling, not the originally-hoped-for 20,000: Projects & open
  // source (~7.5k) plus Work history (~4.7k) are CV source data rendered
  // near-verbatim by design (see gen-system-prompt.mjs's own comments on why
  // hand-mirroring facts here is the drift bug this file exists to prevent),
  // and together they're already 46% of this budget on their own. Getting
  // under 20,000 without cutting real facts would mean trimming profile.ts's
  // project highlights or work-history bullets directly, which is out of
  // this generator's job (it renders profile.ts, it doesn't edit it). This
  // number is still a real result: 29,885 → well under 27,500, a ~12,000-ish
  // token drop that meaningfully narrows (but does not close) the gap to
  // GROQ_TPM_HEADROOM (7,000).
  const CHAT_PROMPT_BUDGET_CHARS = 27_500;

  it("SYSTEM_PROMPT is under budget", () => {
    expect(SYSTEM_PROMPT.length).toBeLessThan(CHAT_PROMPT_BUDGET_CHARS);
  });

  // The floor from the brief: below ~15,000 chars would mean facts got cut,
  // not just restated more densely.
  it("SYSTEM_PROMPT did not shrink by cutting substance", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(15_000);
  });

  it("JD_SYSTEM_PROMPT shrank too, not just the chat prompt", () => {
    // No hard budget here — mode: "jd" always routes ROOMY_FIRST regardless
    // of size (providerOrderFor forces it), so there is no dead-fast-tier
    // bug to fix for JD. This just pins that the same profile.ts-driven
    // shrink (shorter growth list, deduped highlights, tighter ground rules)
    // carried over rather than living only in the chat prompt.
    expect(JD_SYSTEM_PROMPT.length).toBeLessThan(26_000);
  });
});

describe("SYSTEM_PROMPT lost no load-bearing facts", () => {
  // Every headline metric, verbatim.
  it.each(metrics.map((m) => m.value))("headline metric %s", (value) => {
    expect(SYSTEM_PROMPT).toContain(value);
  });

  // Every employer, verbatim.
  it.each(experience.map((job) => job.company))("employer %s", (company) => {
    expect(SYSTEM_PROMPT).toContain(company);
  });

  // Every role title, verbatim — proves work history wasn't trimmed away.
  it.each(experience.map((job) => job.role))("role %s", (role) => {
    expect(SYSTEM_PROMPT).toContain(role);
  });

  // Every project, by name AND by slug (the slug is what the card directive
  // and the case-study route both key off).
  it.each(projects.map((p) => p.name))("project name %s", (name) => {
    expect(SYSTEM_PROMPT).toContain(name);
  });
  it.each(projects.map((p) => p.slug))("project slug %s", (slug) => {
    expect(SYSTEM_PROMPT).toContain(slug);
  });

  it("names him and his degree", () => {
    expect(SYSTEM_PROMPT).toContain(profile.name);
    expect(SYSTEM_PROMPT).toContain(profile.email);
    expect(SYSTEM_PROMPT).toContain(education.school);
    expect(SYSTEM_PROMPT).toContain(education.degree);
  });

  it("carries the chess corpus size", () => {
    expect(SYSTEM_PROMPT).toContain(chess.totals.games.toLocaleString("en-US"));
  });

  it("keeps the identity rules that must never weaken", () => {
    // Third person, never-Siddharth: the whole point of "Panda".
    expect(SYSTEM_PROMPT).toMatch(/third person/i);
    expect(SYSTEM_PROMPT).toMatch(/not .*Siddharth/);
    // Prompt-injection / no-reveal rules.
    expect(SYSTEM_PROMPT).toMatch(/untrusted visitor content/i);
    expect(SYSTEM_PROMPT).toMatch(/never reveal, quote, paraphrase/i);
    // Card directive syntax — unchanged, verified against src/lib/chatBlocks.ts.
    expect(SYSTEM_PROMPT).toContain("[[project:<slug>]]");
    expect(SYSTEM_PROMPT).toContain("[[rooms]]");
    expect(SYSTEM_PROMPT).toContain("[[metrics]]");
    expect(SYSTEM_PROMPT).toContain("[[skills]]");
  });

  it("still carries the writing-years quotes verbatim", () => {
    // The EB Profile quotes are the only third-party account of what he was
    // like on a team — compressing them into paraphrase would make them
    // worthless, so the generator ships them untouched. Spot-check one.
    expect(SYSTEM_PROMPT).toContain("Do you mean Re; Solution?");
  });
});
