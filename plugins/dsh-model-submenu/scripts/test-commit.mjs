/**
 * Selection-commit self-check: what the menu submits when it closes, and what
 * it refuses to submit.
 *
 * The load-bearing assertions are the quiet ones — reopening and closing
 * without touching anything must not write, and clicking the model that is
 * already in use must not write either. The one change that must always land
 * is a marked reasoning level: it survives a model click only when the new
 * model advertises that exact level.
 *
 * Run: node scripts/test-commit.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  effortChoices,
  planEffortCommit,
  planModelCommit,
  sameEffort,
  sameModel,
} from '../src/client/selection.ts'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

let passed = 0
let total = 0
async function test(label, fn) {
  total += 1
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${label}`)
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`)
    throw error
  }
}

/** The reasoning list the catalog advertises for one model. */
const four = { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' }
const three = { efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'xhigh', name: 'XHigh' }] }
const models = { 'magpie/a': four, 'magpie/b': three, 'magpie/c': undefined }

await test('a model with a default offers one segment per advertised level', () => {
  assert.deepEqual(effortChoices(four, 'Default'), [
    { key: 'low', effort: 'low', label: 'Low' },
    { key: 'high', effort: 'high', label: 'High' },
    { key: 'max', effort: 'max', label: 'Max' },
  ])
})

await test('a model without a default prepends the provider-default segment', () => {
  assert.deepEqual(effortChoices(three, 'Default'), [
    { key: 'provider-default', effort: undefined, label: 'Default' },
    { key: 'low', effort: 'low', label: 'Low' },
    { key: 'medium', effort: 'medium', label: 'Medium' },
    { key: 'xhigh', effort: 'xhigh', label: 'XHigh' },
  ])
})

await test('a model with no reasoning offers no segments', () => {
  assert.deepEqual(effortChoices(undefined, 'Default'), [])
})

await test('clicking another level submits it at once', () => {
  assert.deepEqual(planEffortCommit({ provider: 'magpie', model: 'a', reasoningEffort: 'high' }, 'max'), {
    provider: 'magpie', model: 'a', reasoningEffort: 'max',
  })
})

await test('clicking the provider default submits the selection without a level', () => {
  assert.deepEqual(planEffortCommit({ provider: 'magpie', model: 'a', reasoningEffort: 'high' }, undefined), {
    provider: 'magpie', model: 'a',
  })
})

await test('clicking the level already in force submits nothing', () => {
  assert.equal(planEffortCommit({ provider: 'magpie', model: 'a', reasoningEffort: 'high' }, 'high'), null)
})

await test('clicking the provider default when it is already in force submits nothing', () => {
  assert.equal(planEffortCommit({ provider: 'magpie', model: 'a' }, undefined), null)
})

await test('clicking the model already in use submits nothing', () => {
  assert.equal(planModelCommit(
    { provider: 'magpie', model: 'a', reasoningEffort: 'high' },
    'magpie', 'a', (provider, model) => models[`${provider}/${model}`],
  ), null)
})

await test('a model click restores what that model last used', () => {
  assert.deepEqual(planModelCommit(
    { provider: 'magpie', model: 'a', reasoningEffort: 'high' },
    'magpie', 'b', (provider, model) => models[`${provider}/${model}`], 'medium',
  ), { provider: 'magpie', model: 'b', reasoningEffort: 'medium' })
})

await test('a remembered level the target model does not advertise is dropped', () => {
  assert.deepEqual(planModelCommit(
    { provider: 'magpie', model: 'a', reasoningEffort: 'high' },
    'magpie', 'b', (provider, model) => models[`${provider}/${model}`], 'max',
  ), { provider: 'magpie', model: 'b' })
})

await test('a model with no reasoning takes no remembered level', () => {
  assert.deepEqual(planModelCommit(
    { provider: 'magpie', model: 'a', reasoningEffort: 'high' },
    'magpie', 'c', (provider, model) => models[`${provider}/${model}`], 'high',
  ), { provider: 'magpie', model: 'c' })
})

await test('a first selection with no live model still restores the remembered level', () => {
  assert.deepEqual(planModelCommit(null, 'magpie', 'b', (provider, model) => models[`${provider}/${model}`], 'medium'), {
    provider: 'magpie', model: 'b', reasoningEffort: 'medium',
  })
})

await test('the pending capture names the new selection only, never the empty one', () => {
  const pending = { provider: 'magpie', model: 'b', reasoningEffort: 'high' }
  assert.equal(sameModel(pending, 'magpie', 'b'), true)
  assert.equal(sameModel(pending, 'magpie', 'a'), false)
  assert.equal(planEffortCommit(pending, 'high'), null)
})

await test('the effort comparison treats an absent level as the provider default', () => {
  assert.equal(sameEffort(undefined, undefined), true)
  assert.equal(sameEffort('high', undefined), false)
  assert.equal(sameEffort(undefined, 'high'), false)
  assert.equal(sameEffort('high', 'high'), true)
})

console.log(passed === total ? `\ncommit: PASS (${passed}/${total})` : `\ncommit: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
