import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

// ponytail: bounded setTimeout poll (~3s), not requestAnimationFrame and not
// a MutationObserver — rAF gets throttled or fully paused on backgrounded/
// non-painting tabs (verified: it can silently stop firing altogether after
// the first call), and the section ids are static markup in App.tsx, so
// once the lazy chunk mounts they're there for good; a bounded poll is
// enough to clear the load race and cheaper than watching the whole DOM.
//
// Single canonical implementation — shared by HashCompat (src/routes/__root.tsx,
// for external/legacy inbound `#hash` links) and useSectionNav below (for
// internal router-native navigation), so the poll behavior can't drift
// between the two callers.
export function scrollToSectionWhenReady(id: string, attemptsLeft = 60) {
  const el = document.getElementById(id);
  if (el) {
    // `instant`, not the default `auto`: index.css sets `html { scroll-behavior:
    // smooth }`, and a smooth scroll started while the rest of the (still
    // hydrating/lazy-loading) home page keeps shifting layout underneath it
    // gets cancelled mid-flight — verified in-browser landing short of the
    // target. Instant is unaffected by later layout shifts.
    el.scrollIntoView({ behavior: "instant", block: "start" });
    return;
  }
  if (attemptsLeft <= 0) return;
  setTimeout(() => scrollToSectionWhenReady(id, attemptsLeft - 1), 50);
}

export type SectionAction = "scroll" | "navigate";

// Pure branch logic, unit-testable without touching the DOM: on the home
// route a section id is already on the page, so we scroll in place;
// anywhere else we have to route home first.
export function resolveSectionAction(pathname: string): SectionAction {
  return pathname === "/" ? "scroll" : "navigate";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shared home-page-section navigation for internal nav surfaces (footer,
 * command palette, ...). From "/" it smooth-scrolls in place; from any other
 * route it navigates home with the section as a `hash` and then scrolls once
 * the (possibly still-loading) home chunk has mounted.
 */
export function useSectionNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const goToSection = useCallback(
    (id: string) => {
      if (resolveSectionAction(pathname) === "scroll") {
        document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        return;
      }
      navigate({ to: "/", hash: id }).then(() => scrollToSectionWhenReady(id));
    },
    [pathname, navigate],
  );

  return { goToSection };
}
