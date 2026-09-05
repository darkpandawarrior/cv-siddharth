/**
 * Scattered references — every place he already exists on the internet,
 * collated so the portfolio is the hub rather than one more island.
 *
 * Rule for this file: only profiles he CONTROLS or that are a public record of
 * work he did. Data-broker pages are deliberately excluded — a ZoomInfo entry
 * for him surfaced during the sweep carrying a work email and phone number, and
 * linking a scraped profile both dignifies it and republishes contact details he
 * never chose to publish. Noted in the audit, not linked. (If he wants it gone,
 * ZoomInfo has an opt-out; that is a privacy action, not a portfolio one.)
 *
 * `verified` is the HTTP status seen on 2026-08-05. StackOverflow answers 403 to
 * a scripted request — that is its bot protection, not a dead link; it was
 * supplied by him and opens fine in a browser.
 */
export interface Elsewhere {
  label: string;
  url: string;
  /** What a visitor actually finds there. */
  what: string;
  kind: "code" | "writing" | "social" | "record";
}

export const elsewhere: Elsewhere[] = [
  { label: "GitHub", url: "https://github.com/darkpandawarrior", what: "Doori, Gaddi, PaymentsLab-KMP, the KMP toolkit", kind: "code" },
  { label: "Stack Overflow", url: "https://stackoverflow.com/users/12678663/siddharth-pandalai", what: "answers and reputation", kind: "code" },
  { label: "LinkedIn", url: "https://linkedin.com/in/siddharth-pandalai", what: "work history", kind: "record" },
  { label: "dev.to", url: "https://dev.to/darkpandawarrior", what: "the field notes, syndicated", kind: "writing" },
  { label: "Medium", url: "https://medium.com/@siddharthpandalai990", what: "the same field notes, syndicated", kind: "writing" },
  { label: "Hashnode", url: "https://darkpandawarrior.hashnode.dev", what: "the same field notes, syndicated", kind: "writing" },
  { label: "X", url: "https://x.com/pandalaisid18", what: "@pandalaisid18", kind: "social" },
  { label: "Books Before Bros", url: "https://booksbeforebros.wordpress.com/", what: "the blog that predates the code", kind: "writing" },
  {
    label: "Editorial Board, MANIT",
    url: "https://edboardmanit.wordpress.com/",
    what: "the society whose magazine he edited, and where 'It's A Doggone Life' ran",
    kind: "record",
  },
  { label: "Drishtant", url: "https://drishtantnitbhopal.wordpress.com/", what: "the literary society, and D Buzz", kind: "record" },
  {
    label: "MANIT Flipbook",
    url: "https://flip.manit.ac.in/",
    what: "the institute's own archive: the original scans of every Excelsior",
    kind: "record",
  },
  {
    label: "The Org",
    url: "https://theorg.com/org/dice-tech/org-chart/siddharth-pandalai",
    what: "Dice.tech org chart entry",
    kind: "record",
  },
];
