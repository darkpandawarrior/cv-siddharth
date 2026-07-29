#!/usr/bin/env node
// One-time local helper: trades a Spotify Developer app's client id/secret for
// a long-lived refresh token. Not part of the build/refresh pipeline — run by
// hand, once, then paste SPOTIFY_REFRESH_TOKEN into .env.local / Vercel env.
import http from "node:http";
import { config } from "dotenv";

config({ path: ".env.local" });

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPES = "user-read-currently-playing user-read-recently-played";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local first (from your Spotify Developer app).");
  process.exit(1);
}

const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: "code",
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
})}`;

console.log("\nOpen this URL, log in, and approve access:\n\n" + authUrl + "\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") return res.end();
  const code = url.searchParams.get("code");
  res.end("Done — you can close this tab and go back to the terminal.");
  server.close();

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
  });
  const json = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("Token exchange failed:", json);
    process.exit(1);
  }
  console.log("\nAdd this to .env.local and Vercel's env vars:\n");
  console.log(`SPOTIFY_REFRESH_TOKEN=${json.refresh_token}\n`);
});

server.listen(8888);
