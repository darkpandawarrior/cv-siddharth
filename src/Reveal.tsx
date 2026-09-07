import { useEffect, useRef } from "react";

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
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
