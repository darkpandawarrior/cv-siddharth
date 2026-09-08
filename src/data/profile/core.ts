// Split from profile.ts along its export seams (arch-L15) — the small,
// self-contained identity/metrics block every route can afford to load.

export const profile = {
  name: "Siddharth Pandalai",
  title: "Senior Android Engineer",
  resumeTitle: "Senior Android Engineer, Mobile Architecture & Platform",
  tagline: "I take Android apps from prototype to platform.",
  location: "Pune, India",
  email: "siddharthpandalai990@gmail.com",
  phone: "+91 8848852062",
  github: "https://github.com/darkpandawarrior",
  linkedin: "https://linkedin.com/in/siddharth-pandalai",
  portfolio: "https://cv-siddharth.vercel.app",
  // No "available immediately" here. Dice.tech runs to Present on the same
  // page, and in this market a notice period is assumed — the two together
  // read as either hiding unemployment or not intending to serve notice.
  // Location and remote preference are the parts a recruiter can act on; put
  // a real notice period back only when there is a real number to state.
  availability: "Open to remote (worldwide / India) and hybrid in Pune / Bengaluru",
  // Same fact at a third of the width, for the one-pager header where a wrap
  // costs a whole line.
  availabilityShort: "Remote or Pune / Bengaluru",
  // Casual blurb shown on the portfolio homepage hero
  intro:
    "5+ years building production Android. I own the platform behind a ~964k-LOC financial SaaS app serving 50,000+ monthly users. I joined it with zero Kotlin in the codebase. ~87% of the UI layer is Compose today. Location accuracy, crash-free sessions, architecture a team can move fast in.",
  // One-pager summary. Same claims, a third of the lines — on a single page
  // every line the summary takes is a line the experience section loses, and
  // the experience section is what gets him called.
  summaryShort:
    "Senior Android Engineer, 5+ years in Kotlin. Technical owner and Product Owner of a ~964k-LOC, 50,000+ MAU financial SaaS app, inherited as Java, now ~87% Jetpack Compose on Clean Architecture, Coroutines, Flow and Hilt. Dead-reckoning location, Keystore security, 80% fewer crashes.",
  // Formal summary shown on the résumé view (ATS-friendly, keyword-dense)
  summary:
    "Senior Android Engineer, 5+ years in Kotlin. Technical owner and Product Owner of a ~964k-LOC, 50,000+ MAU financial SaaS app, inherited as Java with no Kotlin in it and now ~87% Jetpack Compose across the UI layer. Clean Architecture with MVVM/MVI, Coroutines and Flow, Hilt, Room. Hard-systems depth where it counts: staged dead-reckoning location with Kalman smoothing (GPS accuracy 50% to 95%), VAPT-grade on-device security (Android Keystore, SSL pinning), and an 80% production crash reduction at 22,000+ DAU won on the concurrency model, not defensive catches.",
};

export const education = {
  school: "NIT Bhopal (MANIT)",
  degree: "B.Tech, Computer Science & Engineering",
  period: "2017 - 2021",
};

export const metrics = [
  { value: "50k+", label: "monthly active users", detail: "22k+ daily, platform owner at Dice.tech" },
  { value: "95%", label: "GPS accuracy", detail: "up from 50%, by predictive dead reckoning" },
  { value: "80%", label: "crash reduction", detail: "Crashlytics + structured concurrency fixes" },
  { value: "~87%", label: "UI-layer Compose", detail: "455k of 523k UI-layer LOC, verified screen by screen against the legacy XML" },
];

// Key Results on the résumé. The homepage metric band is a hard 4-up grid with
// a parallel METRIC_TARGETS array, so the Play Store turnaround has no cell
// there — but it is one of the strongest numbers on the page and the résumé
// line has room, so it rides along here instead of distorting the grid.
export const resumeMetrics = [
  ...metrics,
  // ASCII only. `★` and `→` come from a fallback font, so Chromium emits them
  // as separate text runs and pdftotext pulls them out of order — this line
  // extracted as "1.6 / 4.5 / ★ Play Store rating", which is what an ATS reads.
  { value: "1.6 to 4.5 stars", label: "on the Play Store", detail: "67 to 27,300 reviews, via in-app review prompting" },
];

// Core competency chips — shown in the résumé header and on LinkedIn
export const competencies = [
  "Kotlin & Jetpack Compose",
  "Clean Architecture (MVVM / MVI)",
  "Kotlin Coroutines & Flow",
  "Hilt Dependency Injection",
  "Room (2 DBs, 24 production migrations)",
  // The one-pager's "Core:" line is this array verbatim, and it had no
  // networking token at all — Retrofit/REST is a hard filter on most Android
  // reqs. The longer cuts already carry it under Data & Networking.
  "Retrofit / OkHttp & REST APIs",
  "Location Engineering (Dead Reckoning, Kalman)",
  "Mobile Security (Android Keystore, SSL Pinning)",
  "CI/CD (Fastlane, Gradle)",
];


export const languages = ["Kotlin", "Java", "Dart", "C++"];
