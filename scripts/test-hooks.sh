#!/bin/sh
# Runs .githooks against a throwaway repo, so a hook that blocks ordinary work fails CI instead.
# Run from anywhere: sh scripts/test-hooks.sh
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0
expect() {
  want=$1 name=$2
  shift 2
  if "$@" >"$tmp/out" 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then echo "ok: $name"; else echo "FAILED: $name (expected $want)"; sed 's/^/  /' "$tmp/out"; failed=1; fi
}

repo=$tmp/repo
mkdir -p "$repo/scripts" "$repo/tools" "$tmp/bin"
cp -R "$root/.githooks" "$repo/"
cp "$root/GLOSSARY.md" "$repo/"
cp "$root/scripts/check-glossary.mjs" "$repo/scripts/"
cd "$repo" || exit 1
git init -q -b main
git config core.hooksPath .githooks
git config user.name test
git config user.email test@example.com
git add -A && git commit -qm "Start" >/dev/null 2>&1

# commit-msg
expect fail 'commit-msg fails on an Avoid word' git commit -q --allow-empty -m "Draw the Snake"
expect pass 'commit-msg passes a plain message' git commit -q --allow-empty -m "Draw the Ordered layout"
expect pass 'commit-msg passes an _Avoid in code_ word' git commit -q --allow-empty -m "Sort the table by column"
printf 'Draw the Ordered layout\n# ------------------------ >8 ------------------------\nSnake\n' >"$tmp/msg"
expect pass 'commit-msg ignores the diff under the scissors line' sh .githooks/commit-msg "$tmp/msg"
git switch -q -c snake-fill && git commit -q --allow-empty -m "On a branch" >/dev/null 2>&1 && git switch -q main
git commit -q --allow-empty -m "On main" >/dev/null 2>&1
expect pass 'commit-msg lets a merge through' git merge -q --no-ff --no-edit snake-fill

# pre-push, with gh faked to report the branch's PR states
push() { printf 'refs/heads/main abc refs/heads/topic def\n' | PATH="$tmp/bin:$PATH" sh .githooks/pre-push origin url; }
fake_gh() { printf '#!/bin/sh\nprintf "%s"\n' "$1" >"$tmp/bin/gh" && chmod +x "$tmp/bin/gh"; }
fake_gh 'MERGED\n'
expect fail 'pre-push stops a branch whose PR merged' push
fake_gh 'MERGED\nOPEN\n'
expect pass 'pre-push allows a branch with an open PR' push
fake_gh ''
expect pass 'pre-push allows a branch with no PR' push

exit $failed
