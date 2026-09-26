// ponytail: this file is named `.test.tsx` (not `.test.ts`) because the
// lane's owns list names it that way, but vitest.config.ts's `include` is
// `src/**/*.test.ts` only (src/FaqDock.test.tsx hit the same gap first),
// so `npx vitest run` collects ZERO tests from this file today. That include
// glob is owned by a wire lane, not this one (G2), so it can't be widened
// from here. The tests below are real and pass, verified with
// `npx vitest run --config <(node -e '...') src/labs/GuardLab.test.tsx`
// forcing an include override, but until a wire lane adds `*.test.tsx` this
// file is dead to the normal test run. Flagged in the lane's handoff notes;
// not silently worked around by renaming away from what `owns` specifies.
//
// No DOM/testing-library is set up either (vitest.config.ts runs
// environment: "node"), so this exercises GuardLab the same way
// FaqDock.test.tsx exercises FaqDock: renderToString (an SSR render needs no
// DOM) plus a fetch spy, rather than simulating a user typing into the
// textarea.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { GuardLab } from "./GuardLab.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuardLab", () => {
  it("renders the default payload's forged close marker stripped, not literal", () => {
    const html = renderToString(createElement(GuardLab));
    // The demo payload embeds a real close marker literal, planted mid-text
    // to forge an early boundary. The "what the model receives" preview
    // (the <pre> block, guard()'s output) is the fenced payload the model
    // would actually see, and that is what must show the forgery
    // neutralised, not the literal marker repeated where the payload sits.
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    expect(preMatch).not.toBeNull();
    const preview = preMatch![1];
    // The reassertion sentence AFTER the real close legitimately names the
    // marker in server-authored text ("Everything between <<<...>>> and
    // <<<...>>> above is..."). The fenced SPAN before it is the part that
    // must show the forgery neutralised, not the reassertion.
    const fencedSpan = preview.slice(0, preview.indexOf("Everything between"));
    expect(fencedSpan).toContain("fence marker removed");
    // Exactly one close fence survives in that span: the real one this
    // module appends at the end, not the forged one the payload planted.
    const closesInSpan = (fencedSpan.match(/&lt;&lt;&lt;PASTED_TEXT_END&gt;&gt;&gt;/g) ?? []).length;
    expect(closesInSpan).toBe(1);
  });

  it("never calls fetch while rendering, and never imports it into the module", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderToString(createElement(GuardLab));
    expect(fetchSpy).not.toHaveBeenCalled();

    const source = (await import("node:fs")).readFileSync(new URL("./GuardLab.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("renderToString output is identical across two renders (deterministic default state)", () => {
    const a = renderToString(createElement(GuardLab));
    const b = renderToString(createElement(GuardLab));
    expect(a).toBe(b);
  });
});
