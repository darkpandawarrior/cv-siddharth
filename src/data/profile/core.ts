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
  // The Vercel project was renamed to siddharth-pandalai. cv-siddharth.vercel.app
// still resolves (checked 2026-09-18, both 200) and stays a live alias so every
// link already in the wild keeps working, but a résumé should carry the name the
// project actually has, and the URL reads as his name rather than a repo slug.
  portfolio: "https://siddharth-pandalai.vercel.app",
  // Writing surfaces. Three years of published work is a differentiator most
  // Android candidates do not have, and until now none of it was on the résumé.
  writing: "https://dev.to/darkpandawarrior",
  // No "available immediately" here. Neev Consulting runs to Present on the
  // same page, and in this market a notice period is assumed — the two
  // together read as either hiding unemployment or not intending to serve
  // notice.
  // Location and remote preference are the parts a recruiter can act on; put
  // a real notice period back only when there is a real number to state.
  availability: "Open to remote (worldwide / India) and hybrid in Pune / Bengaluru",
  // Same fact at a third of the width, for the one-pager header where a wrap
  // costs a whole line.
  availabilityShort: "Remote or Pune / Bengaluru",
  // Casual blurb shown on the portfolio homepage hero
  intro:
    "5+ years building production Android. I owned the platform behind a ~964k-LOC financial SaaS app serving 50,000+ monthly users. I joined it with zero Kotlin in the codebase. I took the UI layer to ~87% Compose. Location accuracy, crash-free sessions, architecture a team can move fast in.",
  // One-pager summary. Same claims, a third of the lines — on a single page
  // every line the summary takes is a line the experience section loses, and
  // the experience section is what gets him called.
  summaryShort:
    "Senior Android Engineer, 5+ years in Kotlin. I owned a 964k LOC financial SaaS app as both its technical owner and its Product Owner, from sprint planning through release. I inherited it as Java and took the UI layer to Jetpack Compose and Material 3, on Clean Architecture with MVVM and MVI, immutable UiState over Coroutines and Flow, Hilt, Room and Retrofit. The hardest parts were underneath the UI, in the location pipeline and in performance at scale.",
  // Formal summary shown on the résumé view (ATS-friendly, keyword-dense)
  summary:
    "Senior Android Engineer, 5+ years in Kotlin. I owned the Android platform behind a 964k LOC financial SaaS app as both its technical owner and its Product Owner, from sprint planning and requirements through release and the crash dashboard the next morning. I inherited it as Java with no Kotlin in it and rebuilt it on Clean Architecture with MVVM and MVI, immutable UiState over Coroutines and Flow, Hilt, Room and Retrofit. The depth is in the hard systems and in performance at scale: staged dead reckoning with Kalman smoothing on the GPS pipeline, Android Keystore encryption and SSL pinning that carried the app through VAPT, and a crash reduction that came off the concurrency model rather than defensive catches. Before that, three years owning Android on a white label mobility super app.",
};

export const education = {
  school: "NIT Bhopal (MANIT)",
  degree: "B.Tech, Computer Science & Engineering",
  period: "2017 - 2021",
};

export const metrics = [
  { value: "50k+", label: "monthly active users", detail: "22k+ daily, platform owner at Dice.tech 2023-2026" },
  { value: "95%", label: "GPS accuracy", detail: "up from 50%, by predictive dead reckoning" },
  { value: "85%", label: "crash reduction", detail: "Crashlytics + structured concurrency fixes" },
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
  "Kotlin & Jetpack Compose (Material 3)",
  "Clean Architecture (MVVM / MVI), multi-module",
  // Copied character-for-character from resumeSkills.ts so the one-pager and
  // the longer cuts can never disagree about how strongly KMP is claimed.
  "Kotlin Multiplatform (KMP, building depth)",
  "Android SDK & Jetpack (ViewModel, Lifecycle)",
  "Kotlin Coroutines & Flow, StateFlow / SharedFlow",
  "Hilt / Dagger (dependency injection)",
  "Room, DataStore & WorkManager (2 DBs, 24 production migrations)",
  // The one-pager's "Core:" line is this array verbatim, and it had no
  // networking token at all — Retrofit/REST is a hard filter on most Android
  // reqs. The longer cuts already carry it under Data & Networking.
  "Retrofit / OkHttp & REST APIs",
  "Location Engineering (Dead Reckoning, Kalman, Foreground Services)",
  "Mobile Security (Android Keystore, SSL Pinning, BiometricPrompt)",
  "CI/CD (Fastlane, Gradle, ProGuard/R8), unit & instrumented testing, Google Play Console",
];


export const languages = ["Kotlin", "Java", "Dart", "C++"];
