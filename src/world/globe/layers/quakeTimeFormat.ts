// data.md finding #3: the quake Inspector card's Time row was relative-only
// ("3 min ago"), the one timestamp on the page with no absolute pairing —
// the top HUD clock and the reach snapshot both show an absolute stamp
// beside the relative one. Pure logic in its own *.ts (house style: render
// code in the *.tsx, pure math colocated and independently testable).
import { formatTimeAgo } from "./quake.ts";

// `en-GB` + `timeZone: "UTC"` matches TimeScrubber.tsx's own `fmtCompact`
// formatter (the established "HH:MM, explicit zone" shape already on this
// page) — UTC specifically, since that is the zone the top HUD clock pairs
// with IST.
function formatAbsoluteUtc(eventMs: number): string {
  return `${new Date(eventMs).toLocaleString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC`;
}

/** "3 min ago · 19:19 UTC" — relative age plus the wall-clock instant it
 *  refers to, so a visitor never has to guess what zone "3 min ago" is
 *  relative to. */
export function formatQuakeTime(nowMs: number, eventMs: number): string {
  return `${formatTimeAgo(nowMs, eventMs)} · ${formatAbsoluteUtc(eventMs)}`;
}
