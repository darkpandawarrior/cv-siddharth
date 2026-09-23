import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { resourceRows, type ResourceKind } from "./data/resourceDirectory.ts";

const ROWS = resourceRows();
const KINDS: { value: ResourceKind | "all"; label: string }[] = [
  { value: "all", label: "All resources" },
  { value: "case study", label: "Case studies" },
  { value: "source", label: "Source" },
  { value: "API docs", label: "KDocs" },
  { value: "live demo", label: "Live builds" },
  { value: "showcase", label: "Showcases" },
  { value: "install", label: "Install" },
];

export function ResourceDirectory() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ResourceKind | "all">("all");
  const term = query.trim().toLowerCase();
  const rows = ROWS.map(({ project, resources }) => ({
    project,
    resources: resources.filter((resource) => kind === "all" || resource.kind === kind),
  })).filter(({ project, resources }) => resources.length > 0 && (
    !term || `${project.name} ${project.tagline} ${resources.map((resource) => resource.label).join(" ")}`.toLowerCase().includes(term)
  ));

  return (
    <div className="border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker-accent">Project directory</p>
          <h4 className="font-display mt-1 text-xl font-bold text-zinc-100">Follow the work</h4>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">Case studies, source, Kotlin API docs, live builds, narrated tours and installable apps in one index.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-ink px-3 text-muted focus-within:border-accent sm:w-48" htmlFor="resource-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search projects and resources</span>
            <input id="resource-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project" className="min-h-11 min-w-0 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-muted" />
          </label>
          <label className="sr-only" htmlFor="resource-kind">Filter resource type</label>
          <select id="resource-kind" value={kind} onChange={(event) => setKind(event.target.value as ResourceKind | "all")}
            className="min-h-11 rounded-lg border border-line bg-ink px-3 text-sm text-zinc-100 focus:border-accent">
            {KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-5 divide-y divide-line rounded-xl border border-line bg-card/50">
        {rows.map(({ project, resources }) => (
          <div key={project.slug} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-5">
            <div className="min-w-0">
              <p className="font-display font-semibold text-zinc-100">{project.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{project.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {resources.map((resource) => resource.kind === "case study" ? (
                <Link key={`${resource.kind}-${resource.url}`} to="/project/$slug" params={{ slug: project.slug }}
                  className="inline-flex min-h-10 items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20">
                  {resource.label}<ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              ) : (
                <a key={`${resource.kind}-${resource.url}`} href={resource.url}
                  target={resource.url.startsWith("https://") ? "_blank" : undefined}
                  rel={resource.url.startsWith("https://") ? "noreferrer" : undefined}
                  className="inline-flex min-h-10 items-center gap-1 rounded-full border border-line px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-accent/50 hover:text-accent">
                  {resource.label}<ArrowUpRight size={12} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="p-6 text-sm text-muted">No resources match that search. Try another project or resource type.</p>}
      </div>
    </div>
  );
}
