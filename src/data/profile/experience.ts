// Split from profile.ts along its export seams (arch-L15).

export interface ExperiencePoint {
  label?: string;
  text: string;
  /**
   * Smallest cut this bullet survives into:
   *   1  — the one-pager, and everything longer
   *   2  — the two-pager and the full record
   *   absent — the full record only
   * Nothing is ever deleted to make a shorter cut fit, so the full record
   * stays the complete, defensible version and the three can never disagree.
   */
  tier?: 1 | 2;
}

export interface Experience {
  company: string;
  role: string;
  period: string;
  // Workday/Greenhouse populate a per-position location field; a header-only
  // location leaves those fields empty. Verified against the audited Sep-7
  // record, not invented.
  location: string;
  points: ExperiencePoint[];
}

export const experience: Experience[] = [
  {
    company: "Neev Consulting",
    role: "Consulting Engineer, Platform & AI",
    period: "April 2026 - Present",
    location: "Contract, India",
    points: [
      {
                text: "Built the LLM assistant layer of an ERPNext/Frappe consulting ERP: business-context resolution, capability discovery, and an AI capability gate that defaults OFF with a test proving it. Models client to project to PO to milestone to GST invoice to payment end to end.",
        // Deliberately not tier 1. Four months of concurrent consulting reads as
        // a side engagement next to the Dice platform ownership, and on a single
        // page it was spending a heading plus four lines to say so. Dropping the
        // whole role off the one-pager bought back the leadership and security
        // bullets below, which is what a Lead loop actually asks about. Full record
        // only, per the settled decision that Neev stays off both send cuts.
      },
      {
                text: "Shipped the platform on Python and Frappe over MariaDB under Docker Compose, with a LibreChat deployment and MCP tool wiring for Atlassian and Playwright. Four repositories, all of it reviewed.",
        // Full record only. Promoting the leadership bullet above pushed the
        // two-pager 15px past its budget, and a second bullet about a
        // concurrent Python engagement is the cheapest thing on an Android
        // résumé to spend — the role still states itself on the two-pager.
      },
    ],
  },
  {
    company: "Dice.tech",
    // "SDE-2" alone is an internal level code with no ATS-rankable seniority
    // in it, and "Senior Android Engineer" otherwise only lived in the header
    // subtitle. Surfacing it here, with SDE-2 kept in parens, puts the words
    // a rankable-seniority parser needs on the position line itself without
    // asserting an employer-issued title he doesn't hold.
    role: "Senior Android Engineer (SDE-2) & Product Owner",
    period: "June 2023 - September 2026",
    location: "Pune, India",
    points: [
      {
        label: "Platform Ownership",
        // "so requirements and delivery are one job rather than a handoff" was
        // the third statement of Product Owner on one page — the header title
        // and the summary already say it. Cut, and the line it was costing
        // went to the crash bullet the summary needed backing.
        // The Room migration count moved to the skills line: a schema-migration
        // number is a detail sitting inside a scope bullet, and it reads as
        // hard evidence either way while costing a line and a half less there.
        text: "I owned the Android platform end to end at 50,000+ MAU: expense claims, vouchers, advances and settlements, travel booking and trips, procurement from purchase request through goods inward note to invoice, multi-level approvals, corporate cards and QR payments, and mileage. Two of us wrote effectively all of it, me and a junior engineer I trained, against the architecture and review standards I set.",
        tier: 1,
      },
      {
                // Promoted to the two-pager 2026-09-18. Measured over 62 live senior and
        // staff Android reqs: collaboration/communication appears in 56, ownership
        // in 35, mentoring in 24, cross-functional in 22, while Coroutines appears
        // in 18 and Hilt in 4. Mentoring outranks Coroutines. This bullet is where
        // that axis lives and it was sitting below the cut.
        tier: 2,
        text: "I owned requirements as well as delivery: sprint planning, feature allocation across the team, review, release, and the crash dashboard the morning after. Built the platform so a new client ships without anyone writing UI code.",
      },
      {
                // The one claim a Lead loop opens with, and the only one the summary
        // and Key Results don't already carry — full-record-only until the
        // concurrent consulting role came off the top of the one-pager.
        // "He now manages this app at the company that acquired it" is the
        // proof the mentoring took, but next to "own the Android platform end
        // to end" four lines above it reads as a contradiction — and it was the
        // last line the crash bullet needed. It survives on both longer cuts,
        // where the Scope bullet gives it the room to make sense.
        text: "I ran interview loops and hiring for the frontend and React Native teams. Mentored a junior engineer from Flutter to production Kotlin; he now manages this app at the company that acquired it.",
        tier: 1,
      },
      {
                // "checked screen by screen ... so nothing regressed" was a paraphrase
        // of "zero regressions" written to slip past the claim-audit regex that // claim-audit:allow
        // forbids exactly that phrase — Dice has 31 unit-test files, 4
        // androidTest and ZERO Compose UI tests, so there is no safety net to
        // claim. This is the wording claims.json itself prescribes, and it says
        // the mechanism instead of promising an outcome nothing measured.
        text: "I led the migration off legacy Java and XML, taking roughly 87% of the UI layer to Jetpack Compose and Material 3, and built the shared component library every module renders through. Migrated incrementally through interop, rebuilding each screen onto a single immutable UiState behind its ViewModel.",
        tier: 1,
      },
      {
        label: "AI",
        // Verified against the Dice repo on 2026-09-17, not recalled. CameraX +
        // ML Kit text recognition live in OdometerScanner/ and mileageTracker/;
        // BaseImageAnalyser.kt is 3 of 3 his commits, UnifiedOdometerScreen.kt
        // 20 of 31. The GenAI half is mileageTracker/data/ai/ — he is sole author
        // of InsightsSummaryGenerator.kt and 2 of 3 on AIRouteAnalyzer.kt.
        // This was the largest honestly-claimable gap on the resume: an ATS pass
        // scored him as never having touched CameraX, on the strength of a guess.
        text: "I built the in-app AI assistant: streaming responses, server-held conversation history, voice mode, and a feedback loop ranking what people actually ask. Earlier I built the odometer scanner, a CameraX analyser running ML Kit text recognition so a reading comes off the dashboard instead of the keyboard.",
        tier: 1,
      },
      {
                text: "I owned the GPS pipeline behind a location-type foreground service for 22,000+ DAU: staged dead reckoning over GPS/IMU with a 1D Kalman smoother and spike rejection, surviving Android foreground-service rules, boot restart and battery optimisation. Took tracking accuracy from 50% to 95%.",
        tier: 1,
      },
      {
        label: "Crash Reduction",
        // The short summary asserts the crash figure and, until this was
        // promoted, nothing on the one-pager evidenced it — the strongest
        // number on the page was a claim with no body behind it.
        text: "I took production crashes down 85%. The fix was the concurrency and threading model, not defensive try/catch. Firebase Crashlytics and Sentry caught regressions before users reported them.",
        tier: 1,
      },
      {
        label: "Security Hardening",
        text: "I hardened the app to VAPT and banking compliance: AES-256 Android Keystore field-level encryption, a biometric access gate, and SSL pinning across 9 domains (5 SHA-256 pins) via build flavors.",
        // The summary says "VAPT-grade security" and nothing else on the short
        // cut backed it. These are the numbers that turn that phrase into a
        // checkable claim, and they fit in the space the consulting role left.
        tier: 1,
      },
      {
                text: "I ran the Room persistence layer across two production databases, including all 24 hand-written schema migrations, DataStore, and a WorkManager sync pipeline that keeps working offline and reconciles with the backend when the device comes back.",
        tier: 1,
      },
      {
                text: "I built the in-app review prompting that took the Play Store listing from 1.6 stars across 67 reviews to 4.5 stars across 27,300, and the A/B experiment framework behind it: deterministic hash-based variant assignment across concurrent tests, carried into analytics.",
        // Promoted to the two-pager 2026-09-18. The skills block lists "A/B testing"
        // and until now the bullet proving it sat below the cut, so the strongest
        // number on the page (1.6 to 4.5 stars) had no mechanism attached and the
        // keyword was orphaned. analytics/ExperimentManager.kt is 2 of 2 his.
        // The 1.6 to 4.5 star turnaround is one of his strongest numbers and the one-pager showed it nowhere: the Key Achievements band is two-page only, and this bullet was tier 2. Promoted to fill the page with a result rather than whitespace.
        // Tried at tier 1 on 2026-09-18 and measured: eleven bullets fit the one page,
        // twelve do not, even after tightening this one. The Play Store turnaround
        // stays on the two-pager and the full record. The one-pager's remaining
        // space went to line-height instead, which it needed more.
        tier: 2,
      },
      {
                text: "I built the multi-tenant theme platform: a server-supplied tenant seed colour resolves into a full Material 3 scheme at runtime (MaterialKolor), with dark mode, colour override and Material You owned by the client. Cut UI development friction 60%.",
        // Multi-tenant theming is the clearest platform-engineering evidence on the Dice role, and Mobile Platform Engineer is his second-best lane.
        // Tried at tier 1 on 2026-09-18 alongside Product Growth; the pair took the
        // one-pager to two pages, so this is the one that gives way. The theming work
        // is platform evidence, but the Play Store turnaround is a result, and a
        // result wins the last line on a single page.
        tier: 2,
      },
      {
        // TripAIChatViewModel.kt (858 lines), TripAIChatScreen.kt (1,511) and
        // TripAIHistoryScreen.kt (389) are 100% his. A second, separate LLM surface,
        // which is what makes the AI work read as a pattern rather than one feature.
        tier: 2,
        text: "I built a second assistant inside travel that drafts and amends an itinerary in conversation, reusing the same streaming and history layer.",
      },
      {
        // Untiered: full record only. These fill page three, which the underfill
        // gate reported at 8%, with work that is verified and was simply never
        // written down. All measured across all refs on 2026-09-18.
        // customForm: 190 his commits. qrPaymentsV2: 98 his, 97 the junior's.
        text: "I built the dynamic form engine the expense, travel and procurement modules all render their inputs through, so a new field type is a server change rather than a release.",
      },
      {
        // ManageStorage* / StorageManagement*: 1,745 lines, all his, alongside a
        // Scoped Storage migration that removed READ_EXTERNAL_STORAGE.
        text: "I built the storage management screen and moved the app onto Scoped Storage, dropping the external-storage permission entirely.",
      },
      {
        text: "I built the in-app QR payment flow and the corporate card surfaces alongside the expense modules they settle against.",
      },
      {
        // payables: 137 his commits, 131 the junior's. He designed the module and
        // its repository layer; the junior wrote most of the goods-inward screens
        // under review. "Led" and "through my review", never "I built".
        tier: 2,
        text: "I led the procurement module, from purchase request through goods inward note to invoice, and shipped its vendor-inventory flows through review by the engineer I was mentoring.",
      },
      {
                // CI/CD appeared in every req read in full. He owns the build platform and the bullet was full-record only.
        tier: 2,
        text: "I ran the build platform: Fastlane build, signing and release pipelines, the AGP 9 upgrade, and agent tooling wired into the build itself (Firebender over MCP). Kept the app current through the Android 12 to 17 releases and their Play Console deadlines.",
      },
    ],
  },
  {
    company: "Jugnoo (Jungleworks / Tookan)",
    role: "Software Engineer, Android & Vertical Owner",
    period: "January 2021 - May 2023",
    location: "Remote, India",
    points: [
      {
                text: "I carried Android across a multi-vertical super-app (ride-hailing, carpool, delivery, grocery, bike and car rental, shuttle and wallet) spanning customer, driver and merchant apps with 5M+ Play Store installs. Joined a nine-year-old codebase seven years in, and became one of its primary maintainers.",
        tier: 2,
      },
      {
                // Dropped "instead of the per-client fork that would have been
        // unmaintainable within a year" — it argues for the decision rather
        // than reporting it, and the line bought the crash bullet its space.
        text: "I built a per-tenant flavour system (build config, resource overlays, isolated storage and branding) so 150+ clients ship from one codebase rather than a fork per client, with vertical enablement on server driven feature flags. Cut per-client delivery time 80%.",
        tier: 1,
      },
      {
                text: "I owned requirements and delivery for the P2P carpool, trucking, e-bike and super-app verticals, writing the specs I then had to build.",
        tier: 1,
      },
      {
                text: "I built the Razorpay and Stripe gateway integrations across checkout flows, handled Stripe 3D Secure through an SDK migration, and built the corporate account verification flow from scratch in MVVM.",
        tier: 2,
      },
      {
        // Restored 2026-09-18. An earlier split pulled this out of the
        // spec-ownership bullet and the re-insertion silently failed, so a claim
        // backed by 14 of his commits across wl_carpool_v2, wl_appi_carpool and
        // wl_tama_3.0 had vanished from the resume entirely.
        tier: 2,
        text: "I built the animated and curved polyline rendering behind live ride tracking on Google Maps.",
      },
      {
                // Fills page two with real migration evidence rather than whitespace.
        tier: 2,
        text: "I migrated the toolchain across a multi-branch, multi-client codebase: Kotlin plugin and Gradle 7.0, and the Android 10 to 13 platform changes with the Play Store requirements each brought, without breaking any of the 150+ client builds.",
      },
      {
                // Replaced "Collaborated cross-team on roadmaps with product and backend,
        // cutting engineering overhead 40%" on 2026-09-18. That 40% was round, had
        // no causal path behind it, and claims.json has no entry for it, for
        // "overhead", for "friction" or for "delivery time". It was the single
        // least checkable number in the document. What is left is what happened.
        tier: 2,
        text: "I ran roadmap planning with product and backend across the carpool, trucking and e-bike lines.",
      },
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May 2020 - July 2020",
    location: "Pune, India",
    points: [
      // Deliberately not `core`: a 2020 college internship earns nothing on a
      // senior résumé, and cutting it drops the whole role — which is what
      // finally bought the short cut its second page back. It creates no gap
      // (Jugnoo starts Jan 2021) and it survives intact on the full cut.
      { text: "Built a proof of concept integrating social-media sentiment analysis into financial lending systems to enhance credit-risk modeling." },
    ],
  },
];

