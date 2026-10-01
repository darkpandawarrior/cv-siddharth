// data.md #1: LocalTraffic.tsx's inspector row used to render en-US grouping
// ("35,000 ft"), coincidentally identical to en-IN below 1 lakh feet but
// diverging above it. Pure logic in its own *.ts (house style: render code
// in the *.tsx, pure math colocated and independently testable) — also
// keeps LocalTraffic.tsx a components-only module for React Fast Refresh
// (react-refresh/only-export-components).
export function formatAltitude(altFt: number | null): string {
  return altFt !== null ? `${altFt.toLocaleString("en-IN")} ft (height x20 on GLOBE, not to scale)` : "unknown";
}
