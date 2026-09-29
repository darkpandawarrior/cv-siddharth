import { proxyFeed } from "./proxy-feed.js";
// GVP identifies weekly reports as US government employee products:
// https://volcano.si.edu/gvp_termsofuse.cfm (Weekly Volcanic Activity Report).
export type Volcano = { id: string; name: string; country: string; lat: number | null; lon: number | null; summary: string; week: string; at: number };
const decode = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export function parseVolcanoes(xml: string): Volcano[] {
  if (!/<rss\b/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid RSS");
  const rows: Volcano[] = [];
  // ponytail: bounded RSS subset, not a general XML parser; replace with a
  // maintained XML parser if the upstream changes its simple item format.
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) => decode(match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
    const title = tag("title").match(/^(.*?) \((.*?)\) - Report for (.*?) - /);
    const at = Date.parse(tag("pubDate"));
    if (!title || !Number.isFinite(at)) continue;
    const point = tag("georss:point").split(/\s+/).map(Number);
    const located = point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
    rows.push({ id: tag("guid"), name: title[1], country: title[2], week: title[3], at, lat: located ? point[0] : null, lon: located ? point[1] : null, summary: tag("description").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 900) });
  }
  if (!rows.length && /<item>/.test(xml)) throw new Error("malformed weekly items");
  return rows.slice(0, 80);
}
export async function handleVolcanoes(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const result = await proxyFeed("volcanoes", () => fetch("https://volcano.si.edu/news/WeeklyVolcanoRSS.xml", { signal: AbortSignal.timeout(8000) }), parseVolcanoes,
    { minIntervalMs: 21600000, maxStaleMs: 21600000, maxBytes: 250000, cooldownMs: 21600000, maxCooldownMs: 86400000 });
  if (!result.value || result.stale) return Response.json({ error: "Smithsonian weekly report unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return Response.json({ volcanoes: result.value, fetchedAt: result.at, stale: result.stale, source: "Smithsonian GVP / USGS weekly report" }, { headers: { "cache-control": "public, max-age=0, s-maxage=21600" } });
}
