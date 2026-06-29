import { useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { projects } from "./data/profile.ts";
import { galleries } from "./data/galleries.ts";

/**
 * Data-driven project deep-dive at /#project/<slug>.
 * Content comes from projects[].detail in profile.ts; screenshots come from the
 * auto-generated galleries.ts. Add a project + drop screenshots → page exists.
 */
export function ProjectDetail({ slug }: { slug: string }) {
  const project = projects.find((p) => p.slug === slug);
  const shots = galleries[slug] ?? [];
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-zinc-400">Project not found.</p>
        <a href="#projects" className="mt-4 inline-flex items-center gap-1 text-accent">
          <ArrowLeft size={16} /> Back to projects
        </a>
      </div>
    );
  }

  const d = project.detail;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 pt-10">
        <a href="#projects" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
          <ArrowLeft size={16} /> All projects
        </a>
      </div>

      {/* Hero */}
      <header className="mx-auto max-w-5xl px-6 pb-10 pt-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent/60">// project</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{project.name}</h1>
        <p className="mt-3 max-w-3xl text-lg text-accent">{project.tagline}</p>
        <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{d?.overview ?? project.description}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {project.stack.map((s) => (
            <span key={s} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-zinc-400">{s}</span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {project.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target={l.url.startsWith("#") ? undefined : "_blank"}
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim"
            >
              {l.label} <ArrowUpRight size={14} />
            </a>
          ))}
          <span className="text-sm text-zinc-500">{project.status}</span>
        </div>
      </header>

      {/* Videos */}
      {d?.videos && d.videos.length > 0 && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="font-display mb-6 text-sm font-semibold uppercase tracking-widest text-accent/60">In motion</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {d.videos.map((v) => (
                <figure key={v.src}>
                  <video
                    src={v.src}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full rounded-2xl border border-line bg-black"
                  />
                  <figcaption className="mt-2 text-center text-xs text-zinc-500">{v.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Deep-dive sections */}
      {d?.sections && d.sections.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-14">
          <div className="grid gap-8 sm:grid-cols-2">
            {d.sections.map((s) => (
              <div key={s.heading} className="rounded-2xl border border-line bg-card p-6">
                <h3 className="font-display text-lg font-bold text-accent">{s.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      {shots.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <h2 className="font-display mb-6 text-sm font-semibold uppercase tracking-widest text-accent/60">
              Screens <span className="text-zinc-600">({shots.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {shots.map((src) => (
                <button
                  key={src}
                  onClick={() => setLightbox(src)}
                  className="overflow-hidden rounded-xl border border-line bg-card transition hover:border-accent/50"
                >
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-5xl px-6 py-12 text-center">
        <a href="#projects" className="inline-flex items-center gap-2 text-sm text-accent transition hover:text-accent-dim">
          <ArrowLeft size={16} /> Back to all projects
        </a>
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        >
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
