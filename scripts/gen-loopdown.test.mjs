import { afterEach, describe, expect, it, vi } from "vitest";

import { previous, shrinkage, uniqueRecords, engagementOf, devtoEngagementFor, fetchDevtoEngagement } from "./gen-loopdown.mjs";

/**
 * The guard that stops a successful-but-empty registry fetch from blanking the
 * writing hub. Two things can break it, and both break it SILENTLY — the
 * generator keeps exiting 0 and the file keeps getting written.
 */
describe("gen-loopdown regression guard", () => {
  it("can actually read the committed writing.ts", () => {
    // If the brace anchor is ever "simplified" to indexOf("{"), the slice
    // starts inside the PostLinks type, JSON.parse throws, previous() returns
    // null, and every shrink below silently passes. This is that canary.
    const prev = previous();
    expect(prev).not.toBeNull();
    for (const k of ["lessons", "series", "archive", "cast"]) expect(prev[k].length).toBeGreaterThan(0);
  });

  it("refuses an empty payload on all four collections, not just lessons", () => {
    const empty = { lessons: [], series: [], archive: [], cast: [] };
    expect(shrinkage(empty, previous()).sort()).toEqual(["archive", "cast", "lessons", "series"]);
  });

  it("lets a genuine addition through", () => {
    const prev = previous();
    const grown = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, [...v, v[0]]]));
    expect(shrinkage(grown, prev)).toEqual([]);
  });

  it("has nothing to compare against on a fresh clone, so it writes", () => {
    expect(shrinkage({ lessons: [], series: [], archive: [], cast: [] }, null)).toEqual([]);
  });
});


it("collapses identical source records but rejects conflicting or missing identities", () => {
  const lesson = { slug: "android-flow", title: "Android flow" };
  expect(uniqueRecords([lesson, { ...lesson }], "slug")).toEqual([lesson]);
  expect(() => uniqueRecords([lesson, { ...lesson, title: "Conflicting title" }], "slug")).toThrow(/Conflicting/);
  expect(() => uniqueRecords([{ title: "No identity" }], "slug")).toThrow(/Missing/);
});

/**
 * The exact bug this lane's brief named: the registry ships an EMPTY `links`
 * object on every lesson (a leftover shape from before per-platform URLs
 * existed) alongside real per-platform URLs under `url_devto`/`url_hashnode`/
 * `url_medium`/`url_linkedin`. Reading `l.links` — what this generator did —
 * always got `{}` back, even on a lesson the source's own url_devto field
 * showed as published. engagementOf reads the url_* fields instead.
 */
describe("engagementOf", () => {
  it("reads the url_* fields, not the source's own always-empty links object", () => {
    const lesson = {
      links: {}, // the registry's leftover shape — must NOT be read
      url_devto: "https://dev.to/x/y",
      url_hashnode: "",
      url_medium: null,
      url_linkedin: undefined,
    };
    expect(engagementOf(lesson)).toEqual({ devto: "https://dev.to/x/y" });
  });

  it("returns an empty object for a lesson with no live platform URL", () => {
    expect(engagementOf({ links: {} })).toEqual({});
  });

  it("carries every platform that has a URL", () => {
    const lesson = {
      url_devto: "https://dev.to/x/1",
      url_hashnode: "https://x.hashnode.dev/1",
      url_medium: "https://medium.com/p/1",
      url_linkedin: "https://linkedin.com/posts/1",
    };
    expect(engagementOf(lesson)).toEqual({
      devto: "https://dev.to/x/1",
      hashnode: "https://x.hashnode.dev/1",
      medium: "https://medium.com/p/1",
      linkedin: "https://linkedin.com/posts/1",
    });
  });
});

describe("devtoEngagementFor", () => {
  it("uses fresh numbers when dev.to has this URL", () => {
    const byUrl = new Map([["https://dev.to/x/1", { reactions: 12, comments: 3 }]]);
    expect(devtoEngagementFor("https://dev.to/x/1", byUrl, { reactions: 1, comments: 0 })).toEqual({
      devto: { reactions: 12, comments: 3 },
      engagementStale: false,
    });
  });

  it("keeps the committed numbers and marks them stale when the fetch failed (byUrl is null)", () => {
    expect(devtoEngagementFor("https://dev.to/x/1", null, { reactions: 9, comments: 2 })).toEqual({
      devto: { reactions: 9, comments: 2 },
      engagementStale: true,
    });
  });

  it("keeps the committed numbers and marks them stale when dev.to no longer lists this URL", () => {
    const byUrl = new Map(); // fetch succeeded, this article just isn't in it
    expect(devtoEngagementFor("https://dev.to/x/1", byUrl, { reactions: 9, comments: 2 })).toEqual({
      devto: { reactions: 9, comments: 2 },
      engagementStale: true,
    });
  });

  it("has nothing to report for a lesson with no dev.to URL and no prior numbers", () => {
    expect(devtoEngagementFor(undefined, new Map(), undefined)).toEqual({ devto: undefined, engagementStale: false });
  });
});

describe("fetchDevtoEngagement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps a mocked dev.to response to reactions/comments keyed by canonical URL, exit-safe on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ url: "https://dev.to/x/1", public_reactions_count: 12, comments_count: 3 }],
      }),
    );
    const byUrl = await fetchDevtoEngagement();
    expect(byUrl.get("https://dev.to/x/1")).toEqual({ reactions: 12, comments: 3 });
  });

  it("returns null on a mocked failure instead of throwing, so the caller keeps committed numbers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(fetchDevtoEngagement()).resolves.toBeNull();
  });
});

describe("the committed writing.ts", () => {
  it("gives every lesson a project field (a registry slug string, or null)", () => {
    const prev = previous();
    for (const l of prev.lessons) {
      expect(
        l.project === null || typeof l.project === "string",
        `${l.slug}: project should be a string or null, got ${JSON.stringify(l.project)}`,
      ).toBe(true);
    }
  });

  it("gives every lesson with a devto link a links object that actually carries it", () => {
    // Regression pin for the exact bug engagementOf fixes: a lesson whose
    // `live` URL is a dev.to link must have links.devto populated too, not
    // the source's leftover empty object.
    const prev = previous();
    for (const l of prev.lessons) {
      if (typeof l.live === "string" && l.live.includes("dev.to")) {
        expect(l.links?.devto, `${l.slug}: live is a dev.to URL but links.devto is missing`).toBe(l.live);
      }
    }
  });
});
