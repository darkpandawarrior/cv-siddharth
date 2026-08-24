import { useEffect, useMemo, useRef, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4 } from "three";
import { declutter, falloff, project, worldLabels, type Candidate } from "./labels.ts";

/**
 * The world's floating text, drawn as ONE DOM layer over the canvas.
 *
 * Not drei's `<Html>`, which is what the three systems this replaces each
 * used. `<Html>` is a per-label React portal with its own transform, which is
 * fine for one caption and wrong for twenty-seven: there is no frame at which
 * anything can see all of them at once, so no label can ever know it is
 * sitting on top of another one, and the pile-up around the horizon was
 * structural rather than a tuning mistake. Projecting them here, together,
 * every frame is what makes the declutter pass in labels.ts possible at all.
 *
 * The split below is the same one telemetry.ts already draws through this
 * world: an in-canvas component publishes camera state to a plain mutable
 * singleton, and a DOM component reads it in its own rAF loop and writes
 * straight to style properties. React mounts these nodes once and never
 * renders them again — a label layer that re-rendered at 60fps would drag
 * World, Hud and every memo boundary under them along with it.
 */

/** Camera state, published every frame from inside the Canvas. Mutable and
 *  shared for the same reason `telemetry` and `input` are. */
const labelCamera = {
  /** Column-major view-projection matrix. */
  matrix: new Float64Array(16),
  width: 0,
  height: 0,
  ready: false,
};

/** Mounts INSIDE <Canvas>. Renders nothing; exists to publish the matrix. */
export function LabelCameraBridge(): null {
  const { camera, size } = useThree();
  const vp = useMemo(() => new Matrix4(), []);
  useFrame(() => {
    camera.updateMatrixWorld();
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    labelCamera.matrix.set(vp.elements);
    labelCamera.width = size.width;
    labelCamera.height = size.height;
    labelCamera.ready = true;
  });
  useEffect(
    () => () => {
      // A stale matrix outliving the canvas would leave the DOM layer drawing
      // labels for a scene that no longer exists, in the frames between the
      // Canvas unmounting and this layer following it.
      labelCamera.ready = false;
    },
    [],
  );
  return null;
}

/** Mounts OUTSIDE <Canvas>, as an overlay sibling. */
export function WorldLabels({ targetTo }: { targetTo: string | null }): JSX.Element {
  const labels = useMemo(worldLabels, []);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  // Read inside the frame loop, which must not close over a stale value —
  // targetTo changes ~8 times a session and the loop is mounted once.
  const targetRef = useRef(targetTo);
  targetRef.current = targetTo;

  useEffect(() => {
    let raf = 0;
    const candidates: Candidate[] = [];
    const visible = new Set<number>();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!labelCamera.ready) return;
      candidates.length = 0;

      for (let i = 0; i < labels.length; i++) {
        const node = nodes.current[i];
        if (!node) continue;
        const label = labels[i];
        const screen = project(labelCamera.matrix, label.position, labelCamera.width, labelCamera.height);
        if (!screen) continue;
        const { opacity, scale } = falloff(label.kind, screen.depth);
        if (opacity <= 0.02) continue;
        // The node keeps its layout size even while hidden (visibility, not
        // display), so offsetWidth is always a real measurement rather than 0
        // on the frame a label comes back into range.
        candidates.push({
          index: i,
          kind: label.kind,
          x: screen.x,
          y: screen.y,
          depth: screen.depth,
          width: node.offsetWidth * scale,
          height: node.offsetHeight * scale,
        });
        // Stashed on the candidate's node now so the draw pass below doesn't
        // recompute the falloff for the survivors.
        node.dataset.opacity = String(opacity);
        node.dataset.scale = String(scale);
      }

      const drawn = declutter(candidates);
      visible.clear();
      for (const index of drawn) visible.add(index);

      for (const c of candidates) {
        const node = nodes.current[c.index];
        if (!node) continue;
        if (!visible.has(c.index)) continue;
        const scale = Number(node.dataset.scale ?? 1);
        node.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        node.style.opacity = node.dataset.opacity ?? "1";
        node.style.visibility = "visible";
      }
      for (let i = 0; i < labels.length; i++) {
        const node = nodes.current[i];
        if (node && !visible.has(i)) node.style.visibility = "hidden";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [labels]);

  return (
    // aria-hidden: the canvas this sits over is already hidden from the
    // accessibility tree (World.tsx), and every room named here is a real link
    // in the sr-only room grid Playground.tsx renders alongside the world.
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {labels.map((label, i) => {
        const isTarget = label.to !== undefined && label.to === targetTo;
        return (
          <div
            key={label.id}
            ref={(el) => {
              nodes.current[i] = el;
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              visibility: "hidden",
              willChange: "transform, opacity",
              borderColor: isTarget ? label.tint : `${label.tint}55`,
              color: label.tint,
              background: isTarget ? "rgba(10,13,12,0.88)" : "rgba(10,13,12,0.6)",
              // A ring only on the room the HUD is currently pointing at, so
              // the waypoint chip and the thing it names are visibly the same
              // object rather than two unrelated pieces of UI.
              boxShadow: isTarget ? `0 0 0 1px ${label.tint}, 0 0 18px -4px ${label.tint}` : undefined,
            }}
            // §12 step 3 — was `rounded-full`: a pill reads as a chat bubble,
            // not as signage. A hairline-radius rectangular tag (Survey
            // Deck's "infrastructure signage grammar", per the doc's own
            // grafted-in credit) matches the stationing posts' baked
            // numerals and the ground's own seam geometry, which are all
            // rectangular — nothing else in this world is a rounded pill.
            className={`whitespace-nowrap rounded-[2px] border backdrop-blur ${
              label.kind === "room"
                ? "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em]"
                : "px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
            }`}
          >
            {label.text}
          </div>
        );
      })}
    </div>
  );
}
