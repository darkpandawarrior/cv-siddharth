import { describe, it, expect } from "vitest";
import { spotifyGlyph, lichessGlyph } from "./reachPresence.ts";

describe("spotifyGlyph", () => {
  it("shows while actually playing", () => {
    expect(spotifyGlyph({ connected: true, isPlaying: true, track: "A", artist: "B", recent: [] })).toEqual({ track: "A", artist: "B" });
  });

  it("hides when connected but paused (recently played is not now playing)", () => {
    expect(spotifyGlyph({ connected: true, isPlaying: false, recent: [{ track: "A", artist: "B" }] })).toBeNull();
  });

  it("hides when disconnected or refused", () => {
    expect(spotifyGlyph({ connected: false, isPlaying: false, recent: [], refusedStatus: 403 })).toBeNull();
    expect(spotifyGlyph(null)).toBeNull();
  });
});

describe("lichessGlyph", () => {
  it("shows 'playing now' during a live game", () => {
    expect(lichessGlyph({ online: true, playing: true })).toEqual({ playing: true, label: "playing now" });
  });

  it("shows online-not-playing", () => {
    expect(lichessGlyph({ online: true, playing: false })).toEqual({ playing: false, label: "online, not playing" });
  });

  it("hides when offline", () => {
    expect(lichessGlyph({ online: false, playing: false })).toBeNull();
  });

  it("hides when the feed is down", () => {
    expect(lichessGlyph(null)).toBeNull();
  });
});
