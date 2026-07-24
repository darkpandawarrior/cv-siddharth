import { ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { profile } from "./data/profile.ts";
import { BOOKS_BEFORE_BROS, LOOPDOWN_REPO } from "./data/writingMeta.ts";
import { useSectionNav } from "./lib/navigation.ts";

type FooterLink =
  | { label: string; kind: "route"; to: string; params?: { slug: string } }
  | { label: string; kind: "section"; id: string }
  | { label: string; kind: "external"; href: string };

/**
 * Sitemap footer — every surface of the site (and its satellites) reachable
 * from one place, so no page is a dead end. External links open new tabs.
 */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Case studies", kind: "section", id: "work" },
      { label: "Projects", kind: "section", id: "projects" },
      { label: "The Source (repos)", kind: "section", id: "source" },
      { label: "Experience", kind: "section", id: "experience" },
      { label: "Skills", kind: "section", id: "skills" },
      { label: "Writing", kind: "section", id: "writing" },
      { label: "The Playground", kind: "route", to: "/playground" },
      { label: "Résumé", kind: "route", to: "/resume" },
    ],
  },
  {
    title: "Builds",
    links: [
      { label: "Mileway", kind: "route", to: "/project/$slug", params: { slug: "mileway" } },
      { label: "Kursi", kind: "route", to: "/project/$slug", params: { slug: "kursi" } },
      { label: "PaymentsLab", kind: "route", to: "/project/$slug", params: { slug: "paymentslab" } },
      { label: "HireSignal", kind: "route", to: "/project/$slug", params: { slug: "hiresignal" } },
      { label: "DEADLOCK", kind: "route", to: "/project/$slug", params: { slug: "deadlock" } },
      { label: "▶ The Playground", kind: "route", to: "/playground" },
      { label: "Compose Playground", kind: "route", to: "/compose" },
      { label: "Blueprint Room", kind: "route", to: "/blueprint" },
      { label: "3D Storyboard", kind: "route", to: "/map" },
      { label: "Terminal ⌘", kind: "route", to: "/terminal" },
    ],
  },
  {
    title: "Writing",
    links: [
      { label: "The Loopdown", kind: "route", to: "/loopdown" },
      { label: BOOKS_BEFORE_BROS.name, kind: "external", href: BOOKS_BEFORE_BROS.url },
      { label: "the-loopdown repo", kind: "external", href: LOOPDOWN_REPO },
      { label: "dev.to", kind: "external", href: "https://dev.to/darkpandawarrior" },
    ],
  },
  {
    title: "Elsewhere",
    links: [
      { label: "GitHub", kind: "external", href: profile.github },
      { label: "LinkedIn", kind: "external", href: profile.linkedin },
      { label: "Email", kind: "external", href: `mailto:${profile.email}` },
    ],
  },
];

const LINK_CLASS = "group inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-accent";

export function SiteFooter() {
  const { goToSection } = useSectionNav();

  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-accent/60">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.kind === "route" && (
                    <Link to={l.to} params={l.params} className={LINK_CLASS}>
                      {l.label}
                    </Link>
                  )}
                  {l.kind === "section" && (
                    <button type="button" onClick={() => goToSection(l.id)} className={LINK_CLASS}>
                      {l.label}
                    </button>
                  )}
                  {l.kind === "external" && (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                      {l.label}
                      <ArrowUpRight size={11} className="opacity-0 transition group-hover:opacity-100" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-zinc-600">
        Built with React 19, Tailwind v4, three.js, tldraw and an LLM-agnostic chat backend · {new Date().getFullYear()}
      </div>
    </footer>
  );
}
