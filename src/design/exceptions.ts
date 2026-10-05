// Shared by the rendered audit and the source ratchet.
export type MotionException = { name: string; reason: string } & (
  { seconds: number; scrollDriven?: never } | { scrollDriven: true; seconds?: never }
);
export type TypeException = { selector: string; reason: string } & (
  { rem: number; submittedSize?: never } | { submittedSize: true; rem?: never }
);

// Standalone Canvas scenes retain their tuned rigs. Extra lights still count as drift.
export const SCENE_RIG_ALLOWLIST: { file: string; lights: number; reason: string }[] = [
  { file: "src/Blueprint3D.tsx", lights: 3, reason: "Standalone blueprint Canvas uses hemisphere fill and two hologram lights." },
  { file: "src/FoundationGraphScene.tsx", lights: 4, reason: "Standalone foundation Canvas uses hemisphere fill, a key and two constellation lights." },
  { file: "src/StoryMapScene.tsx", lights: 4, reason: "Standalone story Canvas uses hemisphere fill, a key and two constellation lights." },
  { file: "src/blueprintHologram.tsx", lights: 3, reason: "Standalone hologram Canvas uses ambient fill and two token-coloured lights." },
  { file: "src/Starmap.tsx", lights: 2, reason: "Standalone starmap Canvas uses ambient fill and a distant warm light." },
  { file: "src/chess/ChessArcScene.tsx", lights: 2, reason: "Standalone rating Canvas uses ambient fill and a probe light." },
  { file: "src/chess/GraveyardScene.tsx", lights: 2, reason: "Standalone chessboard Canvas uses ambient fill and a neutral light." },
  { file: "src/chess/RepertoireTreeScene.tsx", lights: 2, reason: "Standalone repertoire Canvas uses ambient fill and a neutral light." },
];

// Entries name status indicators, ambient loops or scroll progress and explain their timing.
export const MOTION_ALLOWLIST: MotionException[] = [
  { name: "chapter-drift", scrollDriven: true, reason: "scroll progress, not a wall-clock cycle" },
  { name: "spin", seconds: 1, reason: "Tailwind loading indicator completes one rotation per second." },
  { name: "pulse", seconds: 2, reason: "Tailwind pending status breathes once every two seconds." },
  { name: "hud-dwell", seconds: 1, reason: "Entry progress encodes the one-second hold threshold." },
  { name: "screen-marquee", seconds: 90, reason: "Ambient infinite carousel loop; a 0.6s cycle would make screenshots unreadable." },
  { name: "aurora-shift", seconds: 16, reason: "Ambient infinite background loop; a 0.6s cycle would read as flicker." },
  { name: "phone-float", seconds: 5, reason: "Ambient infinite phone float; a 0.6s cycle would read as shaking." },
  { name: "float-soft", seconds: 6, reason: "Ambient infinite media float; a 0.6s cycle would read as shaking." },
  { name: "hero-shimmer", seconds: 9, reason: "Ambient infinite hero sheen; a 0.6s cycle would read as flicker." },
  { name: "sheen", seconds: 3.2, reason: "Ambient infinite cover sheen; a 0.6s cycle would read as flicker." },
  { name: "sheen", seconds: 3.5, reason: "Ambient infinite underline sheen; a 0.6s cycle would read as flicker." },
  { name: "cta-breathe", seconds: 3.2, reason: "Ambient infinite CTA glow; a 0.6s cycle would read as flashing." },
  { name: "nav-wiggle", seconds: 2.4, reason: "Ambient infinite navigation illustration; a 0.6s cycle would read as shaking." },
  { name: "glow-pulse", seconds: 4.5, reason: "Ambient infinite featured-media glow; a 0.6s cycle would read as flashing." },
  { name: "term-sweep", seconds: 7, reason: "Ambient infinite terminal sweep; a 0.6s cycle would read as flicker." },
  { name: "breathe", seconds: 2.6, reason: "Ambient infinite staggered dot loop; a 0.6s cycle would read as flashing." },
  { name: "circuit-run", seconds: 8, reason: "Ambient infinite telemetry trace; a 0.6s cycle would outrun its station offsets." },
  { name: "circuit-node-pulse", seconds: 8, reason: "Ambient infinite telemetry stations stay aligned with the eight-second trace." },
  { name: "gps-draw", seconds: 4, reason: "Ambient infinite route illustration; a 0.6s cycle would obscure the track." },
  { name: "gps-pulse", seconds: 1.6, reason: "Ambient infinite location marker; a 0.6s cycle would read as flashing." },
  { name: "boot-caret", seconds: 1, reason: "The boot cursor marks a live build that is still loading." },
  { name: "chat-caret", seconds: 1.05, reason: "The reply cursor marks text that is still streaming." },
  { name: "voice-live", seconds: 1.2, reason: "The microphone or playback indicator marks active audio." },
  { name: "spin", seconds: 4, reason: "Album art rotates while the live track is playing." },
  { name: "pulse-breathe", seconds: 1.6, reason: "The live dot marks a feed that is connected." },
  { name: "pulse-edge-glow", seconds: 1.6, reason: "The map edge marks visitor activity arriving live." },
  { name: "ops-pulse", seconds: 1.6, reason: "The alarm dot marks an unresolved escalation." },
  { name: "status-pulse", seconds: 2.2, reason: "The status dot marks an available live contact or service." },
];

// Site reading sizes are pinned; submitted Kotlin sizes pass only inside the preview root.
export const TYPE_ALLOWLIST: TypeException[] = [
  { selector: "[data-compose-preview]", submittedSize: true, reason: "renders the submitted Kotlin fontSize" },
  { selector: ".project-studio-monogram", rem: 14, reason: "decorative monogram glyph, art not text" },
  { selector: ".project-studio-monogram", rem: 7, reason: "decorative monogram glyph, art not text" },
  { selector: ".piece-body", rem: 1.0625, reason: "Pinned prose size in src/readingMedium.test.ts, the reading floor." },
];
