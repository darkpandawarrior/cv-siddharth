// ponytail: no .test.tsx here, see EvidenceChip.test.ts's note. This repo
// tests React logic as plain functions and renderToString, never jsdom.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { WeebGenres } from "./WeebGenres.tsx";
import { weebTitles } from "./data/weebTitles.ts";

describe("WeebGenres", () => {
  it("renders one point per scored, matched title, and no more", () => {
    const html = renderToString(createElement(WeebGenres));
    const circles = html.match(/<circle/g) ?? [];
    expect(circles.length).toBe(weebTitles.length);
  });

  it("plots no title without a crowd score (every weebTitles row has one)", () => {
    expect(weebTitles.every((t) => t.crowd != null && t.mine > 0)).toBe(true);
  });

  it("carries no link to any project, no manufactured edge (REC-5)", () => {
    const html = renderToString(createElement(WeebGenres));
    expect(html).not.toContain("/project/");
  });

  it("renders a legend entry for every genre it plots", () => {
    const html = renderToString(createElement(WeebGenres));
    const genres = new Set(weebTitles.map((t) => t.genres[0] ?? "Unlabelled"));
    for (const g of [...genres].slice(0, 8)) {
      expect(html).toContain(g);
    }
  });
});
