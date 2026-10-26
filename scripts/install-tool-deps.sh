#!/bin/sh
# Installs each tools/<name> app's npm dependencies when its node_modules is missing, as in a fresh
# worktree. Run by the SessionStart hook in .claude/settings.json and before each tool's `npm test`
# and `npm run check`, since the hook does not fire in every session; safe to run by hand.
# Installs into the checkout it is run from, not the one holding this script: the hook's
# $CLAUDE_PROJECT_DIR can name the main checkout while the session works in a worktree.
root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$(dirname "$0")/.." && pwd)
status=0
for pkg in "$root"/tools/*/package.json; do
  dir=$(dirname "$pkg")
  [ -d "$dir/node_modules" ] && continue
  # npm's output is kept only on failure, so a broken install says why instead of failing later.
  if out=$(npm ci --prefix "$dir" --no-audit --no-fund 2>&1); then
    echo "Installed npm dependencies in tools/$(basename "$dir")"
  else
    echo "npm ci failed in tools/$(basename "$dir"):"
    echo "$out" | tail -20
    status=1
  fi
done
exit $status
