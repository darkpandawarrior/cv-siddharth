import { expect, it, vi } from "vitest";
import { parseCape, fetchCape, capeLabel } from "./cape";
it("uses the latest hourly model value, rejects null/negative/stale readings", () => {
  const now = new Date("2026-09-30T12:30:00Z");
  const reading = parseCape({ hourly: { time: ["2026-09-30T12:00", "2026-09-30T13:00"], cape: [123, 999] } }, now);
  expect(reading?.cape).toBe(123);
  expect(capeLabel(reading!)).toContain("atmospheric instability proxy, not lightning");
  for (const cape of [null, -1, Infinity]) expect(parseCape({ hourly: { time: ["2026-09-30T12:00"], cape: [cape] } }, now)).toBeNull();
  expect(parseCape({ hourly: { time: ["2026-09-29T12:00"], cape: [123] } }, now)).toBeNull();
});
it("timeouts and HTTP failures are retriable, validates point before fetch", async () => {
  const get = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  await expect(fetchCape(91, 1, new Date(), get)).rejects.toThrow("invalid");
  expect(get).not.toHaveBeenCalled();
  await expect(fetchCape(1, 1, new Date(), get)).rejects.toThrow("unreachable");
  expect(get.mock.calls[0][1]).toHaveProperty("signal");
});
