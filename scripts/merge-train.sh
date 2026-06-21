#!/bin/bash
# merge-train — the orchestrator's single-writer integration pass.
# Assembles every feat/* branch with new commits into master (theirs-wins),
# stamps ONE version, and pushes. Only this script writes master (KLAV_ORCHESTRATOR=1).
set -uo pipefail
export KLAV_ORCHESTRATOR=1
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1
log(){ echo "[$(date '+%F %T')] [merge-train] $*"; }

git fetch -q origin master 2>/dev/null
git checkout -q master 2>/dev/null || { log "cannot checkout master (busy?)"; exit 1; }
git reset -q --hard origin/master 2>/dev/null   # single writer ⇒ align to origin

base_ver=$(sed -n 's/.*"version": *"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' package.json | head -1)
[ -z "$base_ver" ] && base_ver="0.0.0"

# Branches to never auto-ship (locked research / explicitly held). Edit freely.
EXCLUDE_RE='^feat/klavity-os-trails'
QUIET_MIN=45   # don't merge a branch whose last commit is younger than this (mid-burst)
now=$(date +%s)

changed=0; merged=""
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -E '^feat/'); do
  echo "$b" | grep -qE "$EXCLUDE_RE" && continue
  ahead=$(git rev-list --count "master..$b" 2>/dev/null || echo 0)
  [ "${ahead:-0}" -eq 0 ] && continue
  ct=$(git log -1 --format=%ct "$b" 2>/dev/null || echo 0)
  age=$(( now - ct ))
  [ "$age" -lt "$QUIET_MIN" ] && { log "skip $b (committed ${age}s ago, still hot)"; continue; }
  if git merge --no-edit -X theirs "$b" >/dev/null 2>&1; then
    log "merged $b (+$ahead)"; changed=1; merged="$merged $b"
  else
    log "CONFLICT on $b — aborting that merge, skipping (radar should warn)"
    git merge --abort 2>/dev/null
  fi
done

[ "$changed" -eq 0 ] && { log "nothing to integrate"; exit 0; }

# Single monotonic version stamp (base patch + 1), forced across all manifests + PRD.
maj=${base_ver%%.*}; rest=${base_ver#*.}; min=${rest%%.*}; pat=${rest##*.}
next="$maj.$min.$((pat+1))"
for f in package.json packages/core/package.json packages/extension/package.json \
         packages/extension/manifest.json packages/sdk/package.json; do
  [ -f "$f" ] && sed -i '' "s/\"version\": *\"[0-9][0-9.]*\"/\"version\": \"$next\"/" "$f"
done
[ -f docs/PRD.md ] && sed -i '' "s/\(\*\*Version:\*\* \)\`[0-9][0-9.]*\`/\1\`$next\`/" docs/PRD.md

git add -A
git commit -q -m "orchestrator: integrate$merged → v$next" 2>/dev/null
if git push -q origin master 2>/dev/null; then
  log "pushed v$next ($(git rev-parse --short HEAD)) — integrated:$merged"
else
  log "PUSH FAILED (will retry next cycle)"
fi
