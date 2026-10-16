#!/usr/bin/env bash
# cv-gate: a mkdir-slot counting semaphore so parallel lanes cannot all run heavy
# headless-WebGL / build work at once.
#
# usage: gate.sh [-n SLOTS] [-d NAME] -- command [args...]
#        gate.sh --self-test
# env:   CV_GATE=off          run the command with no gating
#        CV_GATE_SLOTS=N      slot count (default 2; -n wins)
#        CV_GATE_DIR=PATH     slot root (default /private/tmp/cv-gate)
#        CV_GATE_POLL=SECS    wait between tries (default 1)
set -u

if [ "${1:-}" = "--self-test" ]; then
  exec node "$(dirname "$0")/install.mjs" --self-test
fi

slots="${CV_GATE_SLOTS:-2}"
name="default"
while [ $# -gt 0 ]; do
  case "$1" in
    -n) slots="$2"; shift 2 ;;
    -d) name="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "gate.sh: no command given" >&2; exit 64; }

if [ "${CV_GATE:-}" = "off" ]; then exec "$@"; fi

base="${CV_GATE_DIR:-/private/tmp/cv-gate}/$name"
poll="${CV_GATE_POLL:-1}"
mkdir -p "$base" || exec "$@"   # cannot gate: run rather than block
held=""
child=""

release() { [ -n "$held" ] && rm -rf "$held"; held=""; }
on_signal() { [ -n "$child" ] && kill "$1" "$child" 2>/dev/null; release; exit "$2"; }
trap release EXIT
trap 'on_signal -INT 130' INT
trap 'on_signal -TERM 143' TERM

# A slot is stale when its pid is dead. A slot with no pid file yet is a holder
# between mkdir and the pid write, so only reclaim it once it is over 10 s old.
reclaim_if_stale() {
  local d="$1" pid m
  pid=$(cat "$d/pid" 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -0 "$pid" 2>/dev/null || rm -rf "$d"
  elif [ -d "$d" ]; then
    m=$(stat -f %m "$d" 2>/dev/null || stat -c %Y "$d" 2>/dev/null || echo 0)
    [ $(( $(date +%s) - m )) -gt 10 ] && rm -rf "$d"
  fi
}

announced=""
while :; do
  i=1
  while [ "$i" -le "$slots" ]; do
    d="$base/slot.$i"
    if mkdir "$d" 2>/dev/null; then
      echo "$$" > "$d/pid"; held="$d"; break 2
    fi
    reclaim_if_stale "$d"
    if mkdir "$d" 2>/dev/null; then
      echo "$$" > "$d/pid"; held="$d"; break 2
    fi
    i=$((i + 1))
  done
  [ -n "$announced" ] || { echo "cv-gate[$name]: all $slots slots busy, waiting" >&2; announced=1; }
  sleep "$poll"
done

"$@" &
child=$!
wait "$child"
status=$?
release
exit "$status"
