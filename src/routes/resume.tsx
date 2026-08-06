import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResumeView, type ResumeCut } from "../ResumeView.tsx";

// The full record is the default and carries no param, so `/resume` keeps
// showing everything exactly as it always has. Anything unrecognised falls
// back to it rather than erroring — a mistyped `?cut=` should still hand a
// recruiter a résumé, and the safe fallback is the one that omits nothing.
type Search = { cut?: Exclude<ResumeCut, "full"> };

export const Route = createFileRoute("/resume")({
  validateSearch: (search: Record<string, unknown>): Search =>
    search.cut === "one" || search.cut === "two" ? { cut: search.cut } : {},
  head: () => {
    const desc = "Print-perfect résumé — Siddharth Pandalai, Senior Android Engineer. ~964k-LOC Compose SaaS, GPS 50%→95%, 80% crash reduction.";
    return {
      meta: [
        { title: "Résumé — Siddharth Pandalai | Senior Android Engineer" },
        { name: "description", content: desc },
        { property: "og:url", content: "https://cv-siddharth.vercel.app/resume" },
        { property: "og:description", content: desc },
        { property: "og:image", content: "https://cv-siddharth.vercel.app/p/resume/og.png" },
        { name: "twitter:image", content: "https://cv-siddharth.vercel.app/p/resume/og.png" },
      ],
      links: [{ rel: "canonical", href: "https://cv-siddharth.vercel.app/resume" }],
    };
  },
  component: ResumePage,
});

function ResumePage() {
  const { cut } = Route.useSearch();
  // The portfolio is dark; the résumé prints on white.
  useEffect(() => {
    document.documentElement.classList.add("resume-mode");
    return () => document.documentElement.classList.remove("resume-mode");
  }, []);
  return <ResumeView cut={cut ?? "full"} />;
}
