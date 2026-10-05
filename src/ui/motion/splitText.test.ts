import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { splitText } from "./splitText.ts";
import { getLandmarkEnter, setLandmarkEnter, subscribeLandmarkEnter } from "../../world/v2/dissolve.glsl.ts";

function markup(text: string, mode: "word" | "grapheme", reduced = false) {
  return renderToStaticMarkup(createElement("h1", null, splitText(text, mode, reduced)));
}
function segments(html: string) {
  return [...html.matchAll(/class="motion-segment"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]);
}

describe("splitText", () => {
  it("'संगम' splits into the grapheme clusters ['सं', 'ग', 'म']", () => {
    expect(segments(markup("संगम", "grapheme"))).toEqual(["सं", "ग", "म"]);
  });
  it("splits a Latin sentence into words and keeps spaces intact", () => {
    const html = markup("Build things well", "word");
    expect(segments(html)).toEqual(["Build", "things", "well"]);
    expect(html).toContain('style="--i:2"');
    expect(html).toContain('</span> <span class="motion-segment"');
    expect(html).toContain('<span class="sr-only">Build things well</span>');
    expect(html).toContain('aria-hidden="true"');
  });
  it("returns plain text with no spans under reduced motion", () => {
    expect(splitText("संगम", "grapheme", true)).toBe("संगम");
    expect(markup("Build things well", "word", true)).toBe("<h1>Build things well</h1>");
  });
});

describe("landmark Enter handoff", () => {
  it("falls back without a canvas and keeps only one request until completion", () => {
    const job = { navigate: async () => {} };
    expect(setLandmarkEnter(job)).toBe(false);
    let notifications = 0;
    const unsubscribe = subscribeLandmarkEnter(() => { notifications++; });
    expect(setLandmarkEnter(job)).toBe(true);
    expect(getLandmarkEnter()).toBe(job);
    setLandmarkEnter({ navigate: async () => {} });
    expect(getLandmarkEnter()).toBe(job);
    expect(notifications).toBe(1);
    setLandmarkEnter(null); unsubscribe();
    expect(getLandmarkEnter()).toBe(null);
  });
});
