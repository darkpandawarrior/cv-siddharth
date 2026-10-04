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

export function openArchive(): void {
  const world = document.querySelector<HTMLElement>('[data-world="v2"]');
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !world) {
    window.location.assign("/playground?world=v1");
    return;
  }
  world.style.transition = "opacity 180ms linear";
  world.style.opacity = "0";
  window.setTimeout(() => window.location.assign("/playground?world=v1"), 180);
}
