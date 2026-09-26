#!/usr/bin/env bash
# Watchdog wrapper for headless Blender --background renders on this 16 GB
# Mac. Runs the given script in the background and kills it if it exceeds
# the timeout, so a future hang (a stuck BVH build, a runaway geometry-nodes
# scatter, a genuine Metal/GPU deadlock) fails loud in well under a minute
# by default instead of silently burning 7+ minutes at ~0% CPU with no
# diagnostic output (see the ROOT CAUSE note in lookdev-spawn.py's
# scatter_branch()). macOS ships no `timeout`(1), hence this wrapper.
#
# Usage: render-watchdog.sh <script.py> [timeout_seconds] [-- <script args>]
set -euo pipefail

SCRIPT="${1:?usage: render-watchdog.sh <script.py> [timeout_seconds] [-- args]}"
shift
TIMEOUT=60
if [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]]; then
  TIMEOUT="$1"
  shift
fi
[[ "${1:-}" == "--" ]] && shift

BLENDER="${BLENDER_EXECUTABLE:-/opt/homebrew/bin/blender}"

"$BLENDER" --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python "$SCRIPT" "$@" &
PID=$!

elapsed=0
while kill -0 "$PID" 2>/dev/null; do
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "WATCHDOG_TIMEOUT: killing PID $PID after ${elapsed}s (limit ${TIMEOUT}s)" >&2
    kill -9 "$PID" 2>/dev/null || true
    exit 124
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

wait "$PID"
