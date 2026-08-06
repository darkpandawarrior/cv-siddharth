/**
 * Prints all three cuts of /resume to PDF.
 *
 * These PDFs used to be made by hand — open the page, hit the browser's print
 * dialog, save. That is why the copies in ~/Downloads, career-ops/output and
 * the interview-coach materials all drifted apart and went stale: three
 * artefacts, three separate acts of remembering. This makes it one command.
 *
 *   npm run preview           # in another shell — Playwright needs the served app
 *   npm run resume:pdf
 *
 * The filenames are the ones claim-audit already tracks as employer-facing
 * surfaces (_1PAGE / _FULL / _SUPERFULL), so renaming them would silently drop
 * those surfaces out of the audit. _FULL is the two-pager — the usual send —
 * and _SUPERFULL is the complete record, which has no page budget by design.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const BASE = process.env.RESUME_BASE_URL || "http://localhost:4173";
const OUT = resolve(process.argv[2] || "dist/resume");
mkdirSync(OUT, { recursive: true });

// Page budgets are asserted, not hoped for: a "1PAGE" file that quietly runs
// to two pages is worse than a build failure, because it gets sent.
const CUTS = [
  { name: "Resume_Siddharth_Pandalai_2026_ANDROID_1PAGE", path: "/resume?cut=one", maxPages: 1 },
  { name: "Resume_Siddharth_Pandalai_2026_ANDROID_FULL", path: "/resume?cut=two", maxPages: 2 },
  { name: "Resume_Siddharth_Pandalai_2026_ANDROID_SUPERFULL", path: "/resume", maxPages: Infinity },
];

// Chromium writes no page count into the PDF trailer we can cheaply read, so
// measure the laid-out height against the A4 content box instead: 273mm tall
// at 12mm margins, 1032px at 96dpi.
const PAGE_PX = 1032;

const browser = await chromium.launch();
// The viewport is sized to the A4 content box and the media forced to print so
// the height we measure is the height Chromium will paginate. Measuring the
// screen layout instead reports a document that fits and then prints long.
const page = await browser.newPage({ viewport: { width: 703, height: PAGE_PX } });
await page.emulateMedia({ media: "print" });
let failed = false;

for (const cut of CUTS) {
  const url = `${BASE}${cut.path}`;
  await page.goto(url, { waitUntil: "networkidle" });
  // The route is client-rendered, so waiting on the article beats a timeout.
  await page.waitForSelector("article.resume");
  const file = `${OUT}/${cut.name}.pdf`;
  await page.pdf({
    path: file,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
  });
  // A résumé that renders zero experience bullets still produces a valid PDF,
  // so check the content, not the exit code — this is the whole point of
  // generating rather than hand-printing.
  const bullets = await page.locator("article.resume section li").count();
  if (bullets === 0) {
    console.error(`  !! ${cut.name}: rendered no experience bullets — not shipping this`);
    failed = true;
  }
  // Prefer the page count Chromium actually wrote. The CSS-height estimate
  // below models `break-inside-avoid` but not Chromium's exact box rounding,
  // and it was off by one page on a document that really did fit — close
  // enough to guide layout work, not close enough to fail a build on.
  const { pages, source } = pageCount(file) ?? { pages: await estimatePages(page), source: "estimated" };
  if (pages > cut.maxPages) {
    console.error(`  !! ${cut.name}: ${pages} pages (${source}), budget is ${cut.maxPages}`);
    failed = true;
  }
  console.log(`${cut.name}: ${bullets} bullets, ${pages}p ${source} -> ${file}`);
}

/** True page count via poppler's pdfinfo, or null when it isn't installed. */
function pageCount(file) {
  try {
    const out = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const m = out.match(/^Pages:\s*(\d+)/m);
    return m ? { pages: Number(m[1]), source: "measured" } : null;
  } catch {
    return null;
  }
}

/**
 * Pages the browser will actually emit, accounting for `break-inside-avoid`:
 * a block that would straddle a boundary is pushed whole to the next page, and
 * that pushed whitespace is what turns a 2.05-page document into three.
 */
async function estimatePages(page) {
  return page.evaluate((PAGE) => {
    const art = document.querySelector("article.resume");
    const top = art.getBoundingClientRect().top + window.scrollY;
    let shift = 0;
    for (const el of art.querySelectorAll(".break-inside-avoid")) {
      const r = el.getBoundingClientRect();
      const y = r.top + window.scrollY - top + shift;
      const startPage = Math.floor(y / PAGE);
      if (Math.floor((y + r.height - 1) / PAGE) !== startPage) shift += (startPage + 1) * PAGE - y;
    }
    return Math.ceil((art.getBoundingClientRect().height + shift) / PAGE);
  }, PAGE_PX);
}

await browser.close();
if (failed) process.exit(1);
