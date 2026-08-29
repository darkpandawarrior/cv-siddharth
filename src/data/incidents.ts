/**
 * The incident ledger.
 *
 * Hand-kept on purpose — an incident is a judgement about what went wrong and
 * why, and no API produces that. Every entry below is real, is documented in
 * the repo (in a test's comment, a script's header, or a commit), and links to
 * the evidence rather than asking to be believed.
 *
 * The rule for adding one: it must be a failure that a green check did not
 * catch. Anything a test already fails on is not an incident, it is a test
 * doing its job. This ledger only records the times nothing went red.
 */
export type Incident = {
  id: string;
  /** The row above it that this incident is about. */
  subject: string;
  subjectHref: string;
  /** What actually happened, in one line. */
  what: string;
  /** Days from first occurrence to the fix landing. */
  days: number;
  resolved: boolean;
  /** Where a reader can check it. */
  evidenceHref: string;
};

export const incidents: Incident[] = [
  {
    id: "xfo-deny",
    subject: "X-Frame-Options: DENY",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/vercel.json",
    what: "DENY blocks same-origin framing too, so every live Wasm build was blank in production while passing in dev",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/vercelHeaders.test.ts",
  },
  {
    id: "refresh-red-8-days",
    subject: "refresh-media.yml",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/.github/workflows/refresh-media.yml",
    what: "one dead regex in the 5th generator; && short-circuited the 13 after it for eight consecutive days",
    days: 8,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/scripts/refresh.mjs",
  },
  {
    id: "chessdeep-29d",
    subject: "chessDeep.ts",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/chessDeep.ts",
    what: "29 days stale under a flat 45-day rule, with 16 more days of legal silence still to run",
    days: 29,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/freshnessSla.ts",
  },
  {
    id: "store-blind-spot",
    subject: "store.ts",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/store.ts",
    what: "5,150 lines stamped in a shape the freshness scanner did not match, so the alarm could not see it at all",
    days: 21,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/freshness.test.ts",
  },
  {
    id: "lfs-pointers",
    subject: "sync-project-media.mjs",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/scripts/sync-project-media.mjs",
    what: "raw.githubusercontent serves LFS pointers, not binaries, so six real images were overwritten with 130 bytes of text",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/assetIntegrity.test.ts",
  },
  {
    id: "sw-portfolio-app",
    subject: "sw.js bypass list",
    subjectHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/public/sw.js",
    what: "hand-kept list of three app names never learned about the fourth, routing 12 MB of Wasm through the worker",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/serviceWorker.test.ts",
  },
  {
    id: "mileway-46-36",
    subject: "Mileway module count",
    subjectHref: "https://cv-siddharth.vercel.app/project/mileway",
    what: "the card printed 46 and 36 modules 30px apart; the audited definition was applied to PaymentsLab but not Mileway",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/statusDrift.test.ts",
  },
  {
    id: "kursi-13-14",
    subject: "Kursi module count",
    subjectHref: "https://cv-siddharth.vercel.app/project/kursi",
    what: "a :cli module landed upstream and the hand-written status line went stale the same day",
    days: 2,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/Kursi/commits/main/settings.gradle.kts",
  },
  {
    id: "blueprint-3-of-8",
    subject: "The Blueprint Room",
    subjectHref: "https://cv-siddharth.vercel.app/blueprint",
    what: "a canvas captioned 'every arrow is real' showed 3 of 8 writing series and omitted this site entirely",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/blueprintContent.test.ts",
  },
  {
    id: "deadlock-pck",
    subject: "DEADLOCK web export",
    subjectHref: "https://cv-siddharth.vercel.app/project/deadlock",
    what: "310 MB export: all_resources shipped 29 unreferenced models and every texture imported lossless",
    days: 0,
    resolved: true,
    evidenceHref: "https://cv-siddharth.vercel.app/deadlock-app/index.html",
  },
  {
    id: "cardmedia-six-of-eight",
    subject: "project card banners",
    subjectHref: "https://cv-siddharth.vercel.app/#projects",
    what: "a hand-written map of six slugs while the generator rendered a banner for all eight",
    days: 0,
    resolved: true,
    evidenceHref: "https://github.com/darkpandawarrior/cv-siddharth/blob/main/src/data/cardMedia.test.ts",
  },
];
