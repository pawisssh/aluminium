#!/usr/bin/env node
// Merges a pull request once its checks pass on it merged with the latest main.
//
//   node scripts/merge-pr.mjs <pr number> [--tries 6] [--method merge|squash]
//
// main has no branch protection, so GitHub merges a branch that is behind main without a word, landing
// a combination no check ran. This script holds that rule itself. Each try:
//   1. merges origin/main into the PR's branch, in the worktree that has it checked out;
//   2. pushes;
//   3. waits for GitHub to see the pushed head and for its checks, stopping on a failed one;
//   4. fetches main again: if it moved meanwhile, starts the next try; otherwise merges that head,
//      as a merge commit by default (main's history is "Merge pull request #n").
// A conflict stops: the merge is aborted and the conflicting files are named, for a person or session
// to resolve with both sides' intent. After the merge, the worktree leaves the merged branch for
// origin/main, detached. Run it in the background: the checks take minutes.
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const behindPattern = /not up to date|head branch is behind|head branch was modified/i
const runners = ['api', 'repos/{owner}/{repo}/actions/runners', '-q', '.runners[] | select(any(.labels[]; .name == "aluminium")) | "\\(.name) \\(.status)"']

/** Runs a command and returns its status and output; never throws. */
export function run(command, args, { cwd } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? result.error?.message ?? '' }
}

/** The worktree that has `branch` checked out, from `git worktree list --porcelain`. */
export function worktreeFor(porcelain, branch) {
  let path
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
    if (line === `branch refs/heads/${branch}`) return path
  }
  return undefined
}

class Stop extends Error {}

/**
 * Lands PR `pr`. `exec(command, args, { cwd })` and `wait(ms)` are injected so tests can script git
 * and gh. Resolves to the merge commit; rejects with a message that says what to do next.
 */
export async function land({ pr, tries = 6, method = 'merge', cwd = process.cwd(), exec = run, wait = (ms) => new Promise((done) => setTimeout(done, ms)), log = console.log, poll = 5000 }) {
  const must = (command, args, options, message) => {
    const result = exec(command, args, options)
    if (result.status !== 0) throw new Stop(`${message}: ${(result.stderr || result.stdout).trim()}`)
    return result.stdout.trim()
  }
  const view = (fields) => JSON.parse(must('gh', ['pr', 'view', String(pr), '--json', fields], { cwd }, `PR ${pr}: gh pr view failed`))
  const runnerStatus = () => exec('gh', runners, { cwd }).stdout.trim().replace(/\n/g, ', ') || 'gh could not list the runners'

  try {
    if (method !== 'merge' && method !== 'squash') throw new Stop(`--method is merge or squash, not ${method}`)
    const { headRefName: branch, state } = view('headRefName,state')
    if (state === 'MERGED') return view('mergeCommit').mergeCommit?.oid
    if (state !== 'OPEN') throw new Stop(`PR ${pr} is ${state}`)
    const dir = worktreeFor(must('git', ['worktree', 'list', '--porcelain'], { cwd }, 'git worktree list failed'), branch)
    if (!dir) throw new Stop(`PR ${pr}: no worktree has ${branch} checked out; check it out (git worktree add <dir> ${branch}) and run this again`)
    const git = (args, message) => must('git', ['-C', dir, ...args], {}, message)
    const count = (range) => Number(git(['rev-list', '--count', range], `git rev-list ${range} failed`))
    git(['fetch', '-q', 'origin', branch], 'git fetch failed')
    if (count(`origin/${branch}..HEAD`) > 0) throw new Stop(`PR ${pr}: ${dir} has commits on ${branch} that are not on origin; push them (and let the checks run) before landing`)

    for (let attempt = 1; attempt <= tries; attempt += 1) {
      if (git(['status', '--porcelain', '--untracked-files=no'], 'git status failed')) throw new Stop(`PR ${pr}: ${dir} has uncommitted changes; commit or set them aside first`)
      git(['fetch', '-q', 'origin', 'main', branch], 'git fetch failed')
      if (count(`HEAD..origin/${branch}`) > 0) {
        if (exec('git', ['-C', dir, 'merge', '-q', '--ff-only', `origin/${branch}`]).status !== 0) throw new Stop(`PR ${pr}: ${branch} and origin/${branch} have diverged; merge origin/${branch} into ${dir} first`)
        log(`took the commits pushed to ${branch} from elsewhere`)
      }
      if (count('HEAD..origin/main') > 0) {
        const merged = exec('git', ['-C', dir, 'merge', '--no-edit', '-q', 'origin/main'])
        if (merged.status !== 0) {
          const files = exec('git', ['-C', dir, 'diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n').filter(Boolean)
          exec('git', ['-C', dir, 'merge', '--abort'])
          throw new Stop(`PR ${pr}: merging origin/main conflicts in ${files.join(', ') || 'files git did not list'}; the merge is aborted. Merge origin/main into ${dir}, keep both sides' intent, run npm run check in each tool it touches, commit, then run this again`)
        }
        log(`try ${attempt}: merged origin/main into ${branch} (${git(['rev-parse', '--short', 'HEAD'], 'git rev-parse failed')})`)
      }
      if (count(`origin/${branch}..HEAD`) > 0) {
        git(['push', '-q', 'origin', `HEAD:refs/heads/${branch}`], `PR ${pr}: push failed`)
        log(`try ${attempt}: pushed ${branch}`)
      }
      // Until GitHub sees the pushed head, gh reports the last head's checks, which may have passed.
      const head = git(['rev-parse', 'HEAD'], 'git rev-parse failed')
      for (let waited = 0; view('headRefOid').headRefOid !== head; waited += 1) {
        if (waited * poll >= 5 * 60_000) throw new Stop(`PR ${pr}: GitHub still shows another head than ${head} after five minutes`)
        await wait(poll)
      }
      for (let waited = 0; /no checks reported/i.test(exec('gh', ['pr', 'checks', String(pr)], { cwd }).stderr); waited += 1) {
        if (waited * poll >= 5 * 60_000) throw new Stop(`PR ${pr}: no checks registered after five minutes. Runners: ${runnerStatus()}`)
        await wait(poll)
      }
      log(`try ${attempt}: waiting for the checks on ${head.slice(0, 7)} (they sit queued while no aluminium runner is online: ${runnerStatus()})`)
      const checks = exec('gh', ['pr', 'checks', String(pr), '--watch', '--fail-fast', '--interval', '30'], { cwd })
      if (checks.status !== 0) throw new Stop(`PR ${pr}: a check failed; not merging\n${exec('gh', ['pr', 'checks', String(pr)], { cwd }).stdout.trim()}${failureCauses(exec, pr, { cwd }).map((cause) => `\n${cause}`).join('')}`)
      // No branch protection: this is where a branch behind main is caught.
      git(['fetch', '-q', 'origin', 'main'], 'git fetch failed')
      if (count('HEAD..origin/main') > 0) {
        log(`try ${attempt}: main moved while the checks ran; again`)
        continue
      }
      const merge = exec('gh', ['pr', 'merge', String(pr), `--${method}`, '--match-head-commit', head], { cwd })
      if (merge.status === 0) {
        const oid = view('mergeCommit').mergeCommit?.oid
        log(`PR ${pr} merged as ${oid}`)
        if (exec('git', ['-C', dir, 'symbolic-ref', '-q', '--short', 'HEAD']).stdout.trim() === branch) {
          git(['fetch', '-q', 'origin', 'main'], 'git fetch failed')
          git(['checkout', '-q', '--detach', 'origin/main'], 'git checkout failed')
          log(`${dir} is now on origin/main (detached)`)
        }
        return oid
      }
      if (!behindPattern.test(merge.stderr + merge.stdout)) throw new Stop(`PR ${pr}: gh pr merge refused: ${(merge.stderr || merge.stdout).trim()}`)
      log(`try ${attempt}: the merge was refused for a moved branch; again`)
    }
    throw new Stop(`PR ${pr}: main moved ${tries} times before a merge went in; run this again`)
  } catch (error) {
    if (error instanceof Stop) throw new Error(error.message)
    throw error
  }
}

/**
 * Each failed check's runner and the first telling line of its failed log. A full /tmp on a WSL runner fails every
 * test at once and reads like a code failure; this names the runner to clear.
 */
export function failureCauses(exec, pr, { cwd } = {}) {
  let checks
  try {
    checks = JSON.parse(exec('gh', ['pr', 'checks', String(pr), '--json', 'name,bucket,link'], { cwd }).stdout)
  } catch {
    return []
  }
  return checks.filter((check) => check.bucket === 'fail').flatMap(({ name, link }) => {
    const job = /\/job\/(\d+)/.exec(link ?? '')?.[1]
    if (!job) return []
    const runner = exec('gh', ['api', `repos/{owner}/{repo}/actions/jobs/${job}`, '-q', '.runner_name'], { cwd }).stdout.trim() || 'unknown'
    const lines = exec('gh', ['run', 'view', '--job', job, '--log-failed'], { cwd }).stdout.split('\n')
    if (lines.some((line) => /No space left on device|ENOSPC/.test(line))) return [`${name}: runner ${runner}: /tmp is full (No space left on device); clear it, then rerun the check`]
    const first = lines.find((line) => /\b(Error|FAIL|not ok)\b/.test(line))
    const text = first?.split('\t').pop().replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, '').trim().slice(0, 200)
    return [`${name}: runner ${runner}${text ? `: ${text}` : ''}`]
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { tries: { type: 'string', default: '6' }, method: { type: 'string', default: 'merge' } } })
  const pr = Number(positionals[0])
  if (!Number.isInteger(pr) || pr <= 0) {
    console.error('Usage: node scripts/merge-pr.mjs <pr number> [--tries 6] [--method merge|squash]')
    process.exit(2)
  }
  try {
    await land({ pr, tries: Number(values.tries), method: values.method })
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
