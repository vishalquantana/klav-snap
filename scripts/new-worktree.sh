#!/bin/bash
# Worker helper — spin up an isolated worktree on a fresh feat/<name> branch off
# the latest master. Workers MUST use this; committing on master is hook-blocked.
set -euo pipefail
name="${1:?usage: new-worktree.sh <short-task-name>}"
slug=$(printf '%s' "$name" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g; s/^-//; s/-$//')
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
git fetch -q origin master || true
wt="../klav-snap-wt-$slug"
if git show-ref --quiet "refs/heads/feat/$slug"; then
  echo "branch feat/$slug already exists; reusing"; git worktree add "$wt" "feat/$slug" 2>/dev/null || true
else
  git worktree add -b "feat/$slug" "$wt" origin/master
fi
echo "✅ Worktree ready: $(cd "$wt" && pwd)  (branch feat/$slug)"
echo "   Work + commit on this branch only. The orchestrator merges & deploys automatically."
