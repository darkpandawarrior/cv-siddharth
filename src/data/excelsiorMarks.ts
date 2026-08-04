/**
 * Hand-curated deep links into the Excelsior reader. NOT generated — the
 * generator owns page counts, this owns meaning.
 *
 * Every entry here was verified by reading the rendered page, not by trusting
 * OCR: the PDFs have no text layer, so OCR was only used to narrow down which
 * pages to look at. `page` is the PDF page index the reader addresses, which
 * is NOT the number printed on the page (front matter is unnumbered — '20's
 * printed p37 is image p39).
 */
export interface ExcelsiorMark {
  year: string;
  /** PDF page index, 1-based — what /excelsior?page= takes. */
  page: number;
  label: string;
  note: string;
  /** True where I wrote the piece, as opposed to appearing in it. */
  mine: boolean;
}

export const excelsiorMarks: ExcelsiorMark[] = [
  {
    year: "2020",
    page: 39,
    label: "Prophecy #201112003",
    note: "Cover story, Excelsior '20 — a sentient banyan hands a fresher his prophecy. Printed p37.",
    mine: true,
  },
  {
    year: "2021",
    page: 5,
    label: "The sign-off",
    note: "The editors' farewell, signed as Joint Chief Editor. My last issue on the board.",
    mine: true,
  },
  {
    year: "2020",
    page: 119,
    label: "Most Edits Ever",
    note: "The EB Profiles page — English Editor, and a fair description of the job. Printed p117.",
    mine: false,
  },
  {
    year: "2019",
    page: 141,
    label: "Most Pseudo Intellectual Ever",
    note: "EB Insights superlatives. I stand by the pun collection.",
    mine: false,
  },
  {
    year: "2021",
    page: 109,
    label: "The board",
    note: "The masthead — everyone who made the 2021 edition.",
    mine: false,
  },
];
