// Run from the repo root: node --test scripts/*.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { land, worktreeFor } from './merge-pr.mjs'

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
const fail = (stderr) => ({ status: 1, stdout: '', stderr })

// A scripted git and gh. `behind` says whether origin/main is ahead of the branch; `movesDuringChecks`
// makes main move while each try's checks run.
function fake({ behind = false, movesDuringChecks = [], mergeMain = ok(), checks = ok(), merge = ok(), state = 'OPEN', unpushed = false } = {}) {
  const calls = []
  let round = 0
  const exec = (command, args) => {
    const line = [command, ...args].join(' ')
    calls.push(line)
    if (line.includes('pr view') && line.includes('headRefName')) return ok(JSON.stringify({ headRefName: 'feature', state }))
    if (line.includes('pr view') && line.includes('mergeCommit')) return ok(JSON.stringify({ mergeCommit: { oid: 'abc123' } }))
    if (line.includes('pr view') && line.includes('headRefOid')) return ok(JSON.stringify({ headRefOid: 'head1' }))
    if (line === 'git worktree list --porcelain') return ok('worktree /repo\nbranch refs/heads/main\n\nworktree /repo/wt\nbranch refs/heads/feature\n')
    if (line.endsWith('rev-list --count HEAD..origin/main')) return ok(behind ? '1' : '0')
    if (line.endsWith('rev-list --count origin/feature..HEAD')) return ok(unpushed ? '1' : '0')
    if (line.includes('rev-list --count')) return ok('0')
    if (line.endsWith('rev-parse HEAD')) return ok('head1')
    if (line.endsWith('merge --no-edit -q origin/main')) {
      if (mergeMain.status === 0) [behind, unpushed] = [false, true]
      return mergeMain
    }
    if (line.includes('push -q origin')) unpushed = false
    if (line.includes('diff --name-only --diff-filter=U')) return ok('GLOSSARY.md\n')
    if (line.includes('--watch')) {
      behind = movesDuringChecks[round++] ?? false
      return checks
    }
    if (line.includes('pr merge')) return merge
    if (line.includes('symbolic-ref')) return ok('feature')
    return ok()
  }
  return { exec, calls }
}

const quiet = { wait: async () => {}, log: () => {} }
const count = (calls, part) => calls.filter((c) => c.includes(part)).length

test('finds the checkout that has the branch', () => {
  const porcelain = 'worktree /a\nbranch refs/heads/main\n\nworktree /b\nbranch refs/heads/feature\n'
  assert.equal(worktreeFor(porcelain, 'feature'), '/b')
  assert.equal(worktreeFor(porcelain, 'other'), undefined)
})

test('merges main, pushes, waits for the checks and merges the head they passed on', async () => {
  const { exec, calls } = fake({ behind: true })
  assert.equal(await land({ pr: 9, exec, ...quiet }), 'abc123')
  assert.ok(calls.includes('git -C /repo/wt push -q origin HEAD:refs/heads/feature'))
  assert.ok(calls.includes('gh pr merge 9 --merge --match-head-commit head1'))
  assert.ok(calls.includes('git -C /repo/wt checkout -q --detach origin/main'))
})

test('squashes with --method squash', async () => {
  const { exec, calls } = fake()
  await land({ pr: 9, method: 'squash', exec, ...quiet })
  assert.ok(calls.includes('gh pr merge 9 --squash --match-head-commit head1'))
})

test('does not merge a branch main moved past while the checks ran: merges main again first', async () => {
  const { exec, calls } = fake({ behind: true, movesDuringChecks: [true, false] })
  assert.equal(await land({ pr: 9, exec, ...quiet }), 'abc123')
  assert.equal(count(calls, 'merge --no-edit -q origin/main'), 2)
  assert.equal(count(calls, 'pr merge'), 1)
})

test('stops on a conflict, aborts the merge and names the files', async () => {
  const { exec, calls } = fake({ behind: true, mergeMain: fail('CONFLICT') })
  await assert.rejects(land({ pr: 9, exec, ...quiet }), /conflicts in GLOSSARY\.md/)
  assert.ok(calls.includes('git -C /repo/wt merge --abort'))
  assert.equal(count(calls, 'pr merge'), 0)
})

test('stops on a failed check before merging', async () => {
  const { exec, calls } = fake({ checks: fail('check failed') })
  await assert.rejects(land({ pr: 9, exec, ...quiet }), /a check failed/)
  assert.equal(count(calls, 'pr merge'), 0)
})

test('stops on a refusal for another reason', async () => {
  const { exec, calls } = fake({ merge: fail('X Pull request #9 is not mergeable: the base branch policy prohibits the merge.') })
  await assert.rejects(land({ pr: 9, exec, ...quiet }), /policy prohibits/)
  assert.equal(count(calls, 'pr merge'), 1)
})

test('refuses local commits that were never pushed', async () => {
  const { exec, calls } = fake({ unpushed: true })
  await assert.rejects(land({ pr: 9, exec, ...quiet }), /not on origin/)
  assert.equal(count(calls, 'push'), 0)
})

test('gives up when main keeps moving', async () => {
  const { exec } = fake({ movesDuringChecks: [true, true] })
  await assert.rejects(land({ pr: 9, tries: 2, exec, ...quiet }), /main moved 2 times/)
})
