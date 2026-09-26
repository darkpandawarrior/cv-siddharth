// Deliberately impure — purity.test.ts's break-it fixture (G15). Never
// imported by real code or included in the purity scan's own module glob
// (it lives under __fixtures__, not directly in src/world/v2); it exists
// so the test can prove its checker actually fires on each forbidden
// pattern rather than only ever passing.
import { hashNoise, stringSeed } from "../../hash.ts";

export function impureRandom(): number {
  return Math.random();
}

export function impureClock(): number {
  return Date.now();
}

export function impurePerf(): number {
  return performance.now();
}

export function impureDate(): Date {
  return new Date();
}

export function impureIndexSeeded(ids: string[]): number[] {
  return ids.map((_, i) => hashNoise(i));
}

export function impureIndexSeededString(ids: string[]): number[] {
  return ids.map((id, i) => stringSeed(id) + hashNoise(i * 3));
}
