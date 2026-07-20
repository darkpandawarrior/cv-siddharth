import { useEffect, useRef } from "react";
import {
  AssetRecordType,
  Box,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  Tldraw,
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
  type TLShapePartial,
} from "tldraw";
import "tldraw/tldraw.css";
import { Canvas } from "@react-three/fiber";
import { ARROWS, FRAMES, METRICS, NODES, NOTES, PINS, PERSISTENCE_KEY, TOUR, centerOf } from "./blueprintData.ts";
import { CountUp, HoloCore, hasWebGL, ShapeBoundary } from "./blueprintShared.tsx";
import { clearBlueprintPersistence } from "./blueprintPersistence.ts";

/* Everything that pulls in the tldraw SDK lives in this file, isolated from
 * BlueprintRoom.tsx and lazy-loaded only when a visitor actually picks
 * Sketch mode — Fly/ASCII (the default) never downloads tldraw's weight. */

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "sid-metric": { w: number; h: number; value: string; label: string };
    "sid-holo": { w: number; h: number };
  }
}
type MetricShape = TLShape<"sid-metric">;
type HoloShape = TLShape<"sid-holo">;

class MetricShapeUtil extends ShapeUtil<MetricShape> {
  static override type = "sid-metric" as const;

  getDefaultProps(): MetricShape["props"] {
    return { w: 200, h: 112, value: "95%", label: "metric" };
  }

  getGeometry(shape: MetricShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  component(shape: MetricShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 18px",
          borderRadius: 14,
          background: "rgba(11, 15, 13, 0.92)",
          border: "1px solid rgba(61, 220, 132, 0.4)",
          boxShadow: "0 0 30px -10px rgba(61, 220, 132, 0.5)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 700, color: "#3ddc84", lineHeight: 1.1 }}>
          <CountUp value={shape.props.value} />
        </span>
        <span style={{ fontSize: 11, color: "rgba(232, 239, 233, 0.6)", marginTop: 4 }}>{shape.props.label}</span>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: MetricShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

class HoloShapeUtil extends ShapeUtil<HoloShape> {
  static override type = "sid-holo" as const;

  getDefaultProps(): HoloShape["props"] {
    return { w: 300, h: 230 };
  }

  getGeometry(shape: HoloShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  component(shape: HoloShape) {
    const holoFallback = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(circle at 50% 40%, rgba(94,230,255,0.18), transparent 70%)",
          color: "rgba(94, 230, 255, 0.7)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        3D preview
      </div>
    );
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(5, 7, 10, 0.9)",
          border: "1px solid rgba(94, 230, 255, 0.35)",
          boxShadow: "0 0 40px -12px rgba(94, 230, 255, 0.5)",
        }}
      >
        {hasWebGL() ? (
          <ShapeBoundary fallback={holoFallback}>
            <Canvas
              dpr={1}
              camera={{ position: [0, 0, 4.4], fov: 45 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: false }}
            >
              <HoloCore />
            </Canvas>
          </ShapeBoundary>
        ) : (
          holoFallback
        )}
        <span
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "rgba(94, 230, 255, 0.7)",
          }}
        >
          live three.js — on the whiteboard
        </span>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: HoloShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

/* NODES/ARROWS/FRAMES/PINS/METRICS/NOTES/TOUR live in ./blueprintData.ts —
 * shared with the 3D fly-through view so both stay in sync. */

const id = (s: string) => createShapeId(s);

function seed(editor: Editor) {
  const byKey = Object.fromEntries(NODES.map((n) => [n.key, n]));
  const shapes: TLShapePartial[] = [];

  for (const f of FRAMES) {
    shapes.push({ id: id(f.key), type: "frame", x: f.x, y: f.y, props: { w: f.w, h: f.h, name: f.name } });
  }

  for (const [a, b, color] of ARROWS) {
    const pa = centerOf(byKey[a]);
    const pb = centerOf(byKey[b]);
    shapes.push({
      id: id(`arrow-${a}-${b}`),
      type: "arrow",
      props: { start: { x: pa.x, y: pa.y }, end: { x: pb.x, y: pb.y }, color, dash: "dotted", size: "s" },
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

  for (const m of METRICS) {
    shapes.push({ id: id(m.key), type: "sid-metric", x: m.x, y: m.y, props: { w: 200, h: 112, value: m.value, label: m.label } });
  }
  shapes.push({ id: id("holo"), type: "sid-holo", x: 1620, y: 560, props: { w: 300, h: 230 } });

  for (const [i, note] of NOTES.entries()) {
    shapes.push({ id: id(`note-${i}`), type: "note", x: note.x, y: note.y, props: { color: note.color, size: "s", font: "mono", richText: toRichText(note.text) } });
  }

  editor.createShapes(shapes);

  // Screenshot pins need assets first.
  for (const p of PINS) {
    const assetId = AssetRecordType.createId();
    editor.createAssets([
      AssetRecordType.create({
        id: assetId,
        type: "image",
        props: { src: p.src, w: p.w * 3, h: p.h * 3, mimeType: p.mime, name: p.key, isAnimated: p.animated },
      }),
    ]);
    editor.createShape({ id: id(p.key), type: "image", x: p.x, y: p.y, rotation: p.rot, props: { assetId, w: p.w, h: p.h } });
  }

  editor.zoomToFit({ animation: { duration: 400 } });
  editor.selectNone();
}

/* zoomToFit/zoomToBounds divide by the viewport's screen size. Called too early
 * (before the flex layout has given the Tldraw container its final size), that
 * size is 0 and the ratio clamps to tldraw's zoom-step extremes (0.05 or 8) —
 * a camera position miles from any shape that then gets persisted to IndexedDB
 * and restored, blank, on every later visit. Wait for a real viewport first. */
function whenViewportReady(editor: Editor, cb: () => void, framesLeft = 30) {
  const { width, height } = editor.getViewportScreenBounds();
  if ((width > 0 && height > 0) || framesLeft <= 0) {
    cb();
    return;
  }
  requestAnimationFrame(() => whenViewportReady(editor, cb, framesLeft - 1));
}

const shapeUtils = [MetricShapeUtil, HoloShapeUtil];

/** The tldraw whiteboard view — draw, drag, leave a note, all persisted locally.
 *  Reacts to `tourStop`/`resetTick` from the shared header instead of owning
 *  its own tour/reset controls, so both views can be driven by one toolbar. */
export default function SketchBoard({ tourStop, resetTick }: { tourStop: number; resetTick: number }) {
  const editorRef = useRef<Editor | null>(null);
  const lastResetTick = useRef(resetTick);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || tourStop === -1) return;
    const [x, y, w, h] = TOUR[tourStop].bounds;
    editor.zoomToBounds(new Box(x, y, w, h), { animation: { duration: 900 }, targetZoom: 1 });
  }, [tourStop]);

  // Re-seed in place: clear the current page, drop the persisted DB, reseed.
  // Recovers a blanked/half-loaded canvas without a full reload where possible.
  useEffect(() => {
    if (resetTick === lastResetTick.current) return;
    lastResetTick.current = resetTick;
    (async () => {
      const editor = editorRef.current;
      if (editor) {
        try {
          const ids = [...editor.getCurrentPageShapeIds()];
          if (ids.length) editor.deleteShapes(ids);
          seed(editor);
          return;
        } catch {
          /* fall through to the hard reset */
        }
      }
      await clearBlueprintPersistence();
      window.location.reload();
    })();
  }, [resetTick]);

  return (
    <Tldraw
      persistenceKey={PERSISTENCE_KEY}
      shapeUtils={shapeUtils}
      onMount={(editor) => {
        editorRef.current = editor;
        editor.user.updateUserPreferences({ colorScheme: "dark" });
        whenViewportReady(editor, () => {
          try {
            if (editor.getCurrentPageShapeIds().size === 0) seed(editor);
            else editor.zoomToFit();
          } catch {
            // A corrupt restore can throw here; a fresh seed is the recovery.
            try {
              seed(editor);
            } catch {
              /* the RoomBoundary / Reset button is the last resort */
            }
          }
        });
      }}
    />
  );
}
