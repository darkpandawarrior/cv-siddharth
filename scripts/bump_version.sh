#!/usr/bin/env bash
# Three-tier versioning — portable (bash) twin of the KMP family's gradle/versioning.gradle.kts.
# Same formula, no build-tool dependency. See Mileway/docs/RELEASE.md §1 for the canonical model.
#
# Source of truth: repo-root MILESTONE (integer — bump to cut a release) + live git commit count
# + today's date. Nothing is hand-typed.
#
#   FINGERPRINT = YYYY.0M.0W.<MILESTONE>.<commitCount>   -> git tag (v<FINGERPRINT>), release title
#   MARKETING   = YYYY.M.<MILESTONE>                      -> display / package.json version
#   BUILDCODE   = 1 + commitCount                         -> monotonic build number
#
# Usage:
#   scripts/bump_version.sh            # print the three computed values, write nothing
#   scripts/bump_version.sh --stamp    # write MARKETING into package.json "version" (if present)
#   scripts/bump_version.sh --milestone# MILESTONE += 1, then --stamp (the release-cut step)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f MILESTONE ] || echo "1" > MILESTONE
mode="${1:-}"
[ "$mode" = "--milestone" ] && echo "$(( $(tr -d '[:space:]' < MILESTONE) + 1 ))" > MILESTONE

milestone="$(tr -d '[:space:]' < MILESTONE)"
commit_count="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
year="$(date +%Y)"; month_padded="$(date +%m)"; month="$((10#$month_padded))"; week_padded="$(date +%V)"

marketing="${year}.${month}.${milestone}"
buildcode="$(( 1 + commit_count ))"
fingerprint="${year}.${month_padded}.${week_padded}.${milestone}.${commit_count}"

echo "MARKETING=${marketing}"
echo "BUILDCODE=${buildcode}"
echo "FINGERPRINT=${fingerprint}"

if [ "$mode" = "--stamp" ] || [ "$mode" = "--milestone" ]; then
  if [ -f package.json ] && grep -q '"version"' package.json; then
    # MARKETING is 3 numeric components — valid semver for npm.
    sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]*(\")/\1${marketing}\2/" package.json && rm -f package.json.bak
    echo "stamped package.json version=${marketing}"
  fi
  echo "Next: commit MILESTONE (+ package.json), tag v${fingerprint}, push."
fi
