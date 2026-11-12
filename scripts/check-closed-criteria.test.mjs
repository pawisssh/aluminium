// Run from the repo root: node --test scripts/*.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closedIssues, report } from './check-closed-criteria.mjs'

const issue = (...lines) => ['## Acceptance criteria', '', ...lines].join('\n')
const bodies = (map) => new Map(Object.entries(map).map(([n, body]) => [Number(n), body]))

test('finds every issue the text closes, once each', () => {
  assert.deepEqual(closedIssues('Closes #15, closes #17.\nFixes: #18 and resolved #17. Refs #20, see #21.'), [15, 17, 18])
})

test('leaves out a closing keyword quoted as code', () => {
  assert.deepEqual(closedIssues('The check reads `Closes #17`.\n```\nfixes #18\n```\nCloses #19'), [19])
})

test('passes a PR that closes no issue', () => {
  assert.deepEqual(report('Refs #24', bodies({})), [])
})

test('passes when every criterion of a closed issue is ticked, or it has none', () => {
  const issues = bodies({ 17: issue('- [x] Draws the Brick', '- [X] Exports it'), 18: 'No criteria here.' })
  assert.deepEqual(report('Closes #17, closes #18', issues), [])
})

test('fails on an unticked criterion, naming the issue and the criterion', () => {
  const issues = bodies({ 17: issue('- [x] Draws the Brick', '- [ ] Records the Monthly Cost') })
  const lines = report('Closes #17', issues).join('\n')
  assert.match(lines, /#17/)
  assert.match(lines, /Records the Monthly Cost/)
  assert.doesNotMatch(lines, /Draws the Brick/)
})

test('passes once the PR lists each unticked criterion under Open criteria', () => {
  const issues = bodies({ 17: issue('- [ ] Records the Monthly Cost', '- [ ] Shows the Bricks tab') })
  const one = 'Closes #17\n\n## Open criteria\n\n- #17: Monthly Cost has no source yet\n'
  assert.match(report(one, issues).join('\n'), /lists 1 of them/)
  assert.deepEqual(report(`${one}- #17: the Bricks tab is not in this PR\n\n## Evidence\n`, issues), [])
})

test('counts a listed line only under the Open criteria heading and only for its own issue', () => {
  const issues = bodies({ 17: issue('- [ ] Records the Monthly Cost') })
  assert.notDeepEqual(report('Closes #17\n\n## Notes\n\n- #17: not shown', issues), [])
  assert.notDeepEqual(report('Closes #17\n\n## Open criteria\n\n- #18: not shown', issues), [])
})

test('leaves out a criterion quoted as code in the issue', () => {
  const issues = bodies({ 17: issue('- [x] Done', '```', '- [ ] Criterion 1', '```') })
  assert.deepEqual(report('Closes #17', issues), [])
})
