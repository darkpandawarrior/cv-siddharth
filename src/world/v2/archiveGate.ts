// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1

export const SOURCE_SPRING_ID = "source-spring";
export function sourceSpringPosition(start: { x: number; z: number }): [number, number, number] {
  return [start.x, 0, start.z];
}

export interface ArchiveSample {
  /** Monotonic seconds, independent of the reality clock. */
  at: number;
  distance: number;
  upstream: boolean;
}

/** Every sample in the last two seconds must remain near and upstream. */
export function shouldOpen(samples: readonly ArchiveSample[]): boolean {
  const last = samples.at(-1);
  if (!last || !Number.isFinite(last.at)) return false;
  const cutoff = last.at - 2;
  let start = samples.length - 1;
  while (start >= 0 && samples[start].at > cutoff) start--;
  if (start < 0) return false;
  return samples.slice(start).every((sample, index, window) =>
    Number.isFinite(sample.at) && Number.isFinite(sample.distance) &&
    sample.distance >= 0 && sample.distance <= 4 && sample.upstream &&
    (index === 0 || sample.at >= window[index - 1].at));
}

/** Samples live telemetry without tying the hold to rendered frames. */
export function watchArchiveGate(read: () => Omit<ArchiveSample, "at">): { reset: () => void; stop: () => void } {
  let samples: ArchiveSample[] = [];
  let opened = false;
  const reset = () => { samples = []; };
  const timer = setInterval(() => {
    if (opened) return;
    const sample = { ...read(), at: performance.now() / 1000 };
    if (!Number.isFinite(sample.distance) || sample.distance > 4 || !sample.upstream) { reset(); return; }
    samples.push(sample);
    while (samples.length > 2 && samples[1].at <= sample.at - 2) samples.shift();
    if (shouldOpen(samples)) { opened = true; openArchive(); }
  }, 50);
  return { reset, stop: () => clearInterval(timer) };
}

const ARCHIVE_URL = "/playground?world=v1";
const documentNavigation = (url: string) => window.location.assign(url);
// One mounted world owns this callback, including the separate R3F root.
let archiveNavigation = documentNavigation;
export function registerArchiveNavigation(navigate: (url: string) => void): () => void {
  archiveNavigation = navigate;
  return () => { archiveNavigation = documentNavigation; };
}

export function openArchive(): void {
  const world = document.querySelector<HTMLElement>('[data-world="v2"]');
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !world) {
    archiveNavigation(ARCHIVE_URL);
    return;
  }
  world.style.transition = "opacity 180ms linear";
  world.style.opacity = "0";
  window.setTimeout(() => archiveNavigation(ARCHIVE_URL), 180);
}
