#!/usr/bin/env bash
# Deploy / update Klav on the Vultr box. Run as the `klav` user.
#   first run : clones the repo, then you wire up env + systemd + Caddy (see README.md)
#   updates   : pull latest, reinstall deps, restart the service
set -euo pipefail

REPO="https://github.com/vishalquantana/klav-snap.git"
DIR="/opt/klav"

if [ ! -d "$DIR/.git" ]; then
  echo "→ first clone into $DIR"
  sudo mkdir -p "$DIR" && sudo chown "$(id -un)" "$DIR"
  git clone "$REPO" "$DIR"
else
  echo "→ updating $DIR"
  git -C "$DIR" pull --ff-only
fi

# server.ts has no runtime imports, but install keeps package.json deps in sync
cd "$DIR/prototype" && bun install --production || true

if systemctl list-unit-files | grep -q '^klav.service'; then
  sudo systemctl restart klav
  echo "→ restarted klav.service"
else
  echo "→ klav.service not installed yet — see deploy/README.md step 5"
fi

echo "deployed commit: $(git -C "$DIR" rev-parse --short HEAD)"
