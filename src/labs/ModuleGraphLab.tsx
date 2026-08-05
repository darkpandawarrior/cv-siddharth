import { useState } from "react";
import { Link } from "@tanstack/react-router";

/**
 * The Module Graph Lab — Mileway's 46-module clean architecture, drawn as a
 * radial graph. Thirteen feature modules meet only at the :app composition
 * root; six of them are the names confirmed in the architecture diagram
 * (tracking, logging, travel, approvals, payables, agent), the rest are
 * generic "feature" nodes — the source data doesn't name the other seven.
 * Static SVG + React state: nothing here animates per-frame, so there's no
 * canvas/RAF loop to own.
 */

const CX = 210;
const CY = 175;
const FEATURE_R = 108;
const OUTER_R = 142;
const N_FEATURES = 13;
const N_OTHER = 46 - N_FEATURES; // 33 shared & composed modules, unlabeled
const CYAN = "#5ee6ff";

// Interleaved so the six confirmed names don't clump on one side of the circle.
const FEATURE_LABELS = [
  "tracking", "feature", "logging", "feature", "travel", "feature",
  "approvals", "feature", "payables", "feature", "agent", "feature", "feature",
];

const features = FEATURE_LABELS.map((label, i) => {
  const angle = (2 * Math.PI * i) / N_FEATURES - Math.PI / 2;
  return { label, named: label !== "feature", x: CX + FEATURE_R * Math.cos(angle), y: CY + FEATURE_R * Math.sin(angle), angle };
});

const otherDots = Array.from({ length: N_OTHER }, (_, i) => {
  const angle = (2 * Math.PI * i) / N_OTHER;
  return { x: CX + OUTER_R * Math.cos(angle), y: CY + OUTER_R * Math.sin(angle) };
});

// All 78 possible feature-to-feature pairs — the "tangled" hypothetical.
const crossEdges: { a: number; b: number }[] = [];
for (let i = 0; i < N_FEATURES; i++) {
  for (let j = i + 1; j < N_FEATURES; j++) crossEdges.push({ a: i, b: j });
}

function labelPos(f: { x: number; y: number; angle: number }) {
  const cos = Math.cos(f.angle);
  const sin = Math.sin(f.angle);
  return {
    x: f.x + cos * 15,
    y: f.y + sin * 15 + (sin > 0.35 ? 8 : sin < -0.35 ? -4 : 3),
    anchor: cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle",
  };
}

export function ModuleGraphLab() {
  const [isolate, setIsolate] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = pinned ?? hover ?? focused;
  const crossDeps = isolate ? 0 : crossEdges.length;

  const togglePin = (i: number) => setPinned((p) => (p === i ? null : i));

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Mileway's 46-module Gradle graph: thirteen feature modules — tracking, logging, travel,
        approvals, payables, agent and seven more — that never depend on each other, wired together
        only at the <span className="text-zinc-300">:app</span> composition root. Isolate features off
        shows the alternative: every feature reaching into every other one.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <svg
            viewBox="0 0 420 380"
            className="h-full w-full"
            role="img"
            aria-label="Radial graph of Mileway's 46 Gradle modules, centered on the :app composition root"
          >
            {!isolate &&
              crossEdges.map((e, idx) => {
                const isActive = active !== null && (e.a === active || e.b === active);
                const dim = active !== null && !isActive;
                return (
                  <line
                    key={`c-${idx}`}
                    x1={features[e.a].x}
                    y1={features[e.a].y}
                    x2={features[e.b].x}
                    y2={features[e.b].y}
                    stroke={CYAN}
                    strokeWidth={isActive ? 1.6 : 1}
                    opacity={dim ? 0.04 : isActive ? 0.65 : 0.14}
                  />
                );
              })}
            {features.map((f, i) => {
              const isActive = active === i;
              const dim = active !== null && !isActive;
              return (
                <line
                  key={`s-${i}`}
                  x1={CX}
                  y1={CY}
                  x2={f.x}
                  y2={f.y}
                  stroke={CYAN}
                  strokeWidth={isActive ? 2.4 : 1.6}
                  opacity={dim ? 0.15 : isActive ? 0.95 : 0.55}
                />
              );
            })}

            {otherDots.map((d, i) => (
              <circle key={`o-${i}`} cx={d.x} cy={d.y} r={2} fill={CYAN} opacity={0.18} />
            ))}
            <text x={CX} y={CY + OUTER_R + 22} textAnchor="middle" className="font-mono text-[10px]" fill="#71717a">
              +{N_OTHER} shared &amp; composed modules
            </text>

            {features.map((f, i) => {
              const isActive = active === i;
              const lp = labelPos(f);
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`feature module: ${f.label}${f.named ? "" : " (unconfirmed name)"}`}
                  aria-pressed={pinned === i}
                  // outline-none is paired with a visible alternative: focus
                  // (like hover/pinned) drives `active`, which brightens this
                  // node's circle + label below — an SVG <g> doesn't reliably
                  // render the browser's default focus ring anyway.
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused(null)}
                  onClick={() => togglePin(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePin(i);
                    }
                  }}
                >
                  <circle
                    cx={f.x}
                    cy={f.y}
                    r={isActive ? 9 : 7}
                    fill={isActive ? CYAN : "#0f1720"}
                    stroke={CYAN}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                  <text
                    x={lp.x}
                    y={lp.y}
                    textAnchor={lp.anchor as "start" | "end" | "middle"}
                    className="font-mono text-[9.5px]"
                    fill={f.named ? CYAN : "#71717a"}
                    opacity={f.named ? 0.95 : 0.65}
                  >
                    {f.label}
                  </text>
                </g>
              );
            })}

            <circle cx={CX} cy={CY} r={16} fill={CYAN} />
            <text x={CX} y={CY + 4} textAnchor="middle" className="font-mono text-[10px] font-bold" fill="#05070a">
              :app
            </text>
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} className="accent-signal" />
            isolate features
          </label>
          <span className={`font-mono text-xs ${isolate ? "text-accent" : "text-danger"}`}>
            cross-feature dependencies: {crossDeps}
          </span>
          <span className="font-mono text-xs text-muted">46 modules total · 36 local + 10 composed</span>
          <Link
            to="/project/$slug"
            params={{ slug: "mileway" }}
            className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent"
          >
            the full story → Mileway's 46 modules
          </Link>
        </div>
      </div>
    </div>
  );
}
