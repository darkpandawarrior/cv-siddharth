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
  points: ExperiencePoint[];
}

export const experience: Experience[] = [
  {
    company: "Neev Consulting",
    role: "Consulting Engineer, Platform & AI",
    period: "April 2026 - Present",
    points: [
      {
        label: "Agentic ERP",
        text: "Built the LLM assistant layer of an ERPNext/Frappe consulting ERP: business-context resolution, capability discovery, and an AI capability gate that defaults OFF with a test proving it. Models client to project to PO to milestone to GST invoice to payment end to end.",
        // Deliberately not tier 1. Four months of concurrent consulting reads as
        // a side engagement next to the Dice platform ownership, and on a single
        // page it was spending a heading plus four lines to say so. Dropping the
        // whole role off the one-pager bought back the leadership and security
        // bullets below, which is what a Lead loop actually asks about. Intact
        // on both longer cuts.
        tier: 2,
      },
      {
        label: "Platform",
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
    role: "SDE-2, Android & Product Owner",
    period: "June 2023 - Present",
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
        text: "Own the Android platform end to end, a ~964k-LOC Kotlin app serving 50,000+ MAU, as both technical owner and Product Owner. Set the module architecture, release process and review standards the team builds against.",
        tier: 1,
      },
      {
        label: "Scope",
        text: "Owned requirements as well as delivery on the same platform. Here they are one job, not a handoff. Sprint planning, feature and code allocation across the team, review, release, deployment, and the crash dashboard the morning after. The platform work is deliberately the kind other people build on: a new client ships without anyone writing UI code, nobody forks the app to brand it, and every release goes out through the pipeline.",
      },
      {
        label: "Team",
        // The one claim a Lead loop opens with, and the only one the summary
        // and Key Results don't already carry — full-record-only until the
        // concurrent consulting role came off the top of the one-pager.
        // "He now manages this app at the company that acquired it" is the
        // proof the mentoring took, but next to "own the Android platform end
        // to end" four lines above it reads as a contradiction — and it was the
        // last line the crash bullet needed. It survives on both longer cuts,
        // where the Scope bullet gives it the room to make sense.
        text: "Led interview loops and helped hire onto both the frontend and the React Native mobile teams; mentored a junior engineer from Flutter to production Kotlin, Java and React.",
        tier: 1,
      },
      {
        // Always renders directly under Team, so "that engineer" has its
        // referent. Untiered — full record only.
        label: "Mentorship Outcome",
        text: "That engineer now manages this app at the company that acquired it.",
      },
      {
        label: "Compose Migration",
        // "checked screen by screen ... so nothing regressed" was a paraphrase
        // of "zero regressions" written to slip past the claim-audit regex that // claim-audit:allow
        // forbids exactly that phrase — Dice has 31 unit-test files, 4
        // androidTest and ZERO Compose UI tests, so there is no safety net to
        // claim. This is the wording claims.json itself prescribes, and it says
        // the mechanism instead of promising an outcome nothing measured.
        text: "Led the migration off legacy Java and XML: ~87% of the UI layer is now Compose, migrated incrementally through interop with per-screen parity checks against the legacy XML baseline.",
        tier: 1,
      },
      {
        label: "Location Engineering",
        text: "Own the GPS pipeline behind a location-type foreground service for 22,000+ DAU: staged dead reckoning over GPS/IMU with a 1D Kalman smoother and spike rejection so implausible jumps never reach the buffer, taking tracking accuracy from 50% to 95%.",
        tier: 1,
      },
      {
        label: "Crash Reduction",
        // The short summary asserts "80% fewer crashes" and, until this was
        // promoted, nothing on the one-pager evidenced it — the strongest
        // number on the page was a claim with no body behind it.
        text: "Reduced production crashes 80% at 22,000+ daily users. The fix was the concurrency and threading model, not defensive try/catch. Crashlytics and Sentry catch regressions before users report them.",
        tier: 1,
      },
      {
        label: "Security Hardening",
        text: "Hardened the app to VAPT/banking compliance: AES-256 Android Keystore field-level encryption, a biometric access gate, and SSL pinning across 9 domains (5 SHA-256 pins) via build flavors.",
        // The summary says "VAPT-grade security" and nothing else on the short
        // cut backed it. These are the numbers that turn that phrase into a
        // checkable claim, and they fit in the space the consulting role left.
        tier: 1,
      },
      {
        label: "Data Layer",
        text: "Own the Room persistence layer across two databases with 24 verified production schema migrations.",
      },
      {
        label: "Product Growth",
        text: "Built the in-app review prompting that moved the Play Store listing from 1.6★ across 67 reviews to 4.5★ across 27,300, the rating a prospective customer sees before they install anything.",
      },
      {
        label: "Travel Platform",
        text: "Shipped the Android side of Trip V2: Itinerary V2, GIN screens, and full Mixpanel instrumentation.",
      },
      {
        label: "UI Platform",
        text: "Built the multi-tenant theme platform: a server-supplied tenant seed colour resolves into a full Material 3 scheme at runtime (MaterialKolor), with the client owning dark mode, user colour override, palette style, Material You and variant, cutting UI development friction 60% without touching feature code per client.",
        tier: 2,
      },
      {
        label: "CI/CD & Automation",
        text: "Own the build platform: automated Fastlane build, signing and release pipelines, and drove the AGP 9 upgrade across the whole app, and wired agent tooling into the build itself (Firebender over MCP).",
      },
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android & Vertical Owner",
    period: "January 2021 - May 2023",
    points: [
      {
        label: "Multi-Tenant Platform Ownership",
        text: "Owned Android across a multi-vertical super-app (ride-hailing, carpool, delivery, grocery, bike and car rental, shuttle and wallet) spanning customer, driver and merchant apps. Joined a nine-year-old codebase seven years in, and became one of its primary maintainers.",
        tier: 2,
      },
      {
        label: "White-Label Platform, Productising Variation",
        // Dropped "instead of the per-client fork that would have been
        // unmaintainable within a year" — it argues for the decision rather
        // than reporting it, and the line bought the crash bullet its space.
        text: "Built a per-tenant flavour system (build config, resource overlays, isolated storage and branding) so 150+ clients ship from one codebase across the customer and driver apps, rather than a fork per client. Cut per-client delivery time 80%.",
        tier: 1,
      },
      {
        label: "Product-Line Ownership",
        text: "Owned both the requirements and the implementation for the P2P carpool, trucking, e-bike and super-app verticals, writing the specs I then had to build.",
        tier: 1,
      },
      {
        label: "Payments at Scale",
        text: "Implemented Razorpay, Stripe, Beyonic and HyperPay gateway integrations across checkout flows; built Stripe 3DS payment retry/recovery handling and a corporate-account KYC verification flow from scratch.",
        tier: 2,
      },
      {
        label: "Platform Modernization",
        text: "Migrated the toolchain across a multi-branch, multi-client codebase: Kotlin plugin and Gradle 7.0 migrations, ViewBinding adoption, and Android 13 (API 33) compliance, without breaking any of the 150+ client builds riding on it.",
      },
      {
        label: "Cross-Functional Engineering",
        text: "Collaborated cross-team on roadmaps with product and backend, cutting engineering overhead 40%.",
      },
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May 2020 - July 2020",
    points: [
      // Deliberately not `core`: a 2020 college internship earns nothing on a
      // senior résumé, and cutting it drops the whole role — which is what
      // finally bought the short cut its second page back. It creates no gap
      // (Jugnoo starts Jan 2021) and it survives intact on the full cut.
      { text: "Built a proof of concept integrating social-media sentiment analysis into financial lending systems to enhance credit-risk modeling." },
    ],
  },
];

