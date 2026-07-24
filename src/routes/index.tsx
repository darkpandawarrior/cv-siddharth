import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../App.tsx";

export const Route = createFileRoute("/")({
  // Owns the canonical link itself rather than relying on __root.tsx's — the
  // router's `links` array (unlike `meta`) concatenates across every matched
  // route instead of deduping by `rel`, so a hardcoded canonical in the root
  // would render ALONGSIDE this one on every route, and per-route overrides
  // (resume.tsx, project.$slug.tsx) would ship two conflicting canonical
  // tags (verified: multiple <link rel="canonical"> get ignored by crawlers
  // entirely, per Google's own guidance) instead of actually overriding.
  head: () => ({ links: [{ rel: "canonical", href: "https://cv-siddharth.vercel.app/" }] }),
  component: HomePage,
});
