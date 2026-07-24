import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResumeView } from "../ResumeView.tsx";

export const Route = createFileRoute("/resume")({
  head: () => {
    const desc = "Print-perfect résumé — Siddharth Pandalai, Senior Android Engineer. 738k-LOC Compose SaaS, GPS 50%→95%, 80% crash reduction.";
    return {
      meta: [
        { title: "Résumé — Siddharth Pandalai | Senior Android Engineer" },
        { name: "description", content: desc },
        { property: "og:url", content: "https://cv-siddharth.vercel.app/resume" },
        { property: "og:description", content: desc },
      ],
      links: [{ rel: "canonical", href: "https://cv-siddharth.vercel.app/resume" }],
    };
  },
  component: ResumePage,
});

function ResumePage() {
  // The portfolio is dark; the résumé prints on white.
  useEffect(() => {
    document.documentElement.classList.add("resume-mode");
    return () => document.documentElement.classList.remove("resume-mode");
  }, []);
  return <ResumeView />;
}
