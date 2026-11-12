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
expect fail 'commit-msg fails on an Avoid word' git commit -q --allow-empty -m "Draw the Heatmap"
expect pass 'commit-msg passes a plain message' git commit -q --allow-empty -m "Draw the Mix case"
expect pass 'commit-msg passes an _Avoid in code_ word' git commit -q --allow-empty -m "Sort the table by column"
printf 'Draw the Mix case\n# ------------------------ >8 ------------------------\nHeatmap\n' >"$tmp/msg"
expect pass 'commit-msg ignores the diff under the scissors line' sh .githooks/commit-msg "$tmp/msg"
git switch -q -c snake-fill && git commit -q --allow-empty -m "On a branch" >/dev/null 2>&1 && git switch -q main
git commit -q --allow-empty -m "On main" >/dev/null 2>&1
expect pass 'commit-msg lets a merge through' git merge -q --no-ff --no-edit snake-fill

# pre-push, with gh faked: $1 is the branch's PR states, $2 how many aluminium runners are online
# (empty when the list cannot be read)
push() { printf 'refs/heads/main abc refs/heads/topic def\n' | PATH="$tmp/bin:$PATH" sh .githooks/pre-push origin url; }
fake_gh() {
  printf '#!/bin/sh\ncase $1 in\n  pr) printf "%s" ;;\n  api) [ -n "%s" ] && echo "%s" || exit 1 ;;\nesac\n' "$1" "$2" "$2" >"$tmp/bin/gh"
  chmod +x "$tmp/bin/gh"
}
fake_gh 'MERGED\n'
expect fail 'pre-push stops a branch whose PR merged' push
fake_gh 'MERGED\nOPEN\n'
expect pass 'pre-push allows a branch with an open PR' push
fake_gh ''
expect pass 'pre-push allows a branch with no PR' push

warns() { push >"$tmp/push" 2>&1 && grep -q 'no runner' "$tmp/push"; }
quiet() { push >"$tmp/push" 2>&1 && ! grep -qi 'runner' "$tmp/push"; }
fake_gh '' 0
expect pass 'pre-push warns while no runner is online, and lets the push through' warns
fake_gh '' 1
expect pass 'pre-push says nothing about runners while one is online' quiet
fake_gh '' ''
expect pass 'pre-push says nothing about runners when their list cannot be read' quiet

exit $failed
