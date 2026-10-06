#!/usr/bin/env bash
# Commit generated data and push, retrying with rebase when the remote moved.
set -euo pipefail
MESSAGE="${1:-Auto-update data}"
shift || true
PATHS=("$@")
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -- "${PATHS[@]}"
if git diff --cached --quiet; then
  echo "no changes to commit"
  exit 0
fi
git commit -m "$MESSAGE"
BRANCH="${GITHUB_REF_NAME:-main}"
for attempt in 1 2 3 4 5; do
  if git push origin "HEAD:${BRANCH}"; then exit 0; fi
  echo "push failed (attempt ${attempt}); rebasing"
  git pull --rebase origin "${BRANCH}"
  sleep $((attempt * 3))
done
echo "could not push after retries" >&2
exit 1
