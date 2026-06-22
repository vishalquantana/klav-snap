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
# Self-heal a WEDGED checkout: a 120s-killed mid-merge can leave unmerged files
# ("cannot checkout master / dashboard.html: needs merge") that froze integration
# until a human reset it. Force through it so the loop NEVER needs an orchestrator.
git merge --abort 2>/dev/null
git checkout -qf master 2>/dev/null || { git reset -q --hard 2>/dev/null; git clean -fdq 2>/dev/null; git checkout -qf master 2>/dev/null || { log "cannot checkout master after self-heal"; exit 1; }; }
git reset -q --hard origin/master 2>/dev/null   # single writer ⇒ align to origin
git clean -fdq 2>/dev/null                       # drop any stray untracked from a killed cycle

base_ver=$(sed -n 's/.*"version": *"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' package.json | head -1)
[ -z "$base_ver" ] && base_ver="0.0.0"

# Branches to never auto-ship (locked research / explicitly held). Edit freely.
EXCLUDE_RE='^feat/klavity-os-trails'
QUIET_MIN=45   # don't merge a branch whose last commit is younger than this (mid-burst)
now=$(date +%s)

# --- Post-merge integrity gate -------------------------------------------
# WHY: we merge -X theirs. A worker branch on a STALE base then silently wins
# its old copy of any file master fixed since — NOT a conflict, so it ships
# corruption (this reverted kanban-search, embedCopy, sim-widget repeatedly).
# After each merge we re-check protected invariants vs the PRE-merge tree and
# REVERT just that branch if it regressed any. Good branches in the same cycle
# are kept. Extend PROTECTED_* freely.
DASH="prototype/public/dashboard.html"
WIDGET_BUNDLE="packages/sdk/dist/klavity-widget.iife.js"
# "feature markers" whose count in $DASH must never DROP across a merge.
PROTECTED_PATTERNS=('kanbanSearch\|kb-toolbar' 'embedCopy')
dash_count(){ [ -f "$DASH" ] && grep -c "$1" "$DASH" 2>/dev/null || echo 0; }

changed=0; merged=""
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -E '^feat/'); do
  echo "$b" | grep -qE "$EXCLUDE_RE" && continue
  ahead=$(git rev-list --count "master..$b" 2>/dev/null || echo 0)
  [ "${ahead:-0}" -eq 0 ] && continue
  ct=$(git log -1 --format=%ct "$b" 2>/dev/null || echo 0)
  age=$(( now - ct ))
  [ "$age" -lt "$QUIET_MIN" ] && { log "skip $b (committed ${age}s ago, still hot)"; continue; }

  pre=$(git rev-parse HEAD)
  pre_counts=(); for p in "${PROTECTED_PATTERNS[@]}"; do pre_counts+=("$(dash_count "$p")"); done

  if git merge --no-edit -X theirs "$b" >/dev/null 2>&1; then
    why=""
    # 1) protected dashboard feature counts must not drop below pre-merge
    for i in "${!PROTECTED_PATTERNS[@]}"; do
      post=$(dash_count "${PROTECTED_PATTERNS[$i]}")
      [ "$post" -lt "${pre_counts[$i]}" ] && why="$why ${PROTECTED_PATTERNS[$i]}(${pre_counts[$i]}->$post)"
    done
    # 2) committed widget bundle must stay valid JS (a broken bundle ships silently)
    if command -v node >/dev/null && [ -f "$WIDGET_BUNDLE" ] && ! node --check "$WIDGET_BUNDLE" >/dev/null 2>&1; then
      why="$why widget-bundle-syntax"
    fi
    if [ -n "$why" ]; then
      log "!!! INTEGRITY GATE BLOCKED $b — reverting (stale-base regressed:$why). Branch must rebase onto master."
      git reset -q --hard "$pre"
    else
      log "merged $b (+$ahead)"; changed=1; merged="$merged $b"
    fi
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
