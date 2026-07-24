#!/usr/bin/env bash
# Verifies per-route SSR/CSR classification against the PRODUCTION server.
# `npm run dev` never full-SSRs in this TanStack Start version (it only
# serves the shell + client-entry script), so it can't distinguish SSR routes
# from CSR routes. Run `npm run build && npm run serve` (port 3000) first,
# then run this script in another shell.
#
# ponytail: `grep` (no -a) treats the response as binary and silently
# reports no match — the SSR payload embeds a NUL byte inside the router's
# serialized state script tag (e.g. `"__root__\x00"`). Every grep below uses
# `-a` to force text mode; drop it and these checks false-negative even when
# SSR is working.
set -uo pipefail

BASE="http://localhost:4173"

if ! curl -sf -o /dev/null "$BASE/"; then
  echo "ERROR: $BASE is not reachable. Run 'npm run build && npm run serve' first." >&2
  exit 1
fi

fail=0

# SSR: server HTML contains route content in the RAW response (no JS executed).
curl -s "$BASE/" | grep -aqi "Senior Android Engineer" && echo HOME-SSR || { echo "FAIL: HOME-SSR"; fail=1; }
curl -s "$BASE/resume" | grep -aqi "Experience" && echo RESUME-SSR || { echo "FAIL: RESUME-SSR"; fail=1; }
curl -s "$BASE/project/mileway" | grep -aqi "mileway" && echo PROJECT-SSR || { echo "FAIL: PROJECT-SSR"; fail=1; }

# CSR: raw server HTML is the shell only; the route's interactive content is
# NOT pre-rendered (arrives via the client bundle). Assert the shell is
# present AND the route's signature content is ABSENT from the raw response.
curl -s "$BASE/terminal" | grep -aqi "<html" && ! curl -s "$BASE/terminal" | grep -aqi "boot sequence" \
  && echo terminal-CSR-SHELL || { echo "FAIL: terminal-CSR-SHELL"; fail=1; }

for r in blueprint compose playground lab map forge loopdown; do
  curl -s "$BASE/$r" | grep -aqi "<html" && echo "$r-CSR-SHELL" || { echo "FAIL: $r-CSR-SHELL"; fail=1; }
done

exit $fail
