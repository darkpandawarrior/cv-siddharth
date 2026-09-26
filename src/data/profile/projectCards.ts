import { projectStats } from "../projectStats.ts";
import { projectModuleCounts, paymentGatewayCount, dooriStats, paymentStats } from "../../lib/projectStatLine.ts";
// GENERATED ONCE from projects.ts at split time (arch-L15), then hand-kept
// in sync — a companion test (projectCards.test.ts) fails if a future edit
// to projects.ts moves these fields out from under it. Deliberately not a
// live generator: these fields already have one owner (projects.ts), and
// this is the whole of what a card/list view needs from it — re-deriving it
// on every build would just be code that reads the source of truth once,
// which is exactly what the parity test already gives without the extra step.
//
// The point of this file existing separately from projects.ts: /hire and
// /resume need exactly these fields, never the screenshots/videos/case-study
// prose in Project.detail — and because this is its own module, Rollup
// builds it as its own chunk. Importing it (instead of the full `projects`)
// is what keeps those two routes off the heavy chunk.
//
// `description`/`hasDetail` joined this file for the same reason: routes/
// project.$slug.tsx's `beforeLoad`/`head` run before the route's component
// (`ProjectDetail.tsx`, split into its own lazy chunk) ever loads — they
// CANNOT be code-split, so whatever they import lands in every route's
// shared eager graph, not just /project/*'s (e2e/spine-payload.spec.ts
// caught this: /chess, /terminal, /weeb and /hire were all fetching
// profile-projects-heavy purely because that route's `head()` read
// `Project.description`/`Project.detail` from the full `projects` array).
export interface ProjectCard {
  slug: string;
  name: string;
  tagline: string;
  /** Same string as Project.description — duplicated here so /project/$slug's
   *  `head()` (SEO meta, runs eagerly) never needs the full `projects` array. */
  description: string;
  /** Mirrors `!!Project.detail` — whether this project has an in-site case
   *  study, used by `head()`'s OG-image choice without needing `detail` itself. */
  hasDetail: boolean;
  /** The one link from Project.links matching a code-host URL (github.com/
   *  gitlab.com/bitbucket.org), or undefined — project-jsonld.ts's own
   *  SoftwareSourceCode.codeRepository, without needing the full `links`. */
  repoUrl?: string;
  /** Same string as Project.detail.overview, present only when hasDetail —
   *  project-jsonld.ts's Article.articleBody, without needing `detail`. */
  overview?: string;
  stack: string[];
  highlights: string[];
  status: string;
  badges: string[];
  tier?: 1 | 2;
}

export const projectCards: ProjectCard[] = [
  {
    "slug": "gaddi",
    "name": "Gaddi",
    "tagline": "A Hinglish social-deduction bluffing game of power, satire & second chances. Gaddi ke liye kuch bhi karega.",
    "description": "Deterministic Kotlin Multiplatform social-deduction game with ISMCTS bot AI, shipped across Android, iOS, Desktop, and Web.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/Gaddi",
    "overview": "Gaddi is a Hinglish social-deduction bluffing game set in a satirical India corporate-political underworld where six archetypes scheme for an empty chair, the Gaddi, and everyone is lying about what they hold. The Neta makes promises he'll forget tomorrow, the Bhai owns silence, the Babu approves nothing, the Jugaadu knows a shortcut, the Vakil has read every exception. Satire targets the archetype, never the person. Under the deadpan Hinglish voice (\"\u0938\u092c \u092e\u093f\u0932\u0947 \u0939\u0941\u090f \u0939\u0948\u0902\") sits a serious engineering exercise: one deterministic Kotlin engine that runs identically on Android, iOS, desktop and the web, and powers the AI, the UI and a server-authoritative backend from the same code.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Android",
      "iOS",
      "Desktop",
      "Web (Wasm)"
    ],
    "highlights": [
      "Pure (GameState, Intent) → GameState reducer drives the AI, UI, and a future server.",
      "ISMCTS AI with 10 bot personas plus a DARBAR social layer for bluffing and alliances."
    ],
    "status": `${projectModuleCounts.gaddi} modules · 4 platforms · 10 bot personas`,
    "badges": [
      "Kotlin Multiplatform",
      "Game engine",
      "ISMCTS AI"
    ]
  },
  {
    "slug": "doori",
    "name": "Doori",
    "tagline": "Offline-first mileage, travel & expense tracker on one Kotlin codebase across Android, iOS, Wear OS, watchOS & Desktop.",
    "description": "Offline-first mileage, travel, and expense tracker spanning five platforms from one Kotlin codebase, with a real Kotlin/Ktor backend built in, off by default.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/Doori",
    "overview": "Doori is an original, fully-offline mileage / travel / expense tracker I designed and built end-to-end in Kotlin & Compose Multiplatform. It runs on Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, offline-first with a real Kotlin/Ktor backend built in and off by default, so the whole thing stays reproducible and reviewable. It's my reference implementation for the architecture I advocate at scale: strict module isolation, a real location engine, a policy/reimbursement layer and a durable submit-outbox, all over local data.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Android",
      "iOS",
      "Wear OS",
      "watchOS",
      "Desktop",
      "Room (KMP)",
      "Koin"
    ],
    "highlights": [
      `${projectModuleCounts.doori}-module clean architecture: ${dooriStats.features} feature modules meeting only at the composition root.`,
      "Real location engine, reimbursement policy engine, durable submit-outbox, and an on-device AI assistant."
    ],
    "status": `${projectModuleCounts.doori} modules · 5 platforms · 159 tests`,
    "badges": [
      "Kotlin Multiplatform",
      `${projectModuleCounts.doori} modules`,
      "5 platforms",
      "Open source"
    ],
    "tier": 2
  },
  {
    "slug": "paymentslab-kmp",
    "name": "PaymentsLab-KMP",
    "tagline": "An Integration Lab for the Android payments ecosystem: every gateway behind one abstraction, with a live look at what actually happens on each transaction.",
    "description": "A Kotlin Multiplatform systems showcase: real payment flows across dozens of providers, all behind a single PaymentGateway abstraction, backed by a Ktor server that owns order creation, signature verification and webhook reconciliation.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/PaymentsLab-KMP",
    "overview": "Payments is the hardest integration surface on Android: every gateway ships a different SDK, most of them are Activity-callback-era, the client can lie about the outcome, and the interesting logic (signatures, webhooks, idempotency, recovery) lives on the server. PaymentsLab-KMP runs real payment flows across a 70-gateway catalog behind a single PaymentGateway abstraction, and visualizes them step by step. A Ktor server does the order creation, signature verification and webhook reconciliation a real integration requires. Beyond one-shot pay-in it models five money-movement rails.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Ktor",
      "Android",
      "iOS",
      "Room"
    ],
    "highlights": [
      `${projectModuleCounts["paymentslab-kmp"]}-module registry (${paymentStats.modules} local + ${paymentStats.composedModules} composed) spans ${paymentGatewayCount} cataloged payment gateways.`,
      "Five money-movement rails plus split payments, all idempotency-keyed and MOCK_MODE-honest."
    ],
    "status": `${projectModuleCounts["paymentslab-kmp"]} modules · ${paymentGatewayCount} gateways · 5 rails`,
    "badges": [
      "Kotlin Multiplatform",
      `${projectModuleCounts["paymentslab-kmp"]} modules`,
      `${paymentGatewayCount} gateways`,
      "Open source"
    ],
    "tier": 2
  },
  {
    "slug": "candidai",
    "name": "Candidai",
    "tagline": "A native, multiplatform AI career-intelligence engine, and the open-source project it's built on.",
    "description": "A local-first job-search engine rebuilt from scratch in Kotlin Multiplatform: resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored r\u00e9sum\u00e9s. Its scoring engine is ported and verified against the open-source career-ops project I actively contribute to upstream.",
    "hasDetail": true,
    "repoUrl": "https://github.com/career-ops-hq/career-ops",
    "overview": "Candidai is a local-first AI career-intelligence engine: resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored r\u00e9sum\u00e9s, in one pipeline. The product idea and scoring model started on career-ops, an open-source Node.js job-search engine (71k+ stars) that I actively contribute to upstream. The native app is a from-scratch Kotlin Multiplatform rebuild: the same A-F fit-scoring engine, ported and verified line-for-line against the original, now running identically on Android, iOS, Desktop, Web and a Spring Boot server instead of a single Node process.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Spring Boot 4",
      "Room (KMP)",
      "Ktor",
      "89 ATS/board providers"
    ],
    "highlights": [
      "25-module Kotlin Multiplatform clean architecture (12 feature + 6 core modules) targeting Android, iOS, Desktop, Web and a Spring Boot 4 server from one shared engine.",
      "core:engine is a no-IO module: A-F fit scoring, ATS search, SimHash fingerprinting, and funnel math ported 1:1 from career-ops and verified against its own test vectors.",
      "89 ATS & job-board provider integrations and a zero-token scan path (direct Greenhouse/Ashby/Lever APIs, no LLM cost) inherited from the open-source engine it's built on.",
      "24 merged PRs to the public career-ops project (71k+ stars): new ATS providers, an opt-in LLM re-ranker, an agent-inbox feature, and a run of correctness fixes, each with a reproduction and a regression test (full list below)."
    ],
    "status": "Active · 24 PRs merged to public career-ops · member of the career-ops-hq org",
    "badges": [
      "Kotlin Multiplatform",
      "25 modules",
      "Open-source contributor"
    ],
    "tier": 2
  },
  {
    "slug": "portfolio",
    "name": "Portfolio Twin",
    "tagline": "The site you're reading, plus Panda the assistant that answers for me, and the whole thing rebuilt a second time in Compose Multiplatform, one commonMain to Web, Desktop, Android and iOS.",
    "description": "An interactive r\u00e9sum\u00e9 built twice, on purpose. The React 19 original runs on Vercel Edge with a provider-agnostic LLM assistant grounded in this same profile data. The Compose Multiplatform port renders the same portfolio from 35.7k lines of Kotlin to Kotlin/Wasm, Desktop, Android and iOS. An honest test of how far CMP reaches on the web, including where it doesn't.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/cv-siddharth",
    "overview": "A CV that is also the portfolio piece. Rather than describe the work, the site is built the way the work is built, and then rebuilt a second time on an entirely different stack to see what survives the move. The React version renders everything from one TypeScript file of profile data, which is also what the AI assistant, the r\u00e9sum\u00e9, the OG images and the two /llms.txt files are generated from, so none of them can disagree with each other. The Compose twin transcribes that file by hand, which is a different contract and a weaker one.",
    "stack": [
      "cv-siddharth",
      "React 19",
      "Vite 8",
      "Tailwind v4",
      "Vercel Edge",
      "Multi-provider LLM",
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Kotlin/Wasm"
    ],
    "highlights": [
      "Two full implementations of one portfolio: the same content rendered by React on the web and by Compose Multiplatform to four targets, which makes the comparison concrete rather than theoretical.",
      "Provider-agnostic chat backend (Groq / Gemini / Claude) with prompt-injection guards. Panda is grounded in this file, the same source of truth the pages render from, so the assistant cannot drift from the site.",
      "Every claim on this site is checked mechanically before it ships, not recalled: a claim-audit script verifies the facts and scans every outward-facing surface for phrases already disproven."
    ],
    "status": "Live · React on Vercel, CMP across 4 targets",
    "badges": [
      "React 19",
      "Vercel",
      "LLM chat",
      "Compose Multiplatform",
      "Wasm"
    ]
  },
  {
    "slug": "stutter",
    "name": "STUTTER",
    "tagline": "A first-person time-loop game about a moment someone could not let end.",
    "description": "Godot 4.7 in GDScript. A deterministic echo-replay spine powers cooperative echoes, ghosts, and boss desync from one system, with recorded input intent replayed through the same physics step. Built solo as an AI-orchestrated dev crew.",
    "hasDetail": true,
    "repoUrl": undefined,
    "overview": "STUTTER is a first-person time-loop game about a moment someone could not let end: a grieving mind's mathematics, rendered as a room that lies about its own floor. Under the mood sits one deterministic engine: every action is recorded as intent, never position, and replayed through the exact same physics step. That one idea is reused, unmodified, five different ways across the game's core systems: record intent, replay deterministically.",
    "stack": [
      "Godot 4.7",
      "GDScript",
      "Deterministic fixed-timestep sim",
      "gdUnit4",
      "AI-orchestrated content pipeline"
    ],
    "highlights": [
      "One deterministic (state, InputFrame) → state step reused five ways: cooperative Echoes, ghosts, leaderboard replays, the Hunter, and boss desync.",
      "A bit-exact determinism gate guards every change to the time systems, wired into a hook that reruns it automatically on every edit.",
      "Design-first build: a 4,300+ line, 7-document codex and 24 animated SVG design boards, generated by a checked-in AI dev-crew script. 39 agents, 0 failures, one session."
    ],
    "status": "In development · private repo, public case study",
    "badges": [
      "Godot 4.7",
      "GDScript",
      "Time-loop",
      "Solo + AI dev crew"
    ]
  },
  {
    "slug": "sinc-p",
    "name": "SINC-P",
    "tagline": "A statutory student-grievance redressal system, built to survive a UGC inspection rather than a demo.",
    "description": "Next.js 16 over Postgres with row-level security, rewriting a 2019 MANIT Bhopal final-year project (a downloaded complaint-box template, categories still reading E-commerce and Online Shopping) into a real compliance system: a statutory SLA clock, a hash-chained append-only audit trail, and published closure-time transparency with no login required.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/SINC-P",
    "overview": "SINC-P rebuilds a 2019 final-year project from scratch: a statutory grievance-redressal system an Indian institution can put in front of a UGC inspector, with a clock on every case and a record nobody can quietly edit. Nothing from 2019 survived the rewrite, not the code, the schema, or the passwords, because almost every line of the original was an ordinary mistake (string-built SQL, unsalted md5, no ownership check on a grievance read) that is still running at real institutions today.",
    "stack": [
      "Next.js 16",
      "React 19",
      "TypeScript strict",
      "Postgres",
      "Drizzle ORM",
      "Tailwind v4",
      "Vitest"
    ],
    "highlights": [
      "A statutory SLA clock escalating officer, then admin, then the Ombudsperson tier the regulations require, plus a hash-chained audit trail a retro-edited remark cannot pass unnoticed.",
      "Tenant isolation across four independent layers, down to Postgres row-level security, verified by a script that tries to break it rather than trusted from the application side alone."
    ],
    "status": "Active · AGPL-3.0 · UGC 2023-compliant",
    "badges": [
      "Next.js 16",
      "Postgres RLS",
      "AGPL-3.0",
      "UGC 2023"
    ],
    "tier": 2
  },
  {
    "slug": "kmp-family",
    "name": "The KMP toolkit family",
    "tagline": "Three decoupled repos so a new app starts at \"write the feature\".",
    "description": "The reusable libraries, the shared build logic and the app shape each live in their own repo, vendored into five consumers via Gradle includeBuild, so a version bump happens once instead of per project.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/kmp-toolkit",
    "overview": "The KMP toolkit family is three decoupled repos (kmp-toolkit, kmp-build-logic and kmp-app-template) instead of one \"platform\" repo, so that using one of them never means dragging the other two along. None of the three were designed up front: each exists because a second consumer needed something the first one already had, and extracting it once was cheaper than copy-pasting it again. The family is vendored into Doori, PaymentsLab-KMP, Candidai, Gaddi and this portfolio's own Compose Multiplatform twin via Gradle includeBuild, so a fix or a version bump lands once and every consumer picks it up on its own schedule.",
    "stack": [
      "Kotlin Multiplatform",
      "Gradle convention plugins",
      "Compose Multiplatform",
      "MIT"
    ],
    "highlights": [
      `kmp-toolkit: ${projectStats.foundation.modules} modules, each extracted the moment a second consumer needed the same logic, never designed as a "platform" up front, from the mvi-core base all four apps share to modules like device-integrity and a chart renderer still finding their first consumer.`,
      `kmp-build-logic: ${projectStats.foundation.conventionPlugins} convention plugins. The AGP / Kotlin / Compose / test / lint / Firebase / Room / Koin setup written once and applied with one line.`,
      "kmp-app-template, the app shape the toolkit slots into: one shared Compose UI, a wired Splash → Login → Home nav scaffold, thin Android + Desktop shells, and a customizer.sh that renames the whole project in one command.",
      `Consumed by Doori (${dooriStats.composedModules} of its ${projectModuleCounts.doori} modules), PaymentsLab-KMP (${paymentStats.composedModules} of its ${projectModuleCounts["paymentslab-kmp"]}), Candidai and Gaddi. The composition is the proof the extraction was real, not a library nobody uses.`
    ],
    "status": "Active · MIT · vendored across 5 repos",
    "badges": [
      "Kotlin Multiplatform",
      `${projectStats.foundation.modules} modules`,
      `${projectStats.foundation.conventionPlugins} convention plugins`,
      "MIT"
    ]
  },
  {
    "slug": "the-loopdown",
    "name": "The Loopdown",
    "tagline": "Field notes from an engineer who writes: one war story, four channels, one branded card.",
    "description": "A dev-content engine and writing archive. A lesson pulled from a real project is written once and adapted to LinkedIn, dev.to, Hashnode and Medium, each with a generated branded graphic, plus the consolidated back catalogue.",
    "hasDetail": true,
    "repoUrl": "https://github.com/darkpandawarrior/the-loopdown",
    "overview": "The Loopdown is the writing side of the same discipline the rest of this site argues for: a lesson is pulled from a real production incident, written once, and adapted, never re-derived from scratch, for every place it will be read. 17 lessons across 8 series sit alongside a 10-piece back catalogue from before the code, all versioned in one repo with the same public/private split a codebase gets: the engine and what's published are tracked, drafts and personal notes are gitignored.",
    "stack": [
      "Node.js",
      "Markdown",
      "SVG generation",
      "Voice-profile linting"
    ],
    "highlights": [
      "One lesson in, four channel-shaped posts out, each with a branded SVG card. The adaptation is the product, not the writing.",
      "A voice profile derived from the existing archive, enforced by a lint step, so the generated drafts do not read like a language model wrote them.",
      "Framed as an engineer stuck in a time loop filing field notes on the same lying systems each pass, with a recurring cast (The Concussed Witness and more) tracked in a living bestiary.",
      "Public/private split by construction: the engine and the published posts are tracked, drafts and personal notes are gitignored."
    ],
    "status": "Active · public",
    "badges": [
      "Node.js",
      "Content engine",
      "Open source"
    ]
  }
];
