/** Placeholder content shown in place of real Spotify data before the
 * SPOTIFY_REFRESH_TOKEN env var is set. Same shape as a real track so the
 * widget's layout doesn't jump once real data arrives — every surface that
 * renders this must visually mark it as a preview, never as real activity. */
export const SPOTIFY_PREVIEW = { track: "Song title", artist: "Artist name" };
