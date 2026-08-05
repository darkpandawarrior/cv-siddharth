/**
 * Editorial primitives — the scroll spine.
 *
 * The site had one texture: section-header + card grid, repeated. These give a
 * page a *rhythm* instead: a chapter marker you can't miss, a title row that
 * files itself, a brief that reads like a case study, and a closing CTA the
 * size of the promise. Absorbed from smit.fyi's editorial pacing and rebuilt
 * in the SID//OS dark system (ghost words, not black-on-white slabs).
 *
 * Motion is CSS-native scroll-driven animation (`animation-timeline: view()`),
 * so there is no scroll listener, no rAF loop, and no JS on the scroll path.
 * Browsers without it get the static composition, which still reads correctly.
 */
/**
 * Full-bleed oversized chapter marker, sitting in the seam between two
 * sections. Breaks the card-grid monotony and tells you, unmistakably, that a
 * new movement started. Drifts horizontally against the scroll — a parallax
 * marquee, not a static slab.
 *
 * Purely decorative: it *echoes* the section's own <h2> rather than replacing
 * it, so the accessible outline is unchanged and the legible heading keeps its
 * contrast. Hence aria-hidden — screen readers should not hear the word twice.
 */
export function ChapterWord({ children }: { children: string }) {
  return (
    <div className="chapter-word-wrap" aria-hidden>
      {/* SVG, not a styled <div>. Two reasons, both real:
          1. `textLength` + `lengthAdjust` makes every chapter word span the
             same width regardless of how many letters it has, which is what
             makes a run of them read as a set rather than as ragged headings.
          2. As DOM text this is a giant near-ink word on ink — axe flags it
             (serious, color-contrast) and it deserves to be flagged, because
             an automated check can't tell decorative type from content. As an
             SVG graphic it's classified as what it actually is. */}
      <svg className="chapter-word" viewBox="0 0 1000 132" preserveAspectRatio="xMidYMid meet" focusable="false">
        <text x="500" y="106" textAnchor="middle" textLength="985" lengthAdjust="spacingAndGlyphs">
          {children}
        </text>
      </svg>
    </div>
  );
}

/**
 * The closing ask, sized like it matters. A full-bleed pill whose accent fill
 * wipes in from the left on hover — the arrow leads, the fill follows.
 */
export function GiantCTA({
  label,
  onClick,
  href,
  sub,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  sub?: string;
}) {
  const body = (
    <>
      <span className="giant-cta-label">{label}</span>
      <span className="giant-cta-arrow" aria-hidden>
        →
      </span>
      <span className="giant-cta-fill" aria-hidden />
    </>
  );
  // No `reveal` class here: that only becomes visible once the Reveal
  // component's IntersectionObserver adds `.revealed`, and this renders inside
  // callers that already wrap it. Wearing the class without the observer left
  // the button permanently at opacity 0.
  return (
    <div>
      {href ? (
        <a className="giant-cta" href={href}>
          {body}
        </a>
      ) : (
        <button type="button" className="giant-cta" onClick={onClick}>
          {body}
        </button>
      )}
      {sub && <p className="giant-cta-sub">{sub}</p>}
    </div>
  );
}
