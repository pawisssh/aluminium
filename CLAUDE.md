## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Tools

`tools/<name>/` holds standalone apps, each with its own `package.json` and `README.md`. Run `npm run check` in one before committing; CI (`.github/workflows/check.yml`) runs the same.

Commit messages and PR text are checked against GLOSSARY.md's _Avoid_ words: by `.githooks/commit-msg` once a clone runs `git config core.hooksPath .githooks`, and by `.github/workflows/pr-text.yml`.

Other sessions may be working in `.claude/worktrees/*` at the same time: check `git worktree list` and open PRs before a rename that spans many files.
