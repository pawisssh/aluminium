#!/bin/sh
# Installs each tools/<name> app's npm dependencies when its node_modules is missing, as in a fresh
# worktree. Run by the SessionStart hook in .claude/settings.json (with --hook) and before each
# tool's `npm test` and `npm run check`, since the hook does not fire in every session; safe to run
# by hand.
# Installs into the session's checkout, not the one holding this script: the hook's
# $CLAUDE_PROJECT_DIR can name the main checkout while the session works in a worktree. With
# --hook that is the `cwd` in the hook's stdin JSON; otherwise the checkout it is run from.
cwd=$PWD
if [ "$1" = --hook ]; then
  cwd=$(node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s || "{}").cwd ?? process.cwd()))' 2>/dev/null) || cwd=$PWD
fi
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$(dirname "$0")/.." && pwd)
# One line per run in the shared git dir, so any worktree can see whether and where it installed.
log=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/tool-deps.log
note() { [ -d "$(dirname "$log")" ] && echo "$(date '+%F %T') ${1:-run} cwd=$cwd project=${CLAUDE_PROJECT_DIR:--} root=$root $2" >> "$log"; }
status=0
for pkg in "$root"/tools/*/package.json; do
  dir=$(dirname "$pkg")
  name=tools/$(basename "$dir")
  [ -d "$dir/node_modules" ] && continue
  # npm's output is kept only on failure, so a broken install says why instead of failing later.
  if out=$(npm ci --prefix "$dir" --no-audit --no-fund 2>&1); then
    echo "Installed npm dependencies in $name"
    note "$1" "installed $name"
  else
    echo "npm ci failed in $name:"
    echo "$out" | tail -20
    note "$1" "failed $name"
    status=1
  fi
done
[ $status = 0 ] && note "$1" "done"
exit $status
