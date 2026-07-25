import { describe, it, expect } from "vitest";
import { parseChatBlocks } from "./chatBlocks.ts";
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
