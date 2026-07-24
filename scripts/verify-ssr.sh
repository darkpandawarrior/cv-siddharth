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
# Each signature string below is real client-only rendered content (verified
# against dist/client/ after `npm run build` — see task-9-10-report.md), so
# these checks actually fail if a CSR route starts SSR'ing its body.
#
# ponytail: no associative array (macOS ships bash 3.2 — no -A support, and
# `set -u` makes unquoted `[key]` subscripts blow up as "unbound variable").
# Eight plain lines, same shape as the SSR checks above.
csr_check() {
  curl -s "$BASE/$1" | grep -aqi "<html" && ! curl -s "$BASE/$1" | grep -aFqi "$2" \
    && echo "$1-CSR-SHELL" || { echo "FAIL: $1-CSR-SHELL"; fail=1; }
}
csr_check lab "nine instruments"
csr_check map "Everything connects"
csr_check forge "Move your cursor through it"
csr_check loopdown "Field notes from an engineer who"
csr_check playground "every interactive room, one door"
csr_check terminal "booting sid.android"
csr_check blueprint "Reset the camera and layout"
csr_check compose "write it, watch it recompose"

exit $fail
