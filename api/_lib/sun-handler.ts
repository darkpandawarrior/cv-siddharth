import { proxyFeed } from "./proxy-feed.js";
export function parseSun(text: string): { id: number } {
  const value = JSON.parse(text) as { id?: unknown };
  if (typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id <= 0) throw new Error("invalid screenshot ID");
  return { id: value.id };
}
async function metadataText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing metadata body");
  let text = "", bytes = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new Error("solar metadata too large"); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
export async function handleSun(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const result = await proxyFeed("sun", async () => {
    const closest = await fetch(`https://api.helioviewer.org/v2/getClosestImage/?date=${encodeURIComponent(new Date().toISOString())}&sourceId=10`, { signal: AbortSignal.timeout(8000) });
    if (!closest.ok) return closest;
    // Bound metadata before parsing, even though its normal size is <1 KB.
    const text = await metadataText(closest);
    if (text.length > 4096) throw new Error("solar metadata too large");
    const metadata = JSON.parse(text) as { date?: string; name?: string };
    const at = Date.parse((metadata.date ?? "").replace(" ", "T") + "Z");
    if (!Number.isFinite(at) || metadata.name !== "AIA 171" || at > Date.now() + 60000) throw new Error("invalid observation metadata");
    const query = new URLSearchParams({ date: new Date(at).toISOString(), imageScale: "8", layers: "[SDO,AIA,AIA,171,1,100]", x0: "0", y0: "0", width: "256", height: "256" });
    const shot = await fetch(`https://api.helioviewer.org/v2/takeScreenshot/?${query}`, { signal: AbortSignal.timeout(12000) });
    if (!shot.ok) return shot;
    const body = await metadataText(shot);
    if (body.length > 4096) throw new Error("screenshot metadata too large");
    return Response.json({ ...parseSun(body), at });
  }, (text) => {
    const parsed = JSON.parse(text) as { at: number };
    return { ...parseSun(text), at: parsed.at };
  }, { minIntervalMs: 1800000, maxStaleMs: 7200000, maxBytes: 4096, cooldownMs: 1800000, maxCooldownMs: 3600000 });
  if (result.value === null) return Response.json({ error: "Helioviewer solar image unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return Response.json({ image: `https://api.helioviewer.org/v2/downloadScreenshot/?id=${result.value.id}`, observedAt: result.value.at, stale: result.stale, ageMs: result.ageMs, source: "Helioviewer / NASA SDO" }, { headers: { "cache-control": `public, max-age=0, s-maxage=${result.stale ? 30 : Math.max(1, Math.ceil((1800000 - (result.ageMs ?? 0)) / 1000))}` } });
}
