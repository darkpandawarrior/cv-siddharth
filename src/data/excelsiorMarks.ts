/**
 * Hand-curated deep links into the Excelsior reader. NOT generated — the
 * generator owns page counts, this owns meaning.
 *
 * Every page number was verified by reading the rendered page, not by trusting
 * OCR: the PDFs have no text layer, so OCR was only used to narrow down which
 * pages to open. `page` is the PDF page index the reader addresses, which is
 * NOT always the number printed on the page — 2019 and 2021 print at offset 0,
 * 2020 prints two lower (PDF p36 is printed p34).
 */
export interface ExcelsiorMark {
  year: string;
  /** PDF page index, 1-based — what /excelsior?page= takes. */
  page: number;
  label: string;
  note: string;
  /** "wrote" = my piece · "about" = written about me · "credit" = masthead. */
  kind: "wrote" | "about" | "credit";
  /** For pieces he wrote: the slug of the readable version at /read/<slug>.
   *  The magazine page is the artefact; this is where you actually read it. */
  readSlug?: string;
}

export const excelsiorMarks: ExcelsiorMark[] = [
  // --- Pieces I wrote ---
  {
    year: "2021",
    page: 44,
    label: "The Loopdown",
    readSlug: "the-loopdown-story",
    note: "Excelsior '21, on the Rebel path — 52 iterations of the same Wednesday. This site's writing hub is named after it.",
    kind: "wrote",
  },
  {
    year: "2021",
    page: 24,
    label: "Cover Prologue",
    note: "The frame for the whole of Excelsior '21: Mr. Talesman sends you down one of three paths — Compliant (p25), Rebel (p39) or Explorer (p53), each with its own prologue and epilogue.",
    kind: "wrote",
  },
  {
    year: "2020",
    page: 36,
    label: "CTC: Cost to Company",
    readSlug: "ctc-cost-to-company",
    note: "Cover story, Excelsior '20 — a 2069 climate dystopia where salary is paid in days of drinkable water. Printed p34.",
    kind: "wrote",
  },
  {
    year: "2020",
    page: 39,
    label: "Prophecy #201112003",
    readSlug: "prophecy-201112003",
    note: "Cover story, Excelsior '20 — a sentient banyan hands a fresher his prophecy. Printed p37.",
    kind: "wrote",
  },
  {
    year: "2019",
    page: 65,
    label: "Deadline",
    readSlug: "deadline",
    note: "Excelsior '19 — Death turns up in a t-shirt and gives you six months. A memento mori in a Deadpool costume.",
    kind: "wrote",
  },
  {
    year: "2019",
    page: 48,
    label: "Pointer Games",
    readSlug: "pointer-games",
    note: "Excelsior '19 — Episode 1: \"Nidra\" Thama. Campus lore as a serialised thriller.",
    kind: "wrote",
  },

  // --- Written about me: the EB Profiles parodies ---
  {
    year: "2021",
    page: 118,
    label: "Most FYC ever",
    note: "EB Profiles '21 — the board writing me, in my voice. Joint Chief Editor & Chief English Editor.",
    kind: "about",
  },
  {
    year: "2020",
    page: 119,
    label: "Most Edits Ever",
    note: "EB Profiles '20 — English Editor, and a fair description of the job. Printed p117.",
    kind: "about",
  },
  {
    year: "2019",
    page: 141,
    label: "Most Pseudo Intellectual Ever",
    note: "EB Insights '19. I stand by the pun collection.",
    kind: "about",
  },

  // --- The record ---
  {
    year: "2021",
    page: 5,
    label: "The sign-off",
    note: "The editors' farewell, signed as Joint Chief Editor. My last issue on the board.",
    kind: "credit",
  },
];
