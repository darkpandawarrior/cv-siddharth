import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResumeView, type ResumeCut } from "../ResumeView.tsx";
// core.ts directly (not the ../data/profile.ts barrel): `head()` only needs
// name/title, same reasoning as __root.tsx's own profile/core.ts import.
import { profile } from "../data/profile/core.ts";
import { buildResumeJsonLd } from "../lib/resumeMeta.ts";
import { heavy } from "../lib/assetBase.ts";

// The full record is the default and carries no param, so `/resume` keeps
// showing everything exactly as it always has. Anything unrecognised falls
// back to it rather than erroring — a mistyped `?cut=` should still hand a
// recruiter a résumé, and the safe fallback is the one that omits nothing.
type Search = { cut?: Exclude<ResumeCut, "full"> };

export const Route = createFileRoute("/resume")({
  validateSearch: (search: Record<string, unknown>): Search =>
    search.cut === "one" || search.cut === "two" ? { cut: search.cut } : {},
  head: () => {
    // Name and title come from profile.ts, the same record the résumé body
    // renders from — a promotion changes one line there instead of leaving the
    // old title in the two strings a recruiter's tab and unfurl actually show.
    // The metrics stay written out: each of these strings is under its own
    // length budget and reads as a sentence, not a joined list.
    const desc = `Print-perfect résumé — ${profile.name}, ${profile.title}. ~964k-LOC Compose SaaS, GPS 50%→95%, 80% crash reduction.`;
    return {
      meta: [
        { title: `Résumé — ${profile.name} | ${profile.title}` },
        { name: "description", content: desc },
        { property: "og:url", content: "https://siddharth-pandalai.vercel.app/resume" },
        { property: "og:description", content: desc },
        { property: "og:image", content: heavy("/p/resume/og.png") },
        { name: "twitter:image", content: heavy("/p/resume/og.png") },
      ],
      links: [{ rel: "canonical", href: "https://siddharth-pandalai.vercel.app/resume" }],
      // Résumé-specific Person schema, derived from the same profile/experience
      // data the page itself renders from — unlike __root.tsx's PERSON_LD this
      // can't drift from what /resume actually says.
      scripts: [{ type: "application/ld+json", children: JSON.stringify(buildResumeJsonLd()) }],
    };
  },
  component: ResumePage,
});

// getRouteApi: see src/routes/map.tsx's comment — `Route.useSearch()` inside
// a split component re-imports the whole route module.
const route = getRouteApi("/resume");

function ResumePage() {
  const { cut } = route.useSearch();
  // The portfolio is dark; the résumé prints on white.
  useEffect(() => {
    document.documentElement.classList.add("resume-mode");
    return () => document.documentElement.classList.remove("resume-mode");
  }, []);
  return (
    <>
      {/* Shared-element morph target for the hero's "View résumé" link
          (App.tsx `viewTransitionName: "resume-hero"`) — the wrapper, not
          ResumeView itself, carries the name: ResumeView.tsx is another
          lane's file. */}
      <div style={{ viewTransitionName: "resume-hero" }}>
        <ResumeView cut={cut ?? "full"} />
      </div>
    </>
  );
}
