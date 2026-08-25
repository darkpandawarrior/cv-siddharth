import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { anthologyEntries, unfiledPieces } from "./anthology.ts";
import { storyOf, endsMidSentence, describes } from "../lib/describes.ts";

/**
 * The feed, guarded at the EMITTED XML rather than at the generator.
 *
 * The world council's ruling named exactly one place where the correct defence
 * of #2300's unfinished sentence is code rather than doctrine: "a CI guard that
 * fails the build if any generated excerpt, feed item, or meta tag contains a
 * completed version of that sentence." The threat was never fans. It is every
 * excerpt trimmer and feed builder ever written, each of which either cuts to a
 * sentence boundary or appends an ellipsis.
 *
 * So this reads public/anthology.xml off disk. A test that imported the
 * generator's own logic would agree with the generator by construction, which
 * is the failure this repo has already shipped once: a guard that stayed green
 * against a deliberately reintroduced defect because it was asserting its own
 * copy of the thing it guarded.
 */
const xml = readFileSync(fileURLToPath(new URL("../../public/anthology.xml", import.meta.url)), "utf8");

/** The entries that stop mid-sentence. Derived, never a slug list: #2300 is
 *  filed incomplete on purpose, s3-09 stops on a stray tag, and the corpus is
 *  allowed a third. */
const unfinished = anthologyEntries.filter((e) => endsMidSentence(e.body));

describe("the anthology feed", () => {
  it("carries every piece the site can open", () => {
    const ids = [...xml.matchAll(/<id>[^<]*\/read\/([^<]+)<\/id>/g)].map((m) => m[1]);
    const expected = [...anthologyEntries.map((e) => e.slug), ...unfiledPieces.map((p) => p.slug)];
    expect(new Set(ids)).toEqual(new Set(expected));
    expect(ids.length).toBe(expected.length);
  });

  it("has entries that actually stop mid-sentence, or it proves nothing", () => {
    // Without this, every assertion below passes trivially on a corpus where
    // nothing is at risk.
    expect(unfinished.map((e) => e.slug)).toContain("why-we-measure-time-in-hells");
  });

  it("never finishes a sentence the fiction leaves unfinished", () => {
    for (const e of unfinished) {
      const summary = summaryFor(e.slug);
      expect(summary, `${e.slug} has no feed entry`).toBeTruthy();
      // The last real words of the story, squashed. If the feed carries them,
      // it carried the ending, and whatever follows them in the summary is a
      // completion the fiction never wrote.
      const tail = squash(storyOf(e.body).trim()).slice(-40);
      expect(
        squash(summary!).includes(tail),
        `${e.slug}'s feed summary carries the story's last words, which is how a share card finishes them`,
      ).toBe(false);
    }
  });

  it("publishes only what the shared rule allows", () => {
    // The generator must not have its own opinion. Every summary is either the
    // blurb describes() returned, or site metadata with no blurb at all.
    for (const e of anthologyEntries) {
      const summary = summaryFor(e.slug);
      const allowed = describes(e);
      if (allowed) expect(summary, `${e.slug}`).toContain(allowed);
      else expect(summary, `${e.slug} shipped a summary the rule refused`).not.toMatch(/\.\s+\S/);
    }
  });

  it("is well-formed enough to parse, and escapes what it must", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect((xml.match(/<entry>/g) ?? []).length).toBe((xml.match(/<\/entry>/g) ?? []).length);
    // Raw ampersands are the classic way a feed stops parsing. K'öæluæ and the
    // ligature names make this a live risk rather than a theoretical one.
    const bare = xml.match(/&(?!amp;|lt;|gt;|quot;|#)/g);
    expect(bare, "unescaped ampersand in the feed").toBeNull();
  });
});

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function summaryFor(slug: string): string | null {
  const block = new RegExp(`<entry>(?:(?!</entry>)[\\s\\S])*?/read/${slug}<\\/id>[\\s\\S]*?<\\/entry>`).exec(xml);
  if (!block) return null;
  return /<summary>([\s\S]*?)<\/summary>/.exec(block[0])?.[1] ?? null;
}
