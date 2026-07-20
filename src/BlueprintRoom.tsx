import { Tldraw, createShapeId, toRichText, type Editor, type TLDefaultColorStyle, type TLShapePartial } from "tldraw";
import "tldraw/tldraw.css";
import { ArrowLeft, Compass } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";

/**
 * The Blueprint Room — the whole portfolio laid out on an infinite tldraw
 * canvas at /#blueprint. The same synergy graph as the Storyboard, but as a
 * living whiteboard: pan, zoom, drag the nodes around, sketch on top of it.
 * Edits persist locally (persistenceKey), so a visitor can leave notes for
 * themselves. Loaded lazily — the tldraw SDK ships only on this route.
 */

const id = (s: string) => createShapeId(s);

type NodeSpec = {
  key: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  geo?: "ellipse" | "rectangle" | "cloud" | "hexagon";
  color: TLDefaultColorStyle;
  fill?: "none" | "semi" | "solid" | "pattern";
  label: string;
};

// Generous spacing on purpose — the canvas is infinite, let the graph breathe.
const NODES: NodeSpec[] = [
  // hub
  { key: "sid", x: 1150, y: 640, w: 300, h: 140, geo: "hexagon", color: "green", fill: "semi", label: "SID\nprototype → platform" },

  // the work (left cluster)
  { key: "work", x: 300, y: 180, w: 260, h: 110, geo: "rectangle", color: "green", fill: "semi", label: "Case studies\nthe numbers" },
  { key: "gps", x: 60, y: 480, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "GPS 50% → 95%" },
  { key: "crash", x: 100, y: 720, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "-80% crashes" },
  { key: "compose", x: 60, y: 960, w: 240, h: 90, geo: "rectangle", color: "light-green", label: "92% Compose · 738k LOC" },

  // the builds (bottom cluster)
  { key: "mileway", x: 700, y: 1150, w: 260, h: 110, geo: "ellipse", color: "light-blue", fill: "semi", label: "Mileway\n5 platforms · offline AI" },
  { key: "kursi", x: 1250, y: 1260, w: 220, h: 100, geo: "ellipse", color: "light-blue", label: "Kursi\nlive web build" },
  { key: "paymentslab", x: 1800, y: 1150, w: 240, h: 100, geo: "ellipse", color: "light-blue", label: "PaymentsLab\ngateway lab" },
  { key: "toolkit", x: 1270, y: 1560, w: 260, h: 100, geo: "hexagon", color: "green", label: "kmp-toolkit\nshared foundation" },

  // the writing (right cluster)
  { key: "loopdown", x: 2050, y: 300, w: 280, h: 120, geo: "cloud", color: "violet", fill: "semi", label: "The Loopdown\nfield notes that tell stories" },
  { key: "sensors", x: 1720, y: 40, w: 230, h: 80, geo: "rectangle", color: "violet", label: "Sensors Who Lie" },
  { key: "court", x: 2450, y: 60, w: 240, h: 80, geo: "rectangle", color: "violet", label: "The Coroutine Court" },
  { key: "ghosts", x: 2520, y: 620, w: 280, h: 80, geo: "rectangle", color: "violet", label: "Ghosts In The Recomposition" },
  { key: "books", x: 2500, y: 950, w: 260, h: 110, geo: "cloud", color: "orange", fill: "semi", label: "Books Before Bros\nthe origin blog (2018–2020)" },

  // the ai (top-middle)
  { key: "chat", x: 1180, y: 120, w: 240, h: 100, geo: "ellipse", color: "light-blue", fill: "semi", label: "Ask my AI\nhas read all of this" },
];

const ARROWS: [string, string, TLDefaultColorStyle][] = [
  ["sid", "work", "green"],
  ["sid", "mileway", "light-blue"],
  ["sid", "kursi", "light-blue"],
  ["sid", "paymentslab", "light-blue"],
  ["sid", "loopdown", "violet"],
  ["sid", "chat", "light-blue"],
  ["work", "gps", "light-green"],
  ["work", "crash", "light-green"],
  ["work", "compose", "light-green"],
  ["gps", "sensors", "violet"],
  ["crash", "court", "violet"],
  ["compose", "ghosts", "violet"],
  ["sensors", "loopdown", "violet"],
  ["court", "loopdown", "violet"],
  ["ghosts", "loopdown", "violet"],
  ["books", "loopdown", "orange"],
  ["mileway", "toolkit", "green"],
  ["kursi", "toolkit", "green"],
  ["paymentslab", "toolkit", "green"],
  ["mileway", "sensors", "violet"],
];

const NOTES: { x: number; y: number; color: TLDefaultColorStyle; text: string }[] = [
  { x: 620, y: 60, color: "yellow", text: "Every arrow is real: the writing grew out of the work, the apps share one foundation." },
  { x: 2100, y: 1400, color: "yellow", text: "This canvas is yours too — drag things, sketch, leave a note. It stays in your browser." },
];

function centerOf(n: NodeSpec) {
  return { x: n.x + (n.w ?? 220) / 2, y: n.y + (n.h ?? 90) / 2 };
}

function seed(editor: Editor) {
  const byKey = Object.fromEntries(NODES.map((n) => [n.key, n]));
  const shapes: TLShapePartial[] = [];

  for (const [a, b, color] of ARROWS) {
    const pa = centerOf(byKey[a]);
    const pb = centerOf(byKey[b]);
    shapes.push({
      id: id(`arrow-${a}-${b}`),
      type: "arrow",
      props: {
        start: { x: pa.x, y: pa.y },
        end: { x: pb.x, y: pb.y },
        color,
        dash: "dotted",
        size: "s",
      },
    });
  }

  for (const n of NODES) {
    shapes.push({
      id: id(n.key),
      type: "geo",
      x: n.x,
      y: n.y,
      props: {
        geo: n.geo ?? "rectangle",
        w: n.w ?? 220,
        h: n.h ?? 90,
        color: n.color,
        fill: n.fill ?? "none",
        dash: "draw",
        size: "s",
        font: "mono",
        richText: toRichText(n.label),
      },
    });
  }

  for (const [i, note] of NOTES.entries()) {
    shapes.push({
      id: id(`note-${i}`),
      type: "note",
      x: note.x,
      y: note.y,
      props: { color: note.color, size: "s", font: "mono", richText: toRichText(note.text) },
    });
  }

  editor.createShapes(shapes);
  editor.zoomToFit({ animation: { duration: 400 } });
  editor.selectNone();
}

function onMount(editor: Editor) {
  editor.user.updateUserPreferences({ colorScheme: "dark" });
  // Seed only on first visit — persistenceKey keeps the visitor's own
  // rearrangements and doodles on return.
  if (editor.getCurrentPageShapeIds().size === 0) seed(editor);
  else editor.zoomToFit();
}

export default function BlueprintRoom() {
  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <a href="#top" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> Back to portfolio
          </a>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 sm:flex">
            <Compass size={13} className="text-accent" /> The Blueprint Room — an infinite canvas of everything here
          </span>
          <div className="flex items-center gap-4">
            <a href="#map" className="hidden text-sm text-zinc-400 transition hover:text-accent sm:block">
              3D Storyboard
            </a>
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
            >
              Ask my AI
            </button>
          </div>
        </nav>
      </header>
      <div className="relative min-h-0 flex-1">
        <Tldraw persistenceKey="sid-blueprint-room" onMount={onMount} />
      </div>
    </div>
  );
}
