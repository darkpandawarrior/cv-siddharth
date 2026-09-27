/**
 * The v1 to v2 carry-over: explored-room coverage (master-plan.md#M6; v1's
 * `Hud.tsx` "N / totalRooms" gauge, read from `explored.ts`/`progress.ts`).
 *
 * v1's `World.tsx` marks a room explored the instant its own in-world dwell
 * mechanism navigates into it — a hook this lane cannot reuse without
 * editing `WorldV2.tsx`/`LandmarkPanelV2.tsx` (neither owned here; the same
 * ownership boundary `GpsLens.tsx`'s and `Garlands.tsx`'s own doc comments
 * hit). What v2 CAN do, and what this file does, is the router-level half
 * of the same fact: `markExplored` only ever needs "this route was
 * visited", and that is true regardless of which path — v1's world, v2's
 * world, or a direct link — got the visitor there. Watching
 * `@tanstack/react-router`'s own location (the same hook `SiteFooter.tsx`
 * already reads) makes this HUD layer a genuine second write path onto the
 * exact same `playground:explored` localStorage key v1 uses, not just a
 * read-only mirror of it.
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import { useRouterState } from "@tanstack/react-router";
import { loadExplored, markExplored } from "../../explored.ts";
import { ROOMS } from "../../../rooms.tsx";

export const layer = { id: "explored", order: 58 };

const ROOM_ROUTES = new Set(ROOMS.map((r) => r.to));

export default function Explored(): JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [explored, setExplored] = useState<ReadonlySet<string>>(() => new Set(loadExplored()));

  useEffect(() => {
    if (!ROOM_ROUTES.has(pathname)) return;
    markExplored(pathname);
    setExplored(new Set(loadExplored()));
  }, [pathname]);

  const total = useMemo(() => ROOMS.length, []);

  return <span className="sr-only" aria-hidden="true" data-explored-count={explored.size} data-explored-total={total} />;
}
