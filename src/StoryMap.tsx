import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal.tsx";
import { openChat } from "./FloatingChat.tsx";
import { BOOKS_BEFORE_BROS } from "./data/writingMeta.ts";

const StoryMapScene = lazy(() => import("./StoryMapScene.tsx"));

/**
 * The Storyboard — an interactive constellation of everything on this site,
 * drawn on a plain 2D canvas (no extra deps). Every node is a real
 * destination: sections, project case studies, the writing hub, the original
 * blog, the AI assistant. Edges show how the work feeds the writing and how
 * the projects share one foundation. Hover highlights a node's wiring;
 * click travels there. Reduced motion gets a static render, and the
 * chip-row below the canvas carries the same links for keyboard/touch.
 */

export type StoryNode = {
  id: string;
  label: string;
  sub?: string;
  x: number; // normalized 0..1
  y: number;
  r: number;
  color: string;
  target: string; // "#hash", external url, or "chat"
};
type Node = StoryNode;

const GREEN = "#3ddc84";
const CYAN = "#5ee6ff";
const PURPLE = "#7c5cff";
const ORANGE = "#f0883e";

export const NODES: Node[] = [
  { id: "sid", label: "SID", sub: "prototype → platform", x: 0.5, y: 0.46, r: 26, color: GREEN, target: "#top" },
  { id: "work", label: "Case studies", sub: "the numbers", x: 0.24, y: 0.2, r: 15, color: GREEN, target: "#work" },
  { id: "mileway", label: "Mileway", sub: "5 platforms", x: 0.1, y: 0.5, r: 14, color: GREEN, target: "#project/mileway" },
  { id: "kursi", label: "Kursi", sub: "live web build", x: 0.2, y: 0.8, r: 12, color: GREEN, target: "#project/kursi" },
  { id: "paymentslab", label: "PaymentsLab", sub: "gateway lab", x: 0.38, y: 0.88, r: 12, color: GREEN, target: "#project/paymentslab" },
  { id: "hiresignal", label: "HireSignal", sub: "25-module KMP", x: 0.56, y: 0.68, r: 12, color: GREEN, target: "#project/hiresignal" },
  { id: "deadlock", label: "DEADLOCK", sub: "time-loop game", x: 0.7, y: 0.58, r: 12, color: GREEN, target: "#project/deadlock" },
  { id: "experience", label: "Experience", x: 0.62, y: 0.12, r: 11, color: CYAN, target: "#experience" },
  { id: "skills", label: "Skills", x: 0.4, y: 0.08, r: 11, color: CYAN, target: "#skills" },
  { id: "writing", label: "The Loopdown", sub: "field notes", x: 0.78, y: 0.34, r: 15, color: PURPLE, target: "#loopdown" },
  { id: "books", label: "Books Before Bros", sub: "the origin blog", x: 0.9, y: 0.64, r: 13, color: ORANGE, target: BOOKS_BEFORE_BROS.url },
  { id: "chat", label: "Ask my AI", sub: "knows all of this", x: 0.66, y: 0.84, r: 13, color: CYAN, target: "chat" },
  { id: "blueprint", label: "Blueprint Room", sub: "infinite canvas", x: 0.52, y: 0.16, r: 12, color: ORANGE, target: "#blueprint" },
];

// Wiring: hub feeds everything; the work feeds the writing; the writing
// descends from the blog; the AI has read the lot.
export const EDGES: [string, string][] = [
  ["sid", "work"], ["sid", "mileway"], ["sid", "kursi"], ["sid", "paymentslab"],
  ["sid", "hiresignal"], ["sid", "deadlock"],
  ["sid", "experience"], ["sid", "skills"], ["sid", "writing"], ["sid", "chat"],
  ["mileway", "writing"], ["work", "writing"], ["books", "writing"],
  ["mileway", "kursi"], ["kursi", "paymentslab"], ["paymentslab", "hiresignal"], ["hiresignal", "deadlock"],
  ["chat", "writing"], ["chat", "work"],
  ["sid", "blueprint"],
];

export function navigate(target: string) {
  if (target === "chat") return openChat();
  if (target.startsWith("#")) {
    const inPage = document.getElementById(target.slice(1));
    window.location.hash = target;
    if (!inPage) window.scrollTo({ top: 0 });
    return;
  }
  window.open(target, "_blank", "noreferrer");
}

function StoryMapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hovered;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    const pointer = { x: 0.5, y: 0.5, active: false };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);
    resize();

    // Per-node drift phase so the constellation breathes out of sync.
    const phase = NODES.map((_, i) => i * 1.7);

    const pos = (n: Node, i: number, t: number) => {
      const drift = reduced ? 0 : 1;
      const px = (pointer.active ? pointer.x - 0.5 : 0) * 10 * drift;
      const py = (pointer.active ? pointer.y - 0.5 : 0) * 10 * drift;
      return {
        x: n.x * width + Math.sin(t / 1400 + phase[i]) * 6 * drift + px,
        y: n.y * height + Math.cos(t / 1700 + phase[i]) * 6 * drift + py,
      };
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const hov = hoveredRef.current;
      const points = NODES.map((n, i) => ({ n, ...pos(n, i, t) }));
      const at = (id: string) => points.find((p) => p.n.id === id)!;

      for (const [a, b] of EDGES) {
        const pa = at(a);
        const pb = at(b);
        const hot = hov === a || hov === b;
        const mx = (pa.x + pb.x) / 2 + (pa.y - pb.y) * 0.12;
        const my = (pa.y + pb.y) / 2 + (pb.x - pa.x) * 0.12;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
        ctx.strokeStyle = hot ? `${pb.n.color}cc` : "rgba(94, 230, 255, 0.14)";
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.stroke();
        // signal pulse traveling the wire
        if (!reduced) {
          const k = ((t / 2400 + (a.charCodeAt(0) % 7) / 7) % 1);
          const q = 1 - k;
          const sx = q * q * pa.x + 2 * q * k * mx + k * k * pb.x;
          const sy = q * q * pa.y + 2 * q * k * my + k * k * pb.y;
          ctx.beginPath();
          ctx.arc(sx, sy, hot ? 2.2 : 1.4, 0, Math.PI * 2);
          ctx.fillStyle = hot ? pb.n.color : "rgba(94, 230, 255, 0.35)";
          ctx.fill();
        }
      }

      for (const p of points) {
        const hot = hov === p.n.id;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.n.r * (hot ? 2.6 : 2));
        glow.addColorStop(0, `${p.n.color}${hot ? "55" : "2e"}`);
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.n.r * (hot ? 2.6 : 2), 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, hot ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = p.n.color;
        ctx.fill();
        ctx.font = `${hot ? 700 : 600} 11px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = hot ? "#e8efe9" : "rgba(232, 239, 233, 0.72)";
        ctx.fillText(p.n.label, p.x, p.y - p.n.r - 4);
        if (p.n.sub && (hot || p.n.id === "sid")) {
          ctx.font = '400 9.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = `${p.n.color}cc`;
          ctx.fillText(p.n.sub, p.x, p.y + p.n.r + 14);
        }
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);

    const hitTest = (e: PointerEvent): Node | null => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer.x = x / rect.width;
      pointer.y = y / rect.height;
      pointer.active = true;
      for (const [i, n] of NODES.entries()) {
        const p = pos(n, i, performance.now());
        if (Math.hypot(p.x - x, p.y - y) < n.r + 12) return n;
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      const hit = hitTest(e);
      canvas.style.cursor = hit ? "pointer" : "default";
      setHovered(hit?.id ?? null);
      if (reduced) draw(0);
    };
    const onLeave = () => {
      pointer.active = false;
      setHovered(null);
      if (reduced) draw(0);
    };
    const onClick = (e: PointerEvent) => {
      const hit = hitTest(e);
      if (hit) navigate(hit.target);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function StoryMap() {
  const holder = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // Capable, motion-friendly desktops get the full 3D constellation;
  // everyone else keeps the (already animated) 2D canvas.
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    const wants3D = !reduced && !isSmallScreen && supportsWebGL();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          setUse3D(wants3D);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="map" className="section-y mx-auto max-w-5xl px-6">
      <Reveal>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the storyboard</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Everything connects</h2>
        <p className="mb-8 max-w-2xl text-zinc-400">
          The projects share one foundation, the writing is field notes from the work, and the AI
          assistant has read all of it. Hover the constellation — click a node to travel.
        </p>
      </Reveal>
      <Reveal>
        <div
          ref={holder}
          className="card-elevated relative hidden h-[420px] overflow-hidden rounded-2xl border border-line bg-void/60 sm:block"
        >
          {mounted &&
            (use3D ? (
              <Suspense fallback={<StoryMapCanvas />}>
                <StoryMapScene />
              </Suspense>
            ) : (
              <StoryMapCanvas />
            ))}
          {use3D && (
            <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              drag to orbit
            </span>
          )}
        </div>
        <a
          href="#blueprint"
          onClick={() => window.scrollTo({ top: 0 })}
          className="group mt-4 flex items-center justify-between rounded-xl border border-accent2/30 bg-accent2/5 px-4 py-3 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10"
        >
          <span>Enter the Blueprint Room — the same map as an infinite, editable canvas</span>
          <span className="transition group-hover:translate-x-1">→</span>
        </a>
        {/* Same destinations as real links — keyboard, touch and small screens. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {NODES.filter((n) => n.id !== "sid").map((n) =>
            n.target === "chat" ? (
              <button
                key={n.id}
                onClick={() => openChat()}
                className="tag-chip rounded-full border border-line bg-card px-3 py-1 text-xs text-zinc-400 transition hover:text-zinc-100"
                style={{ borderColor: `${n.color}44` }}
              >
                {n.label}
              </button>
            ) : (
              <a
                key={n.id}
                href={n.target}
                target={n.target.startsWith("#") ? undefined : "_blank"}
                rel="noreferrer"
                onClick={(e) => {
                  if (n.target.startsWith("#")) {
                    e.preventDefault();
                    navigate(n.target);
                  }
                }}
                className="tag-chip rounded-full border border-line bg-card px-3 py-1 text-xs text-zinc-400 transition hover:text-zinc-100"
                style={{ borderColor: `${n.color}44` }}
              >
                {n.label}
              </a>
            ),
          )}
        </div>
      </Reveal>
    </section>
  );
}
