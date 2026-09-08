import type { Answer } from "../data/source/answers.ts";

/**
 * The FAQPage JSON-LD block for the answer layer — ONE builder, so
 * src/FloatingChat.tsx (renders it) and scripts/check-answers.mjs (validates
 * it) can never disagree about its shape. Pure: no DOM, no router.
 */
export function buildFaqJsonLd(answers: readonly Answer[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: answers.map((a) => ({
      "@type": "Question",
      name: a.question,
      acceptedAnswer: { "@type": "Answer", text: a.answer },
    })),
  };
}

/** `"/project/doori#main-content"` → `{ path: "/project/doori", id: "main-content" }`. */
export function parseAnchor(anchor: string): { path: string; id: string } {
  const [path, id] = anchor.split("#");
  return { path, id };
}
