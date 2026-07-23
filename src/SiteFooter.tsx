import { ArrowUpRight } from "lucide-react";
import { profile } from "./data/profile.ts";
import { BOOKS_BEFORE_BROS, LOOPDOWN_REPO } from "./data/writingMeta.ts";

/**
 * Sitemap footer — every surface of the site (and its satellites) reachable
 * from one place, so no page is a dead end. External links open new tabs.
 */
const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Case studies", href: "#work" },
      { label: "Projects", href: "#projects" },
      { label: "Experience", href: "#experience" },
      { label: "Skills", href: "#skills" },
      { label: "Writing", href: "#writing" },
      { label: "Résumé", href: "#resume" },
    ],
  },
  {
    title: "Builds",
    links: [
      { label: "Mileway", href: "#project/mileway" },
      { label: "Kursi", href: "#project/kursi" },
      { label: "PaymentsLab", href: "#project/paymentslab" },
      { label: "3D Storyboard", href: "#map" },
      { label: "Particle Forge", href: "#forge" },
      { label: "Compose Playground", href: "#compose" },
      { label: "Blueprint Room", href: "#blueprint" },
      { label: "Terminal ⌘", href: "#terminal" },
    ],
  },
  {
    title: "Writing",
    links: [
      { label: "The Loopdown", href: "#loopdown" },
      { label: BOOKS_BEFORE_BROS.name, href: BOOKS_BEFORE_BROS.url, external: true },
      { label: "the-loopdown repo", href: LOOPDOWN_REPO, external: true },
      { label: "dev.to", href: "https://dev.to/darkpandawarrior", external: true },
    ],
  },
  {
    title: "Elsewhere",
    links: [
      { label: "GitHub", href: profile.github, external: true },
      { label: "LinkedIn", href: profile.linkedin, external: true },
      { label: "Email", href: `mailto:${profile.email}`, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-accent/60">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target={l.external ? "_blank" : undefined}
                    rel={l.external ? "noreferrer" : undefined}
                    className="group inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-accent"
                  >
                    {l.label}
                    {l.external && <ArrowUpRight size={11} className="opacity-0 transition group-hover:opacity-100" />}
                  </a>
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
