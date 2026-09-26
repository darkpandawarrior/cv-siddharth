#!/usr/bin/env bash
# Vercel ignoreCommand. exit 0 = skip build, exit 1 = build. Fail OPEN: any doubt builds.
# See self-healing-spec.md#2.4 B.
[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
{ [ -z "$PREV" ] || ! git cat-file -e "$PREV" 2>/dev/null; } && exit 1   # shallow clone: build
git diff --quiet "$PREV" HEAD -- . \
  ':!.github' ':!docs' ':!**/*.md' ':!**/*.test.*' ':!e2e' ':!scripts/blender' ':!state' && exit 0
exit 1
