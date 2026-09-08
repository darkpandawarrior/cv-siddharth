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
export interface ProjectCard {
  slug: string;
  name: string;
  tagline: string;
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
    "status": "14 modules · 4 platforms · 10 bot personas",
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
      "46-module clean architecture: 13 feature modules meeting only at the composition root.",
      "Real location engine, reimbursement policy engine, durable submit-outbox, and an on-device AI assistant."
    ],
    "status": "46 modules · 5 platforms · 159 tests",
    "badges": [
      "Kotlin Multiplatform",
      "46 modules",
      "5 platforms",
      "Open source"
    ],
    "tier": 2
  },
  {
    "slug": "paymentslab-kmp",
    "name": "PaymentsLab-KMP",
    "tagline": "An Integration Lab for the Android payments ecosystem: every gateway behind one abstraction, with a live look at what actually happens on each transaction.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Ktor",
      "Android",
      "iOS",
      "Room"
    ],
    "highlights": [
      "40-module registry (15 local + 25 composed) spans 66 cataloged payment gateways.",
      "Five money-movement rails plus split payments, all idempotency-keyed and MOCK_MODE-honest."
    ],
    "status": "40 modules · 66 gateways · 5 rails",
    "badges": [
      "Kotlin Multiplatform",
      "40 modules",
      "66 gateways",
      "Open source"
    ],
    "tier": 2
  },
  {
    "slug": "candidai",
    "name": "Candidai",
    "tagline": "A native, multiplatform AI career-intelligence engine, and the open-source project it's built on.",
    "stack": [
      "Kotlin Multiplatform",
      "Compose Multiplatform",
      "Spring Boot 4",
      "Room (KMP)",
      "Ktor",
      "87 ATS/board providers"
    ],
    "highlights": [
      "25-module Kotlin Multiplatform clean architecture (12 feature + 6 core modules) targeting Android, iOS, Desktop, Web and a Spring Boot 4 server from one shared engine.",
      "core:engine is a no-IO module: A-F fit scoring, ATS search, SimHash fingerprinting, and funnel math ported 1:1 from career-ops and verified against its own test vectors.",
      "87 ATS & job-board provider integrations and a zero-token scan path (direct Greenhouse/Ashby/Lever APIs, no LLM cost) inherited from the open-source engine it's built on.",
      "24 merged PRs to the public career-ops project (⭐68k+): new ATS providers, an opt-in LLM re-ranker, an agent-inbox feature, and a run of correctness fixes, each with a reproduction and a regression test (full list below)."
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
    "stack": [
      "cv-siddharth",
      "React 19",
      "Vite 7",
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
    "stack": [
      "Kotlin Multiplatform",
      "Gradle convention plugins",
      "Compose Multiplatform",
      "MIT"
    ],
    "highlights": [
      "kmp-toolkit: 39 modules, each extracted the moment a second consumer needed the same logic, never designed as a \"platform\" up front, from the MVI core four apps build on to modules like store and bots-policy still finding their first consumer.",
      "kmp-build-logic: 17 convention plugins here (22 authored across all repos). The AGP / Kotlin / Compose / test / lint / Firebase / Room / Koin setup written once and applied with one line.",
      "kmp-app-template, the app shape the toolkit slots into: one shared Compose UI, a wired Splash → Login → Home nav scaffold, thin Android + Desktop shells, and a customizer.sh that renames the whole project in one command.",
      "Consumed by Doori (10 of its 46 modules), PaymentsLab-KMP (25 of its 40), Candidai and Gaddi. The composition is the proof the extraction was real, not a library nobody uses."
    ],
    "status": "Active · MIT · vendored across 5 repos",
    "badges": [
      "Kotlin Multiplatform",
      "39 modules",
      "22 convention plugins",
      "MIT"
    ]
  },
  {
    "slug": "the-loopdown",
    "name": "The Loopdown",
    "tagline": "Field notes from an engineer who writes: one war story, four channels, one branded card.",
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
