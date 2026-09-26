// ponytail: this file is named `.test.tsx` (not `.test.ts`) because the
// lane's owns list names it that way — but vitest.config.ts's `include` is
// `src/**/*.test.ts` only, and no `.test.tsx` file exists anywhere else in
// this repo, so `npx vitest run` (and `npm test`) collect ZERO tests from
// this file today. That include glob is owned by a wire lane, not SP-01
// (G2), so it can't be widened from here. The tests below are real and
// pass — verified with `npx vitest run --config <(...)  src/FaqDock.test.tsx`
// forcing an include override — but until a wire lane adds `*.test.tsx` to
// vitest.config.ts's `include`, this file is dead to the normal test run.
// Flagged in the lane's handoff notes; not silently worked around by
// renaming away from what `owns` specifies.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/project/doori",
}));

const { FaqDock, rankAnswers } = await import("./FaqDock.tsx");
const { ANSWERS } = await import("./data/source/answers.ts");
const { parseAnchor } = await import("./lib/faqJsonLd.ts");

describe("rankAnswers", () => {
  it("puts the answer whose citation anchor matches the current route first", () => {
    const ranked = rankAnswers("/project/doori", ANSWERS);
    expect(parseAnchor(ranked[0].anchor).path).toBe("/project/doori");
  });

  it("keeps ANSWERS's own order for every route with no exact-matching citation", () => {
    // No answer cites "/lanes" — the sort has nothing to promote, so the
    // output must equal the input order exactly (stability, not chance).
    const ranked = rankAnswers("/lanes", ANSWERS);
    expect(ranked.map((a) => a.id)).toEqual(ANSWERS.map((a) => a.id));
  });

  it("is a stable sort: ties (same route, several matches) keep ANSWERS's order", () => {
    // Several answers cite "/#work" and "/" — every route-"/" citation ties,
    // and a stable sort must not reorder ties.
    const homeAnswers = ANSWERS.filter((a) => parseAnchor(a.anchor).path === "/");
    expect(homeAnswers.length).toBeGreaterThan(1); // the tie this test needs actually exists
    const ranked = rankAnswers("/", ANSWERS);
    const rankedHomeIds = ranked.filter((a) => parseAnchor(a.anchor).path === "/").map((a) => a.id);
    expect(rankedHomeIds).toEqual(homeAnswers.map((a) => a.id));
  });

  it("never drops or duplicates an answer", () => {
    const ranked = rankAnswers("/project/doori", ANSWERS);
    expect(ranked).toHaveLength(ANSWERS.length);
    expect(new Set(ranked.map((a) => a.id)).size).toBe(ANSWERS.length);
  });
});

describe("FaqDock SSR determinism", () => {
  it("renderToString output is identical across two renders (jsonLd off)", () => {
    const a = renderToString(createElement(FaqDock, {}));
    const b = renderToString(createElement(FaqDock, {}));
    expect(a).toBe(b);
  });

  it("renderToString output is identical across two renders (jsonLd on)", () => {
    const a = renderToString(createElement(FaqDock, { jsonLd: true }));
    const b = renderToString(createElement(FaqDock, { jsonLd: true }));
    expect(a).toBe(b);
  });

  it("renders every question in the server HTML (SSR-crawlable, no JS needed)", () => {
    const html = renderToString(createElement(FaqDock, {}));
    // React escapes text nodes, so a question with an apostrophe ("What's he
    // like...") lands as `&#x27;` in the markup — match what actually ships.
    for (const a of ANSWERS) expect(html).toContain(a.question.replace(/'/g, "&#x27;"));
  });

  it("jsonLd=false (every route but /) emits no FAQPage block", () => {
    const html = renderToString(createElement(FaqDock, { jsonLd: false }));
    expect(html).not.toContain("FAQPage");
  });

  it("jsonLd=true (/ only) emits exactly one FAQPage block, matching ANSWERS", () => {
    const html = renderToString(createElement(FaqDock, { jsonLd: true }));
    expect(html.match(/FAQPage/g)).toHaveLength(1);
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
  });
});
