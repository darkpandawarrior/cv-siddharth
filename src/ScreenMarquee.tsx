import { Picture } from "./Picture.tsx";

/**
 * Full-bleed screen marquee — the band of real app screens that runs edge to
 * edge directly under a case-study header, bleeding off both sides.
 *
 * It exists because the project pages opened on a screen of pure text: three
 * columns of prose and nothing to look at until well past the fold. A case
 * study should show you the thing in the first breath.
 *
 * The scroll is a CSS animation over a duplicated track (the classic marquee:
 * render the row twice, translate by exactly -50%, so the seam is invisible),
 * which keeps it off the main thread entirely. It pauses on hover and on
 * focus-within, and reduced motion turns it into a plain horizontal scroller
 * the reader drives themselves.
 */
export function ScreenMarquee({ screens, alt }: { screens: string[]; alt: string }) {
  if (screens.length === 0) return null;
  // Hard cap. Doori's gallery is 90 shots; duplicating that for the loop put
  // 128 <img> in a band nobody reads, all of them fetched. Ten is enough to
  // fill a wide viewport, and every screen is still in the gallery below.
  let row = screens.slice(0, 10);
  // Below ~8 the duplicated track is shorter than a wide viewport and the seam
  // snaps visibly. Repeat the (short) set until it covers.
  const base = row;
  while (row.length < 8) row = [...row, ...base];

  return (
    <div className="screen-marquee" aria-hidden>
      <div className="screen-marquee-track">
        {[0, 1].map((copy) => (
          <div className="screen-marquee-row" key={copy}>
            {row.map((src, i) => (
              <div className="screen-marquee-item" key={`${copy}-${src}-${i}`}>
                {/* Sizing lives in .screen-marquee-item img — a Tailwind `h-full w-full
                    object-cover` here is what forced every landscape capture into a phone
                    crop, and utilities sit in @layer utilities where specificity alone
                    would not reliably beat them back. */}
                <Picture src={src} alt="" />
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* The images are decorative here — every one of them appears again, with
          a caption and a lightbox, in the gallery further down the page. The
          band is the poster, not the content. */}
      <span className="sr-only">{alt}</span>
    </div>
  );
}
