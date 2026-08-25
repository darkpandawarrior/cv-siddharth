/**
 * The craft record for The Morkinstar Journals, as facts rather than as
 * fiction. This is the room the leak-doctrine ruling built on 2026-08-25
 * after an audit found production process printed inside the lore: a note on
 * /canon conceding "that was the prompting, not the model", a Sources list
 * whose links opened on the working bibles, and a machine tag left at the
 * end of a published story.
 *
 * THE SPEAKER TEST decides where a sentence ships. Standing inside the
 * world, it ships on a fiction surface. Standing outside it, as the author,
 * the pipeline, or a critic describing the work from beside it, it ships
 * HERE instead. /making is the one surface this site owns that is allowed
 * to have an author, so nothing below needs disguising.
 *
 * Every fact is lifted verbatim or near-verbatim from files in the-loopdown
 * (`fiction/morkinstar-journals/`), never written fresh:
 *   council-s2-2026-08-15.md  the Season Two ownership audit and its table
 *   SESSION-LOG-2026-08-15.md  the build log: the kills, the art passes, the spend
 *   s4-bible.md                the Miéville fence, quoted in full below
 *   bible.md                   the voice rules
 *   interloop.md                the retroaction standard
 *
 * SPOILER GATE. Some of this describes how a season works before a reader
 * gets there, which is exactly what /canon already gates behind a declared
 * `spoils` string and a closed <details>. This file reuses that same field
 * on the two seasons that already declare one (`SEASON_CANON[2].spoils`,
 * `SEASON_CANON[3].spoils`, imported by the route rather than copied) and
 * authors one more for the Season Four material, which has not shipped a
 * single entry yet and so has no entry in that registry at all.
 *
 * NODE-IMPORTABILITY is not required here the way it is for surfaces.ts, but
 * this file stays plain data with no React for the same reason canonLore.ts
 * does: the route holds layout, this holds facts, and the two are easy to
 * keep in step only when neither is doing the other's job.
 */

/** One premise the blind cross-lab audit named as somebody else's, and what happened to it. */
export interface KillRecord {
  premise: string;
  namedAs: string;
  fate: "killed" | "rebuilt";
}

/**
 * Season Two's slate, before the audit. Ten premises went in, this table is
 * the six the audit failed. Copied from council-s2-2026-08-15.md's own table.
 */
export const S2_AUDIT_KILLS: KillRecord[] = [
  {
    premise: "The Unwritten",
    namedAs: "Borges' Pierre Menard, Charles Yu, Severance. Also a Mike Carey comic title.",
    fate: "killed",
  },
  {
    premise: "The Second Fire",
    namedAs: "A Canticle for Leibowitz, named by two labs as that novel's skeleton.",
    fate: "killed",
  },
  {
    premise: "The Handing",
    namedAs: "The Giver, called the exact plot, and American Gods season three.",
    fate: "killed",
  },
  {
    premise: "A Death Among The Fourteen",
    namedAs: "American Gods, named independently by two labs.",
    fate: "rebuilt",
  },
  {
    premise: "The Paradise Clause",
    namedAs: 'Omelas, two labs, one line: "Omelas, but nobody is being tortured."',
    fate: "killed",
  },
  {
    premise: "Ask Them To Change It",
    namedAs: "Fables (called a foundational premise), Animal Man, Pirandello, Redshirts.",
    fate: "killed",
  },
];

/** The note that survived contact with the audit and became the season. */
export const S2_MISSING_BEAT =
  "Cendre burns its archive because the monster IS the archive. The narrator is building his own archive. Each page he writes should make him MORE Concluded, not less.";

/** The negative control: proof the audit detects real borrowing rather than pattern matching everything. */
export const S2_NEGATIVE_CONTROL =
  "Nobody named Assassination Classroom for the god who announced his own end date.";

/** Season Three's first design, killed whole before a page of it was written. */
export const S3_FIRST_DESIGN = {
  premise: "Fourteen entries, fourteen different authors, each one writing into his case.",
  findings: [
    {
      title: "Pre owned",
      note: 'Named, more than once: "literally the margin notes premise of S. Ship of Theseus." Also Hyperion, World War Z, Illuminae, House of Leaves.',
    },
    {
      title: "It defanged the monster",
      note: 'Many hands means the archive stops being a self portrait, so Skerrin cannot eat it. "If the solution to your cosmic horror is get your friends to co sign your diary, you have utterly defanged the central threat."',
    },
    {
      title: "It traded one fatigue for a worse one",
      note: "A thousand words per narrator is not enough to care about anyone, and it throws away the one asset the season had built: readers who had become co conspirators in his cadence.",
    },
  ],
  replacement:
    "Found by rereading Season One canon and discovering the Væhn ritual was backwards. They are not safe because many children write the pages. They are safe because every ninth generation they burn everything. He copied the slots and the never written rule, and left behind the only part that works.",
};

/**
 * The Season Four frame, and the fence the audit forced. Season Four has not
 * shipped a single entry, which is why this is the one item here with no
 * season number to borrow a `spoils` string from.
 */
export const S4_FENCE = {
  named: "China Miéville's The City & The City",
  finding:
    "Named at frame level, repeatedly, independently, by a blind seven lab audit. Not dismissible as pattern matching: it landed on the frame rather than on the furniture.",
  quote:
    "That book is about people who can see each other and are forbidden to. It requires a taboo, a transgression, and a police force. This season is ten thousand species who cannot see each other and are sold a utility. There is no prohibition. No transgression is possible. The failure mode is not breach, it is a billing tier.",
};

/** The method the audit runs on, stated once, generally, because it applied to all three seasons above. */
export const AUDIT_METHOD = {
  send: "Send the premises to seven labs, none of them Anthropic, with no context about what inspired anything, and ask them to name the source.",
  gate: "If a different training family can name it unaided, ownership failed.",
  whyNotSelfAssessed:
    "It cannot be self assessed. An author cannot see what he metabolised, and a same family panel shares too much of the same distribution to be a reliable detector of it.",
  summary: "It killed six of the first ten Season Two premises, and an entire first design for Season Three.",
};

/**
 * What was wrong with the first ten portraits, and the two fixes it actually
 * took. Deliberately no per-pass dollar figure here: SESSION-LOG-2026-08-15.md
 * prices the first set at $1.4014 and the redrawn set at $1.2673, which is
 * real and sourced but does not reduce cleanly to the single art total in
 * `SPEND` below (that figure nets out a wasted probe and a diagnostic run
 * this page does not itemise). Printing both would put two true, unreconciled
 * dollar amounts on the one page whose whole subject is not doing that.
 */
export const PORTRAIT_ITERATIONS = {
  firstSet: {
    verdict: "Ten humans in period costume. Superseded before it shipped.",
  },
  firstFix:
    "The fix was not to draw stranger looking people. It was The Rendering, now series level canon: nothing in this anthology ever arrived as a photograph. Everything came through a translation rig that the correspondent argues with, and a Directory form filled in by an institution whose habit is pressing a familiar shape onto whatever it files. A rendering can hold, strain, fail, or refuse, and the correspondent himself was never given a body at all.",
  secondDefect:
    "The redrawn portraits still shipped with a defect a verify pass missed: a hard rectangle around each figure that read, at thumbnail size, as a pasted grey box on the dark plates. A radial feather mask was already in the code and faded nothing, because a gradient fit to a box's own bounding coordinates is an ellipse matched to that box: it reaches the edge midpoints and still sits well short of the corners.",
  theFix:
    "The real fix was a flat field matte: blur the greyscale heavily for a local estimate of the paper's own tone at every pixel, subtract it, and what remains is ink density alone, pushed into alpha. The paper stops being something to disguise and simply isn't there.",
  trap: 'One SVG trap worth keeping. `feComposite operator="arithmetic"` runs on the alpha channel too, so the obvious `paper - grey` zeroes alpha across the whole interior: the drawing vanishes and only the blurred boundary survives. Written as `paper + (1 - grey) - 1` the RGB result is identical and alpha stays 1 inside the drawing, 0 outside it.',
};

/** The house voice rules, inherited from the 2021 source story and held to on every entry since. */
export const VOICE_CONSTRAINTS: string[] = [
  'Opens "Greetings again, my dear readers." Signs off "This is Lu\'kifær Morkinstar concluding Journal Entry #NNNN, Series N of M from the X System."',
  'The disclaimer recurs almost word for word: "Is there truth in their legend? No one knows. My aim is never to prove or disprove the tales I come across. Just to report them to you, my dear readers."',
  "A Terminologies block at the foot of every entry, and the joke lives in the parenthetical Fun Planet Fact boxes.",
  "No em dashes anywhere in body prose, ever. Full stops, commas, colons, parentheses. House rule from voice/voice-profile.md, and the 2021 original already obeyed it.",
];

/** The pipeline a markdown file in the-loopdown becomes a rendered entry through. */
export const PIPELINE_STAGES: { step: string; detail: string }[] = [
  {
    step: "The source",
    detail:
      "One markdown file per entry in the-loopdown's fiction/morkinstar-journals/, frontmatter plus body, written and voice checked before anything downstream touches it.",
  },
  {
    step: "The registry",
    detail: "build-registry.mjs scans the directory and assembles the corpus registry the other scripts read from.",
  },
  {
    step: "The art",
    detail:
      "morkinstar-art.mjs, morkinstar-plates.mjs and morkinstar-illustrations.mjs generate the sigils, the field plates and the witness portraits as build time SVG and composited raster.",
  },
  {
    step: "The site",
    detail:
      "morkinstar-site.mjs assembles a local preview (gitignored, rebuildable on demand). The generated corpus is exported into cv-siddharth's src/data/anthology.ts, which /anthology, /canon and /read/$slug all render from.",
  },
];

/** The rule from interloop.md that keeps future seasons honest about what they claim to reframe. */
export const RETROACTION_STANDARD =
  "Retroactions are found in shipped text during drafting, or they are retcons and are cut. No future season may be designed by asking what it can reframe. Each one that made it in was discovered on a page that already existed, not planned in ahead of it.";

/**
 * The measured spend, stated once, honestly, and it took two goes to state it
 * honestly.
 *
 * The first version of this block carried 1.65 as the project total, which is
 * the figure from the second build session alone. SESSION-LOG-2026-08-15.md
 * itemises the first session separately and its two portrait passes come to
 * 2.6687 on their own, so the page would have printed one total sitting next to
 * sourced line items that already exceeded it. Reconciled against the key
 * balance rather than against either document: 83.5973 to 81.9447 across the
 * second session is 1.6526, and the log's own total for the first is ~3.03.
 *
 * Both numbers were true. Neither was the project.
 */
export const SPEND = {
  totalUsd: 4.68,
  firstBuildUsd: 3.03,
  secondBuildUsd: 1.65,
  auditsUsd: 0.32,
  artUsd: 4.2,
  note: "The audits are the best money spent in the whole project, because they are the only spend that killed things before they shipped.",
};

/** Receipts. The one place on this site allowed to point at a working file instead of a rendered page. */
export const RECEIPTS: { label: string; href: string }[] = [
  {
    label: "SESSION-LOG-2026-08-15.md, the full build log",
    href: "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/SESSION-LOG-2026-08-15.md",
  },
  {
    label: "council-s2-2026-08-15.md, the Season Two ownership audit",
    href: "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/council-s2-2026-08-15.md",
  },
  {
    label: "s4-bible.md, the Miéville fence in full",
    href: "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/s4-bible.md",
  },
  {
    label: "interloop.md, the retroaction standard",
    href: "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/interloop.md",
  },
];
