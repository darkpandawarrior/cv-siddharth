// src/data/source/answers.ts — the ONE hand-authored Q&A corpus behind every
// citable answer this site gives, in visitor phrasing.
//
// WHY THIS FILE EXISTS (the answer layer)
// ----------------------------------------
// Before this file, the assistant's knowledge reached an engine only as three
// .txt files and a client-only chat widget: nothing on-page was quotable, and
// no answer pointed at the page that proves it. Every entry here carries an
// `anchor` — a real route + a real DOM id ALREADY rendered by some other part
// of the site (a home-page section, a project page's <main>, the résumé) —
// and scripts/check-answers.mjs fails the build if that id ever stops
// resolving in the built HTML. The citation is load-bearing, not decorative.
//
// NO NEW CLAIMS. Every `answer` string interpolates a value straight out of
// `profile.ts` (metrics/experience/projects/education) rather than retyping a
// number — the same discipline scripts/gen-system-prompt.mjs already uses for
// the chat prompt and llms.txt. That means claim-audit has nothing new to
// verify here: every fact already has a probe wherever profile.ts's own facts
// do. Adding an answer that states a number NOT already in profile.ts needs a
// claim-audit probe added first (report it — never edit the private
// claims.json by hand) — this file is not the place to introduce a new one.
//
// SINGLE SOURCE OF THE PROSE. This is the only file that hand-types this
// English. scripts/gen-system-prompt.mjs, src/FloatingChat.tsx and
// scripts/check-answers.mjs all import ANSWERS and render/check it — none of
// them retype a question or an answer.
import {
  education,
  experience,
  metrics,
  profile,
  projects,
} from "../profile.ts";

/** One quotable Q&A, always citing a real, already-rendered anchor. */
export interface Answer {
  /** Stable id — never reused, so a removed answer can't silently resurrect
   *  under a new one's citation. */
  id: string;
  /** The question in a visitor's own words. */
  question: string;
  /** Extra content words a paraphrase of the question might use — read by
   *  src/lib/answersMatch.ts's offline matcher, never shown. */
  keywords?: string[];
  /** Short enough to quote verbatim in a chat reply or a <details> block. */
  answer: string;
  /** `<route>#<id>` — the id must already exist in that route's rendered
   *  HTML. scripts/check-answers.mjs resolves every one of these against a
   *  real build. */
  anchor: string;
}

const dice = experience.find((e) => e.company === "Dice.tech")!;
const neev = experience.find((e) => e.company === "Neev Consulting")!;
const doori = projects.find((p) => p.slug === "doori")!;
const gaddi = projects.find((p) => p.slug === "gaddi")!;
const paymentsLab = projects.find((p) => p.slug === "paymentslab-kmp")!;
const candidai = projects.find((p) => p.slug === "candidai")!;
const [mau, gps, crash, compose] = metrics;

export const ANSWERS: Answer[] = [
  {
    id: "current-role",
    question: "What does he do at Dice.tech?",
    keywords: ["job", "current", "platform owner", "product owner"],
    answer: `${dice.role} at ${dice.company} (${dice.period}), platform owner of the app behind ${mau.value} monthly active users (${mau.detail}).`,
    anchor: "/#experience",
  },
  {
    id: "gps-accuracy",
    question: "What did he do to improve GPS accuracy?",
    keywords: ["location", "dead reckoning", "kalman"],
    answer: `Took GPS accuracy to ${gps.value}: ${gps.detail}.`,
    anchor: "/#work",
  },
  {
    id: "crash-reduction",
    question: "How did he reduce production crashes?",
    keywords: ["stability", "crashlytics", "concurrency"],
    answer: `${crash.value} crash reduction: ${crash.detail}.`,
    anchor: "/#work",
  },
  {
    id: "compose-migration",
    question: "How much of the app is Jetpack Compose?",
    keywords: ["ui migration", "xml", "views"],
    answer: `${compose.value} of the UI layer: ${compose.detail}.`,
    anchor: "/#skills",
  },
  {
    id: "education",
    question: "Where did he study?",
    keywords: ["college", "degree", "university"],
    answer: `${education.degree}, ${education.school} (${education.period}).`,
    anchor: "/resume#main-content",
  },
  {
    id: "neev-role",
    question: "What is the Neev Consulting role?",
    keywords: ["agentic", "erp", "llm"],
    answer: `${neev.role} at ${neev.company} (${neev.period}). ${neev.points[0].text}`,
    anchor: "/#experience",
  },
  {
    id: "doori",
    question: "What is Doori?",
    keywords: ["mileage", "expense", "kmp", "kotlin multiplatform", "offline-first"],
    answer: `Doori: ${doori.tagline}`,
    anchor: "/project/doori#main-content",
  },
  {
    id: "gaddi",
    question: "What is Gaddi?",
    keywords: ["social deduction", "bluffing game", "ismcts"],
    answer: `Gaddi: ${gaddi.tagline}`,
    anchor: "/project/gaddi#main-content",
  },
  {
    id: "paymentslab",
    question: "What is PaymentsLab-KMP?",
    keywords: ["payments", "ktor", "backend"],
    answer: `PaymentsLab-KMP: ${paymentsLab.tagline}`,
    anchor: "/project/paymentslab-kmp#main-content",
  },
  {
    id: "candidai",
    question: "What is Candidai?",
    keywords: ["hiresignal", "career-ops", "open source"],
    answer: `Candidai: ${candidai.tagline}`,
    anchor: "/project/candidai#main-content",
  },
  {
    id: "writing",
    question: "Does he write, outside of code?",
    keywords: ["the loopdown", "field notes", "blog"],
    answer: `Yes: The Loopdown, his field-notes writing hub, where the recurring bug characters are named after real production incidents.`,
    anchor: "/#writing",
  },
  {
    id: "work-with-him",
    question: "What's he like to work with?",
    keywords: ["teammates", "eb profiles", "editorial board"],
    answer: `Answered by his own teammates, not by him: see the EB Profiles, one question per member, in their own words.`,
    anchor: "/#board",
  },
  {
    id: "availability",
    question: "Is he available, and how do I reach him?",
    keywords: ["hiring", "contact", "email", "notice period"],
    answer: `${profile.availability}. Email ${profile.email}.`,
    anchor: "/#contact",
  },
  {
    id: "open-source",
    question: "What has he contributed outside employer work?",
    keywords: ["upstream", "shared libraries", "open source"],
    answer: `Shared Kotlin Multiplatform libraries used across his own apps, plus merged upstream pull requests on career-ops: see the repos and the running count.`,
    anchor: "/#source",
  },
  {
    id: "shipped",
    question: "Has anything he's built shipped for real?",
    keywords: ["play store", "live apps", "published"],
    answer: `Yes: see the Play Store shelf for the apps that are actually live and installable, not just source.`,
    anchor: "/#shipped",
  },
  {
    id: "site-rooms",
    question: "What can I try on this site besides reading it?",
    keywords: ["interactive", "rooms", "playground", "labs"],
    answer: `Every route on the site, as a tile you can open: 3D builds, labs and canvases, not screenshots.`,
    anchor: "/#surfaces",
  },
];
