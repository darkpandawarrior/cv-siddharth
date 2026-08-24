import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";

/* ── Kursi ISMCTS Search Tree Lab ────────────────────────────────────── */
// Real numbers from src/data/profile.ts "kursi" entry: 1.5k-16k ISMCTS
// search iterations depending on difficulty tier, and the 6 named roles
// under detail.roles. The source data does not enumerate all 10 bot
// personas by name, so only these 6 roles are used for the "who's
// deciding" readout.

const TIERS = [
  { label: "Easy", target: 1500 },
  { label: "Normal", target: 4000 },
  { label: "Hard", target: 8000 },
  { label: "Expert", target: 12000 },
  { label: "Grandmaster", target: 16000 },
];

const ROLES = ["Netaji Vachan", "Bhai Teja", "Babu Filewala", "Jugaadu Chhotu", "Vakil Loophole", "Patrakaar"];

const GOLD = "var(--lab-gold)";
const HEADING_FONT = "'Rozha One', Georgia, serif";

interface TreeNode {
  x: number;
  y: number;
  angle: number;
  depth: number;
  parent: number;
}

export function SearchTreeLab() {
  const [tierIndex, setTierIndex] = useState(0);
  const [display, setDisplay] = useState({ iterations: 0, target: TIERS[0].target, tier: TIERS[0].label });
  const [result, setResult] = useState<{ role: string } | null>(null);
  const controlRef = useRef<((target: number, tierLabel: string) => void) | null>(null);

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    let nodes: TreeNode[] = [];
    let frontier: number[] = [];
    let elapsed = 0;
    let duration = 1600;
    let target = TIERS[0].target;
    let tierLabel = TIERS[0].label;
    let finished = false;
    let chosenIdx = -1;
    let roleForThisRun = ROLES[0];
    let roleCounter = 0;
    let statsAcc = 0;

    const addNode = () => {
      const parentIdx = frontier[(Math.random() * frontier.length) | 0];
      const parent = nodes[parentIdx];
      const coneRad = ((55 * Math.PI) / 180) * (Math.random() - 0.5);
      const angle = parent.angle + coneRad;
      const len = Math.max(3, 20 * Math.pow(0.94, parent.depth));
      const { width } = getSize();
      const margin = 16;
      let finalAngle = angle;
      let nx = parent.x + Math.cos(finalAngle) * len;
      if (nx < margin || nx > width - margin) {
        finalAngle = Math.PI - angle;
        nx = parent.x + Math.cos(finalAngle) * len;
      }
      let ny = parent.y + Math.sin(finalAngle) * len;
      const reachedTop = ny < margin;
      ny = Math.max(margin, ny);

      nodes.push({ x: nx, y: ny, angle: finalAngle, depth: parent.depth + 1, parent: parentIdx });
      const childIdx = nodes.length - 1;
      if (!reachedTop) frontier.push(childIdx);
      if (Math.random() < 0.35) {
        const pos = frontier.indexOf(parentIdx);
        if (pos !== -1) frontier.splice(pos, 1);
      }
      if (frontier.length === 0) frontier.push(childIdx);
    };

    const pickChosenNode = () => {
      let best = 0;
      let bestDepth = -1;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].depth > bestDepth || (nodes[i].depth === bestDepth && Math.random() < 0.4)) {
          bestDepth = nodes[i].depth;
          best = i;
        }
      }
      return best;
    };

    const startRun = (newTarget: number, newTierLabel: string) => {
      const { width, height } = getSize();
      nodes = [{ x: width / 2, y: height - 20, angle: -Math.PI / 2, depth: 0, parent: -1 }];
      frontier = [0];
      elapsed = 0;
      target = newTarget;
      tierLabel = newTierLabel;
      duration = 1600 + ((target - 1500) / (16000 - 1500)) * 1800;
      finished = false;
      chosenIdx = -1;
      roleForThisRun = ROLES[roleCounter % ROLES.length];
      roleCounter++;
      setDisplay({ iterations: 0, target, tier: tierLabel });
      setResult(null);
    };

    controlRef.current = startRun;
    startRun(target, tierLabel);

    const step = (dtMs: number) => {
      if (finished) return;
      elapsed += dtMs;
      const ratio = Math.min(1, elapsed / duration);
      const iterations = Math.round(target * ratio);
      const nodeCap = Math.min(380, Math.round(3 * Math.sqrt(target)));
      const desiredCount = Math.max(1, Math.round(1 + (nodeCap - 1) * ratio));
      while (nodes.length < desiredCount && frontier.length > 0) addNode();

      statsAcc += dtMs;
      if (statsAcc > 120) {
        statsAcc = 0;
        setDisplay({ iterations, target, tier: tierLabel });
      }

      if (ratio >= 1) {
        finished = true;
        chosenIdx = pickChosenNode();
        setDisplay({ iterations: target, target, tier: tierLabel });
        setResult({ role: roleForThisRun });
      }
    };

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);

      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        const p = nodes[n.parent];
        const recency = i / nodes.length;
        ctx.strokeStyle = `rgba(232, 200, 116, ${0.16 + 0.5 * recency})`;
        ctx.lineWidth = Math.max(0.6, 2.2 - n.depth * 0.05);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      }

      if (nodes.length > 0) {
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(nodes[0].x, nodes[0].y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!finished) {
        ctx.fillStyle = "rgba(232, 200, 116, 0.85)";
        for (const idx of frontier) {
          const n = nodes[idx];
          ctx.beginPath();
          ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (finished && chosenIdx >= 0) {
        const chain: number[] = [];
        let cur = chosenIdx;
        while (cur !== -1) {
          chain.push(cur);
          cur = nodes[cur].parent;
        }
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2.6;
        ctx.shadowColor = GOLD;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let i = chain.length - 1; i >= 0; i--) {
          const n = nodes[chain[i]];
          if (i === chain.length - 1) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        const tip = nodes[chosenIdx];
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `12px ${HEADING_FONT}`;
        ctx.fillStyle = "#f4e3ad";
        ctx.textAlign = tip.x > width / 2 ? "right" : "left";
        ctx.fillText(`${roleForThisRun} — chosen`, tip.x + (tip.x > width / 2 ? -10 : 10), tip.y - 10);
        ctx.textAlign = "left";
      }

      ctx.font = `13px ${HEADING_FONT}`;
      ctx.fillStyle = "rgba(232, 200, 116, 0.5)";
      ctx.fillText("ISMCTS Search Tree", 14, 20);
    };

    return { step, draw };
  });

  const runSearch = () => {
    const tier = TIERS[tierIndex];
    controlRef.current?.(tier.target, tier.label);
  };

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Kursi's bots never see your hand — they play with Information Set Monte Carlo Tree Search,
        growing a tree of plausible futures over the hidden cards and picking the branch that wins
        most often. Pick a difficulty and run the search: harder tiers search deeper, from 1,500
        iterations on Easy to 16,000 on Grandmaster, still landing on one bot's actual move.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" role="img" aria-label="ISMCTS search tree growth simulation" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted">difficulty:</span>
            {TIERS.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTierIndex(i)}
                aria-pressed={tierIndex === i}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                  tierIndex === i
                    ? "border-[var(--lab-gold)] bg-[var(--lab-gold)]/15 text-[var(--lab-gold)]"
                    : "border-line text-zinc-400 hover:border-[var(--lab-gold)]/40 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={runSearch}
            className="rounded-full border border-[var(--lab-gold)]/50 bg-[var(--lab-gold)]/10 px-3 py-1 font-mono text-[11px] font-semibold text-[var(--lab-gold)] transition hover:bg-[var(--lab-gold)]/20"
          >
            run search
          </button>
          <span className="font-mono text-xs text-zinc-400">
            iterations: {display.iterations} / {display.target} · difficulty: {display.tier}
          </span>
          {result && (
            <span style={{ fontFamily: HEADING_FONT }} className="text-sm text-[var(--lab-gold)]">
              role: {result.role}, chosen
            </span>
          )}
          <Link
            to="/project/$slug"
            params={{ slug: "kursi" }}
            className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent"
          >
            the full story → Kursi's ISMCTS AI
          </Link>
        </div>
      </div>
    </div>
  );
}
