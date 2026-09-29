// LANE W6: pure view-models for the "now playing" vinyl and lichess knight
// glyphs -- both are continuous PRESENCE state, not discrete events (that's
// PulseLayer's/pulseEvents.ts's job for the transition edges). No three, no
// React.
import type { SpotifyNow } from "../../../../api/_lib/spotify-handler.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

export interface SpotifyGlyph {
  track: string;
  artist: string;
}

export interface LichessGlyph {
  playing: boolean;
  label: string;
}

/** The vinyl glyph shows ONLY while Spotify reports something actually
 *  playing right now -- `recent` (paused/stopped/refused) never renders it,
 *  so the glyph is never a stale value dressed as live. */
export function spotifyGlyph(spotify: SpotifyNow | null): SpotifyGlyph | null {
  if (!spotify?.connected || !spotify.isPlaying || !spotify.track) return null;
  return { track: spotify.track, artist: spotify.artist ?? "unknown artist" };
}

/** Shows while online OR playing -- offline (or the feed down) hides it. */
export function lichessGlyph(lichess: SignalsResponse["lichess"]): LichessGlyph | null {
  if (!lichess || (!lichess.online && !lichess.playing)) return null;
  return { playing: lichess.playing, label: lichess.playing ? "playing now" : "online, not playing" };
}
