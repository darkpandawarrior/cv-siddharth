import { FlaskConical, Smartphone, Compass, Boxes, Sparkles, TerminalSquare, type LucideIcon } from "lucide-react";
import { Reveal } from "./Reveal.tsx";

/**
 * The Workshop — one index for every interactive world on the site. These used
 * to be scattered easter eggs (a route here, a hotkey there); gathering them in
 * one lore-framed menu makes the point explicit: this portfolio isn't a
 * document, it's a running program. Every room is a small proof that I build
 * the kind of thing the CV describes.
 */

type Room = {
  href: string;
  label: string;
  blurb: string;
  tag: string;
  icon: LucideIcon;
  tint: string;
  toTop?: boolean; // routes need a scroll-to-top; in-page anchors don't
};

const ROOMS: Room[] = [
  {
    href: "#compose",
    label: "Compose Playground",
    blurb: "Write Jetpack Compose, watch it recompose live in a phone frame — reactive state, animation, and an AI that writes it for you.",
    tag: "live editor · AI",
    icon: Smartphone,
    tint: "#3ddc84",
    toTop: true,
  },
  {
    href: "#lab",
    label: "The Lab Bench",
    blurb: "Four experiments that prove the case-study numbers — crash clustering, recomposition, GPS filtering, white-label theming — running in your browser.",
    tag: "canvas · physics",
    icon: FlaskConical,
    tint: "#5ee6ff",
  },
  {
    href: "#blueprint",
    label: "The Blueprint Room",
    blurb: "The whole portfolio as an infinite canvas — a real-time 3D fly-through, an ASCII render of the same scene, and a sketchable whiteboard.",
    tag: "3D · WebGL",
    icon: Compass,
    tint: "#db61ff",
    toTop: true,
  },
  {
    href: "#map",
    label: "The 3D Storyboard",
    blurb: "The projects and the ideas that connect them, as a constellation you can orbit — every edge is a real dependency.",
    tag: "3D · graph",
    icon: Boxes,
    tint: "#f0883e",
    toTop: true,
  },
  {
    href: "#forge",
    label: "The Particle Forge",
    blurb: "A few thousand particles, each spring-tied to a letter, parting around your cursor and snapping back. Physics on a canvas.",
    tag: "canvas · interactive",
    icon: Sparkles,
    tint: "#3ddc84",
  },
  {
    href: "#terminal",
    label: "The Terminal",
    blurb: "A faux shell you can actually type in — ls the site, cat a project, or hit the backtick key from anywhere.",
    tag: "text · easter egg",
    icon: TerminalSquare,
    tint: "#5ee6ff",
    toTop: true,
  },
];

export function Workshop() {
  return (
    <section id="workshop" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the workshop</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">This site is a live demo</h2>
          <p className="mb-10 max-w-2xl text-zinc-400">
            Not a PDF with a pulse — a running program. Six interactive rooms, each a small proof of the
            engineering the rest of the page describes. Pick one and poke it.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROOMS.map((r, i) => {
            const Icon = r.icon;
            return (
              <Reveal key={r.href} delay={(i % 3) * 90} className="h-full">
                <a
                  href={r.href}
                  onClick={() => { if (r.toTop) window.scrollTo({ top: 0 }); }}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-1"
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${r.tint}66`)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl border transition"
                      style={{ borderColor: `${r.tint}40`, background: `${r.tint}12`, color: r.tint }}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{r.tag}</span>
                  </div>
                  <h3 className="font-display mt-4 text-lg font-bold transition group-hover:text-accent">{r.label}</h3>
                  <p className="mt-2 grow text-sm leading-relaxed text-zinc-400">{r.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] font-semibold" style={{ color: r.tint }}>
                    enter →
                  </span>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
