/**
 * Before the code — the two MANIT societies, what I published in them, and the
 * three profiles the board wrote *about* me.
 *
 * Those last three are the point of this file. Every year the Editorial Board
 * closes the magazine with EB Profiles: each member gets a question, and a
 * teammate answers it in that member's voice. They are affectionate parodies,
 * and across 2019-21 they are the only outside record of how a team actually
 * experienced working with me. A CV says what I shipped; these say what I was
 * like to sit next to at 2am before a print deadline.
 *
 * They feed both the site and the AI assistant's system prompt — the assistant
 * should know the difference between the résumé voice and this one.
 *
 * Verification: every page number here was checked by reading the rendered
 * page, not by trusting OCR (the PDFs have no text layer). `page` is the PDF
 * page index the reader addresses. 2019 and 2021 print at offset 0; 2020
 * prints at -2 (PDF p36 is printed p34).
 */

export interface Society {
  name: string;
  role: string;
  years: string;
  blurb: string;
  links: { label: string; url: string }[];
}

export const societies: Society[] = [
  {
    name: "Editorial Board, MANIT",
    role: "English Editor → Joint Chief Editor",
    years: "2018–2021",
    blurb:
      "The institute's student media body, publishing Excelsior since 1963. Three editions on the board; Joint Chief Editor and Chief English Editor on the last one.",
    links: [
      { label: "Read Excelsior", url: "/excelsior" },
      { label: "Instagram", url: "https://www.instagram.com/editorialboardmanit/" },
      { label: "Blog", url: "https://edboardmanit.wordpress.com/" },
    ],
  },
  {
    name: "Drishtant",
    role: "Online Content Secretary → Online Content Head",
    years: "2018–2021",
    blurb:
      "MANIT's oldest (and only) English literary society. Ran the society blog and its online content, and published the D Buzz newsletter — the guide handed to every incoming batch.",
    links: [
      { label: "D Buzz 2019 (PDF)", url: "https://drishtantnitbhopal.wordpress.com/wp-content/uploads/2022/01/d-buzz-2019.pdf" },
      { label: "Blog", url: "https://drishtantnitbhopal.wordpress.com/" },
    ],
  },
];

/**
 * The EB Profiles pieces — written about me, by the board, in my own voice.
 * `quote` is verbatim from the page; keep it that way.
 */
export interface BoardProfile {
  year: string;
  page: number;
  title: string;
  role: string;
  question: string;
  quote: string;
  /** The stage direction the piece closes on — the sharpest line in each. */
  direction: string;
  gloss?: string;
}

export const boardProfiles: BoardProfile[] = [
  {
    year: "2019",
    page: 141,
    title: "Most Pseudo Intellectual Ever",
    role: "English Editor",
    question: "What's your new year resolution?",
    quote:
      "Do you mean Re; Solution? I bought that for my hair. It's shiz only intellectuals understand. I plan to paint my hair yellow and visit every eatery with my NRI squad. Also, I plan to learn how to ride a bike and enhance my collection of nerve-wrenching puns.",
    direction: "RHM: Rapid Hand Movement",
  },
  {
    year: "2020",
    page: 119,
    title: "Most Edits Ever",
    role: "English Editor",
    question: "What are you doing?",
    quote:
      "I have been so caught up with trying to shorten this article that I can't find time. Can't we keep it as it is? It's just 25 pages.",
    direction: "types more jargon",
  },
  {
    year: "2021",
    page: 118,
    title: "Most FYC ever",
    role: "Joint Chief Editor & Chief English Editor",
    question: "How's it going?",
    quote:
      "This JC will hold the fort for as long as it takes. For a mother can't trust anybody with her child, yk. Doesn't matter if y'all don't reply to my messages, don't turn in work at deadlines, etc etc. Yaar tumhare liye design teams se gaali bhi kha lunga but never abandon EB.",
    direction: "Pastes his write-up in a freshly error-checked code",
    gloss: "FYC — Final Year Crisis",
  },
];

/**
 * Where the name came from. This is not trivia — "The Loopdown" is the writing
 * hub on this site (/loopdown), the GitHub repo that generates it, and the
 * series the field notes ship under. All three are named after a short story
 * he wrote for Excelsior '21: 52 iterations of the same Wednesday, on the
 * Rebel path of that year's branching cover story.
 *
 * A blog named after a magazine piece is the whole throughline in one word,
 * which is exactly why it is stated here rather than left for someone to spot.
 */
export const loopdownOrigin = {
  year: "2021",
  page: 44,
  /** The story itself. Kept separate from the naming claim so callers that
   *  have already said "the hub is named after it" don't say it twice. */
  story: "on the Rebel path, tagged REPETITION: a week that refuses to end, 52 iterations of the same Wednesday",
};

/**
 * Excelsior '21 was not a magazine with a cover story in it; the cover story
 * WAS the magazine. Mr. Talesman opens on p24 and sends the reader down one of
 * three branching paths — Compliant, Rebel, Explorer — each with its own
 * prologue and epilogue. He was Joint Chief Editor on it.
 */
export const coverStory2021 = {
  page: 24,
  paths: [
    { name: "Mr. Compliant", page: 25 },
    { name: "Mr. Rebel", page: 39 },
    { name: "Mr. Explorer", page: 53 },
  ],
};

/**
 * The arc those three describe, stated plainly — this is the line the AI
 * assistant should be able to draw, because it is the actual throughline from
 * a college magazine to a production codebase.
 */
export const boardArc =
  "Three years, three parodies: the punster who over-thought everything, the editor who could not cut his own 25-page draft, and finally the one who held the fort — error-checking other people's work, absorbing the flak from other teams so his own did not have to, and refusing to abandon it in his final year. The last one is still the job description.";
