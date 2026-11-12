#!/usr/bin/env node
// Fails when the PR text on stdin closes an issue that still has an unticked "- [ ]" criterion,
// unless the text lists it: one "- #<n>: …" line under an "## Open criteria" heading for each
// unticked criterion of issue <n>. A merge closes the issue either way, so this is where an unshown
// criterion gets said out loud. The PR text workflow runs it; it reads the issues from GitHub.
// Run: gh pr view <n> --json body -q .body | GITHUB_REPOSITORY=<owner>/<repo> node scripts/check-closed-criteria.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Text quoted as code neither closes an issue nor counts as a criterion.
const withoutCode = (text) => text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '')

// GitHub's closing keywords, in the forms that close an issue of this repo.
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)/gi

export const closedIssues = (prText) => [...new Set([...withoutCode(prText).matchAll(CLOSES)].map((match) => Number(match[1])))]

const unticked = (issueBody) =>
  withoutCode(issueBody)
    .split('\n')
    .filter((line) => /^\s*[-*] \[ \] /.test(line))
    .map((line) => line.trim())

// How many lines under "## Open criteria" name each issue.
function listedOpen(prText) {
  const listed = new Map()
  let inSection = false
  for (const line of withoutCode(prText).split('\n')) {
    if (/^#{1,6}\s/.test(line)) inSection = /^#{1,6}\s+open criteria\s*$/i.test(line)
    const issue = inSection && line.match(/^\s*[-*]\s+#(\d+)\b/)
    if (issue) listed.set(Number(issue[1]), (listed.get(Number(issue[1])) ?? 0) + 1)
  }
  return listed
}

// The lines to print for a failing PR, empty for a passing one. `issueBodies` maps each closed
// issue's number to its body.
export function report(prText, issueBodies) {
  const listed = listedOpen(prText)
  return closedIssues(prText).flatMap((issue) => {
    const open = unticked(issueBodies.get(issue) ?? '')
    const have = listed.get(issue) ?? 0
    if (have >= open.length) return []
    return [`#${issue} is closed by this PR and has ${open.length} unticked, and the PR lists ${have} of them:`, ...open.map((line) => `  ${line}`)]
  })
}

async function issueBody(repo, issue) {
  const token = process.env.GITHUB_TOKEN
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}`, {
    headers: { accept: 'application/vnd.github+json', ...(token && { authorization: `Bearer ${token}` }) },
  })
  if (response.status === 404) return ''
  if (!response.ok) throw new Error(`Criteria: could not read #${issue} (${response.status} ${response.statusText})`)
  const json = await response.json()
  // "#<n>" may be a pull request, which a PR's text does not close.
  return json.pull_request ? '' : (json.body ?? '')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prText = readFileSync(0, 'utf8')
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) throw new Error('Criteria: set GITHUB_REPOSITORY to <owner>/<repo>')
  const issues = closedIssues(prText)
  const bodies = new Map(await Promise.all(issues.map(async (issue) => [issue, await issueBody(repo, issue)])))
  const lines = report(prText, bodies)
  if (lines.length) {
    console.error(
      [
        ...lines,
        '',
        'Tick each criterion a test or an output shows, then re-run this job (docs/agents/issue-tracker.md, "Tick a criterion").',
        "List each one that stays open in the PR's text, which re-runs this job:",
        '',
        '## Open criteria',
        '',
        '- #<n>: <the criterion, and why it stays open>',
      ].join('\n'),
    )
    process.exit(1)
  }
  console.log(`Criteria: ${issues.length} issue(s) closed by this PR, every unticked criterion listed`)
}
