#!/bin/sh
# Installs each tools/<name> app's npm dependencies when its node_modules is missing, as in a fresh
# worktree. Run by the SessionStart hook in .claude/settings.json; safe to run by hand.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
for pkg in "$root"/tools/*/package.json; do
  dir=$(dirname "$pkg")
  [ -d "$dir/node_modules" ] && continue
  npm ci --prefix "$dir" --no-audit --no-fund >/dev/null
  echo "Installed npm dependencies in tools/$(basename "$dir")"
done
