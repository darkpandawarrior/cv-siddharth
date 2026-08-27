import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedMetric } from "./AnimatedMetric.tsx";

/**
 * THE NUMBER HAS TO BE IN THE MARKUP.
 *
 * This tile used to render `0${suffix}` as its initial text and only reach the
 * real figure through a count-up the IntersectionObserver started. Everything
 * that reads HTML without running it therefore read the opposite of the claim:
 * on 2026-08-28 a plain curl of the live homepage returned the literal text
 * nodes `>0k+<`, `>0%<` and `>0%<`, so an LLM screener, an ATS parser, a
 * crawler and a slow mobile session were all told the platform serves zero
 * monthly active users, and that GPS accuracy and crash reduction were 0%.
 *
 * The animation is unchanged and still counts up from zero. It just zeroes the
 * node itself at effect time rather than shipping the zero in the document.
 *
 * Written with createElement rather than JSX so it stays a .test.ts and needs
 * no change to the vitest include pattern.
 */
const render = (metric: { value: string; label: string }) =>
  renderToStaticMarkup(createElement(AnimatedMetric, { metric }));

describe("AnimatedMetric server markup", () => {
  const cases = [
    { value: "50k+", label: "monthly active users" },
    { value: "95%", label: "GPS accuracy" },
    { value: "80%", label: "crash reduction" },
    { value: "~87%", label: "Compose migration" },
  ];

  it.each(cases)("renders $value, not a zero placeholder", (metric) => {
    expect(render(metric)).toContain(metric.value);
  });

  it("emits no bare zero-value text node", () => {
    const html = cases.map(render).join("");
    // The exact shape the bug produced: >0k+< and >0%< .
    expect(html).not.toMatch(/>0[k%]/);
  });
});
