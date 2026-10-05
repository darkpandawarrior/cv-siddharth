import { createElement, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "../../world/reducedMotion.ts";
import altitudeStyles from "../../world/altitude.css?url";

/** Keep whitespace intact and expose the unsplit title once to assistive tools. */
export function splitText(text: string, granularity: "word" | "grapheme" = "word", reduced = false): ReactNode {
  if (reduced) return text;
  let index = 0;
  const segments = [...new Intl.Segmenter(undefined, { granularity }).segment(text)];
  return createElement("span", { key: text },
    createElement("link", { rel: "stylesheet", href: altitudeStyles }),
    createElement("span", { className: "sr-only" }, text),
    createElement("span", { "aria-hidden": true }, segments.map(({ segment }, key) =>
      /^\s+$/.test(segment) ? segment : createElement("span", {
        key, className: "motion-segment", style: { "--i": index++ } as CSSProperties,
      }, segment))),
  );
}

export function useSplitText(text: string, granularity: "word" | "grapheme" = "word"): ReactNode {
  return splitText(text, granularity, useReducedMotion());
}
