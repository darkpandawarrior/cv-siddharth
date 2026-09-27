import type { ReactNode } from "react";
import { Reveal } from "./Reveal.tsx";

/**
 * Index-aware reveal-in for a list of siblings.
 *
 * The exact same hand-rolled idiom — wrap in `Reveal`, then
 * `style={{ transitionDelay: `${(i % N) * offset}ms` }}` on each child — was
 * copy-pasted with slightly different N/offset across ProjectDetail.tsx,
 * WritingView.tsx, anthology.tsx, canon.tsx, making.tsx, ReposShowcase.tsx.
 * This formalizes it once. Reuses Reveal.tsx verbatim (its reveal-armed/
 * revealed CSS states, its own prefers-reduced-motion early-return) — zero
 * new CSS, zero new motion mechanism.
 *
 * `cap` re-uses the same delay for every Nth item onward, so a long list
 * doesn't end up with a multi-second tail before its last row appears.
 */
export function StaggerReveal({
  children,
  step = 80,
  cap = 6,
  as,
  className,
}: {
  children: ReactNode[];
  step?: number;
  cap?: number;
  /** Passed through to Reveal — "tr" for table rows, "li" for a <ul>/<ol>
   *  whose children must stay <li>, default "div" otherwise. */
  as?: "div" | "tr" | "li";
  className?: string;
}) {
  return (
    <>
      {children.map((c, i) => (
        <Reveal key={i} delay={(i % cap) * step} as={as} className={className}>
          {c}
        </Reveal>
      ))}
    </>
  );
}
