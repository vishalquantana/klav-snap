#!/usr/bin/env bash
#
# gen-changelog.sh — rebuild the orchestrator-era section of CHANGELOG.md from the
# merge-train's integration history.
#
# Why: the merge-train stamps the version manifests on every integration but never
# writes a CHANGELOG entry, so CHANGELOG.md drifted (stuck ~0.39.5 while prod shipped
# 0.39.100+). Every shipped version is, however, recorded as an
#   "orchestrator: integrate feat/<branch> [feat/<branch> …] → v<X.Y.Z>"
# commit on master. This script reconstructs one Keep-a-Changelog entry per shipped
# version from those commits, deriving a readable title from each feature branch name,
# and re-attaches the hand-written pre-merge-train history verbatim.
#
# Idempotent: re-run any time to refresh. Reads the frozen tail back out of the
# current CHANGELOG.md, so running it repeatedly is safe.
#
# Usage:
#   scripts/gen-changelog.sh [git-ref]      # default ref: origin/master
#
# NOTE: this is a standalone maintenance script. It intentionally does NOT touch the
# live merge-train (scripts/merge-train.sh) — wiring it into the train is the
# orchestrator's call.
set -euo pipefail

REF="${1:-origin/master}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"

# Versions from here DOWN predate the merge-train (no "integrate … → v" commit exists
# for them) and are hand-written — preserved verbatim as the "frozen tail".
FROZEN_FROM="## [0.39.4]"

emit_header() {
  cat <<'EOF'
# Changelog

All notable changes to **Klavity Snap** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning is anchored in [`docs/PRD.md`](docs/PRD.md). The version there, the
top entry here, and every `package.json` (`/`, `core`, `extension`, `sdk`) plus
the extension `manifest.json` always move together. See the PRD's _Versioning_
section for the bump rules.

> Entries from the top down to the first hand-written version are auto-generated
> from the merge-train integration history by `scripts/gen-changelog.sh`
> (one entry per shipped version, titled from its feature branch). Re-run that
> script to refresh after new versions ship.
EOF
}

# feat/widget-menu-width-position -> "Widget menu width position"
titleize() {
  local b="${1#feat/}"
  b="${b//-/ }"
  b="${b//_/ }"
  printf '%s%s' "$(printf '%s' "${b:0:1}" | tr '[:lower:]' '[:upper:]')" "${b:1}"
}

# Generated, newest-first: one "## [version] — date" block per integrate commit.
emit_generated() {
  git log "$REF" --date=short --format='%ad%x09%s' \
    | grep -E 'orchestrator: integrate .+ → v[0-9]+\.[0-9]+\.[0-9]+' \
    | while IFS=$'\t' read -r date subj; do
        ver="$(printf '%s' "$subj"   | sed -E 's/.*→ v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
        branches="$(printf '%s' "$subj" | sed -E 's/^orchestrator: integrate (.+) → v[0-9.]+.*/\1/')"
        printf '## [%s] — %s\n\n### Shipped\n' "$ver" "$date"
        for br in $branches; do
          printf -- '- **%s** (`%s`)\n' "$(titleize "$br")" "$br"
        done
        printf '\n'
      done
}

# Hand-written history that predates the merge-train: everything from FROZEN_FROM down.
emit_frozen_tail() {
  awk -v marker="$FROZEN_FROM" 'index($0, marker) == 1 { f = 1 } f { print }' "$CHANGELOG"
}

if ! grep -qF "$FROZEN_FROM" "$CHANGELOG"; then
  echo "error: frozen boundary '$FROZEN_FROM' not found in $CHANGELOG — refusing to clobber." >&2
  exit 1
fi

tmp="$(mktemp)"
{
  emit_header
  printf '\n'
  emit_generated
  emit_frozen_tail
} > "$tmp"
mv "$tmp" "$CHANGELOG"

count="$(git log "$REF" --format='%s' | grep -cE 'orchestrator: integrate .+ → v[0-9]+\.[0-9]+\.[0-9]+')"
echo "Regenerated $CHANGELOG from $REF: $count shipped versions + frozen tail from '$FROZEN_FROM'."
