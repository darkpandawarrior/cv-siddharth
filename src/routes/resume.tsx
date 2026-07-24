import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResumeView } from "../ResumeView.tsx";

export const Route = createFileRoute("/resume")({
  head: () => ({ meta: [{ title: "Résumé — Siddharth Pandalai | Senior Android Engineer" }] }),
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
