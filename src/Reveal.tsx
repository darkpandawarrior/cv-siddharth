import { useEffect, useRef, createElement, type ElementType, type ReactNode } from "react";

/**
 * Fades sections in as they scroll into view; `delay` staggers siblings.
 *
 * Visible is the base state — server markup, no-JS, and the first paint all
 * render the real content. `.reveal` used to be `opacity:0` unconditionally in
 * index.css, so a late or never-firing IntersectionObserver (slow hydration,
 * `entry.isIntersecting` never true because the section was already on screen
 * at threshold 0.1 on a short viewport, a test harness that never fires one)
 * left the section permanently blank. Now the mount effect below is the ONLY
 * thing that can hide it, and only once it has decided the element will
 * actually get un-hidden again — `.reveal-armed` (index.css) carries the
 * opacity:0/translateY with `transition:none`, so arming never itself
 * animates; only the later `.revealed` transition does.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** The root element's tag. Defaults to "div"; StaggerReveal passes "tr" for
   *  a table's rows, since wrapping a <tr> in a <div> would break the table
   *  and get auto-corrected out of the DOM. CSS `transform`/`opacity` apply
   *  to table-row boxes same as any other box, so no special-casing needed
   *  in index.css. */
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion: stay in the base (visible) state and never arm. Arming
    // an element that will never get "revealed" (motion off, so no need to
    // animate it in) is the one-frame version of the same blank-page bug.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("reveal-armed");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // createElement rather than JSX with a variable tag: a union `as` type
  // makes JSX's element-type overload resolution collapse shared props like
  // `children` to `never` (TS2745) — createElement has no such overload set.
  return createElement(
    as,
    { ref, className: `reveal ${className}`, style: delay ? { transitionDelay: `${delay}ms` } : undefined },
    children,
  );
}
