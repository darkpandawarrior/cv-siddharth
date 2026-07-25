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

// Home-page section ids — mirrors __root.tsx's SECTION_ANCHORS (that copy
// guards *inbound* legacy `#hash` links; this one classifies *outbound*
// internal targets so render sites can pick goToSection vs <Link>). Kept as
// a separate small constant rather than importing from the route file, so
// this module has no dependency on __root.tsx's HashCompat safety net.
// Exported so scripts/gen-system-prompt.mjs derives the assistant's list of
// linkable home sections from here instead of hand-mirroring it (this file's
// generator warns that hand-mirroring is how a past drift bug happened).
export const SECTION_IDS = new Set(["top", "work", "projects", "experience", "skills", "contact", "source", "writing"]);

export type HashTarget =
  | { kind: "section"; id: string }
  | { kind: "project"; slug: string }
  | { kind: "route"; to: string };

/**
 * Classifies an internal `#hash`-shaped target into a section, a project
 * route, or a plain route, so a render site can decide between calling
 * `goToSection`, or rendering a `<Link>`. Callers that also allow external
 * URLs check `!href.startsWith("#")` themselves before calling this — it
 * only ever sees internal targets.
 */
export function classifyHash(href: string): HashTarget {
  const id = href.replace(/^#/, "");
  if (id.startsWith("project/")) return { kind: "project", slug: id.slice("project/".length) };
  if (SECTION_IDS.has(id)) return { kind: "section", id };
  return { kind: "route", to: `/${id}` };
}

export type ChatLinkTarget = { kind: "section"; id: string } | { kind: "route"; to: string } | { kind: "external"; href: string };

/**
 * Classifies an href the AI assistant emitted inside a markdown link, so the
 * chat can render it as real in-app navigation instead of a page-reloading
 * `<a>`. Chat hrefs arrive in three shapes: absolute site paths ("/lab",
 * "/project/mileway"), home-page sections ("/#projects", "#projects") and
 * absolute URLs / mailto:. Section + slug knowledge is delegated to
 * classifyHash so SECTION_IDS stays the single source of truth.
 */
export function classifyChatHref(href: string): ChatLinkTarget {
  const url = href.trim();
  // Any scheme (http:, mailto:, tel:) or protocol-relative "//host" leaves the
  // SPA — render it as a plain anchor rather than feeding it to the router,
  // which can only build same-origin locations.
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return { kind: "external", href: url };
  const hash = /^\/?#(.+)$/.exec(url);
  if (hash) {
    const target = classifyHash(hash[1]);
    return target.kind === "project" ? { kind: "route", to: `/project/${target.slug}` } : target;
  }
  // A path ending in a file extension is a static asset served from public/
  // (/feed.xml, /llms.txt, /og-image.png), NOT a router route — the prompt
  // explicitly offers /feed.xml, and handing it to navigate() hits the
  // catch-all splat and renders the "Signal lost" 404 instead of the file.
  // Same treatment WritingView.tsx already gives its own /feed.xml anchor.
  if (/\.[a-z0-9]{2,5}$/i.test(url)) return { kind: "external", href: url };
  return { kind: "route", to: url.startsWith("/") ? url : `/${url}` };
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
        // "instant", not "auto": index.css sets `html { scroll-behavior: smooth }`
        // with no reduced-motion override, and behavior:"auto" defers to that CSS
        // property — so "auto" would still animate. "instant" forces no animation.
        document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "instant" : "smooth", block: "start" });
        return;
      }
      navigate({ to: "/", hash: id }).then(() => scrollToSectionWhenReady(id));
    },
    [pathname, navigate],
  );

  return { goToSection };
}
