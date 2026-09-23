import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("expires metadata, supports forced refresh, and preserves the snapshot on failure", () => {
  const root = mkdtempSync(join(tmpdir(), "weeb-refresh-"));
  try {
    for (const dir of ["scripts/lib", "data/weeb", "src/data", ".weeb-cache"]) mkdirSync(join(root, dir), { recursive: true });
    copyFileSync(new URL("gen-weeb.mjs", import.meta.url), join(root, "scripts/gen-weeb.mjs"));
    writeFileSync(join(root, "scripts/lib/net.mjs"), `
      import { appendFileSync } from 'node:fs';
      export async function fetchWithTimeout() {
        appendFileSync(${JSON.stringify(join(root, "requests"))}, 'request\\n');
        if (process.env.FAIL_LOOKUP === '1') return new Response('Unavailable', {status: 503});
        return Response.json({data: {Page: {media: [${JSON.stringify({ id: 1, title: { romaji: "Fixture", english: "Fixture" }, genres: [], relations: { edges: [] } })}]}}});
      }
    `);
    writeFileSync(join(root, "data/weeb/anime.csv"), "Name,Watch Status\nFixture,Completed\n");
    writeFileSync(join(root, "data/weeb/manga.csv"), "Name\n");
    const cache = join(root, ".weeb-cache/anilist.json");
    const output = join(root, "src/data/weeb.ts");
    const run = (args = [], fail = false) => spawnSync(process.execPath, [join(root, "scripts/gen-weeb.mjs"), ...args], {
      env: { ...process.env, FAIL_LOOKUP: fail ? "1" : "0" }, encoding: "utf8", timeout: 12000,
    });
    expect(run().status).toBe(0);
    const requests = () => readFileSync(join(root, "requests"), "utf8").trim().split("\n").length;
    expect(requests()).toBe(1);
    expect(run().status).toBe(0);
    expect(requests()).toBe(1);
    const data = JSON.parse(readFileSync(cache, "utf8"));
    data["ANIME:Fixture"]._fetchedAt = 0;
    writeFileSync(cache, JSON.stringify(data));
    expect(run().status).toBe(0);
    expect(requests()).toBe(2);
    expect(run(["--refresh"]).status).toBe(0);
    expect(requests()).toBe(3);
    const before = readFileSync(output, "utf8");
    expect(run(["--refresh"], true).status).toBe(1);
    expect(readFileSync(output, "utf8")).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
