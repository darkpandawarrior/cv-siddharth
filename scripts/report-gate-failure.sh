#!/usr/bin/env bash
# Opens or updates ONE GitHub issue when a scheduled refresh workflow's
# pre-push gate (tsc -b, lint, test, check:generated) fails. Called from
# refresh-media.yml and refresh-twin.yml, never from ci.yml (a PR gate failure
# already surfaces on the PR itself; this is for a cron with no human watching
# the run).
#
# One issue per workflow (or per check, when the caller passes its own
# title), not one per failed run: a title-scoped search finds the existing
# open issue (if any) and comments on it instead of piling up a new one
# every scheduled run.
#
# Usage: report-gate-failure.sh <workflow-label> [title]
#   title defaults to "ci: <workflow-label> pre-push gate is red". Pass one
#   explicitly to scope the issue to a single check (H2: classify-diff's
#   rejection is a different failure than a red tsc/lint/test/check:generated,
#   and each should update its own issue in place rather than share one).
# Requires: GH_TOKEN (or GITHUB_TOKEN) in the environment, and the standard
# GITHUB_* run-context vars GitHub Actions already sets.
set -euo pipefail

WORKFLOW="${1:?usage: report-gate-failure.sh <workflow-label> [title]}"
TITLE="${2:-ci: ${WORKFLOW} pre-push gate is red}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
BODY="Run ${RUN_URL} failed tsc -b, lint, test, check:generated or classify-diff before the push/merge step. Nothing reached main. refresh-twin discards the local commit with the runner; refresh-media instead leaves its rolling PR open, labelled needs-human, with the full refreshed data on it. Whatever generators succeeded still ran. Fix the failing check (see the run log) or, if a generator legitimately needs to skip a check, say so in that check's own script rather than here."

EXISTING="$(gh issue list --state open --search "in:title \"${TITLE}\"" --json number --jq '.[0].number // empty')"

if [ -n "$EXISTING" ]; then
  gh issue comment "$EXISTING" --body "$BODY"
else
  gh issue create --title "$TITLE" --body "$BODY"
fi
