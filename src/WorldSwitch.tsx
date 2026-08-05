import { Link } from "@tanstack/react-router";

/**
 * The site's top-level mechanic: two worlds, one switch.
 *
 * The nav used to carry seven section anchors plus four route links plus a
 * palette plus a CTA, and the homepage carried every section in one 14,000px
 * scroll. Both problems have the same cause — one surface pretending to be the
 * whole site. So the site is now two: **The Build** (Android, KMP, the case
 * studies, the numbers) and **The Ink** (the magazine years, the archive).
 *
 * The switch is the only navigation that stays constant across both, which is
 * what makes it read as a place-switch rather than a link. Everything else in
 * each world's bar belongs to that world.
 */
export function WorldSwitch({ current }: { current: "build" | "ink" }) {
  return (
    <div className="world-switch" role="group" aria-label="Switch world">
      <Link
        to="/"
        aria-current={current === "build" ? "page" : undefined}
        className={`world-switch-side ${current === "build" ? "is-current" : ""}`}
      >
        <span className="world-switch-label">Build</span>
        <span className="world-switch-sub">android · kmp</span>
      </Link>
      <span className="world-switch-seam" aria-hidden />
      <Link
        to="/ink"
        aria-current={current === "ink" ? "page" : undefined}
        className={`world-switch-side world-switch-ink ${current === "ink" ? "is-current" : ""}`}
      >
        <span className="world-switch-label">Ink</span>
        <span className="world-switch-sub">the writing years</span>
      </Link>
    </div>
  );
}
