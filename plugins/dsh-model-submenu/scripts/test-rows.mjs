/**
 * Row-building self-check: which providers a picker tab can name, how the
 * catalog flattens, and what a query matches.
 *
 * The load-bearing assertions are the ones that keep the picker honest: an
 * empty provider never gets a tab, the "all" tab keeps catalog order until
 * favourites reorder it, and a query matches the provider name as well as the
 * model name.
 *
 * Run: node scripts/test-rows.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALL_TAB,
  flattenGroups,
  pickerTabs,
  reasoningOf,
  rowsForTab,
  searchCandidates,
  searchRows,
} from '../src/client/rows.ts'

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

const groups = [
  {
    id: 'magpie',
    name: 'Magpie',
    models: [
      { id: 'deepseek/deepseek-flash', name: 'DeepSeek-V4.1-Flash · DeepSeek' },
      { id: 'd1api/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash · d1api' },
    ],
  },
  { id: 'empty', name: 'Empty', models: [] },
  { id: 'a6api', name: 'A6api', models: [{ id: 'kimi-k3', name: 'Kimi K3 · A6api' }] },
]

const rows = flattenGroups(groups)

await test('the catalog flattens to one row per model, naming its provider', () => {
  assert.deepEqual(rows.map((row) => `${row.provider}/${row.model}`), [
    'magpie/deepseek/deepseek-flash',
    'magpie/d1api/deepseek-v4.1-flash',
    'a6api/kimi-k3',
  ])
  assert.equal(rows[0].providerName, 'Magpie')
  assert.equal(rows[2].providerName, 'A6api')
})

await test('tabs are the all-tab plus every provider that has a model', () => {
  assert.deepEqual(pickerTabs(groups).map((tab) => tab.id), [ALL_TAB, 'magpie', 'a6api'])
})

await test('the all tab is first and named by the caller', () => {
  const tabs = pickerTabs(groups, 'Everything')
  assert.equal(tabs[0].id, ALL_TAB)
  assert.equal(tabs[0].label, 'Everything')
})

await test('a provider tab keeps only that provider, in catalog order', () => {
  assert.deepEqual(rowsForTab(rows, 'a6api').map((row) => row.model), ['kimi-k3'])
  assert.equal(rowsForTab(rows, ALL_TAB).length, 3)
})

/** A ranker that records what it was handed, then keeps a named match only. */
function recordingRanker(keep) {
  const calls = []
  const rank = (items, query) => {
    calls.push({ items, query })
    const needle = keep ?? query
    return items.filter((item) => item.name.toLowerCase().includes(needle.toLowerCase()))
  }
  return { rank, calls }
}

await test('each row reaches the ranker with the model name and the provider name', () => {
  const spy = recordingRanker()
  searchRows(rows, 'anything', spy.rank)
  assert.equal(spy.calls.length, 1)
  assert.deepEqual(spy.calls[0].items.map((item) => [item.name, item.label]), [
    ['DeepSeek-V4.1-Flash · DeepSeek', 'Magpie'],
    ['DeepSeek V4.1 Flash · d1api', 'Magpie'],
    ['Kimi K3 · A6api', 'A6api'],
  ])
})

await test('the query reaches the ranker already trimmed', () => {
  const spy = recordingRanker()
  searchRows(rows, '  kimi  ', spy.rank)
  assert.equal(spy.calls[0].query, 'kimi')
})

await test('an empty or blank query never reaches the ranker', () => {
  const spy = recordingRanker()
  assert.deepEqual(searchRows(rows, '   ', spy.rank), rows)
  assert.equal(spy.calls.length, 0)
})

await test('the ranked matches come back in the ranker\'s order, not the catalog order', () => {
  const rank = (items, query) => [...items].reverse().filter((item) => item.name.includes(query))
  assert.deepEqual(searchRows(rows, 'DeepSeek', rank).map((row) => row.model), ['d1api/deepseek-v4.1-flash', 'deepseek/deepseek-flash'])
})

await test('a query with no match returns nothing', () => {
  const spy = recordingRanker()
  assert.deepEqual(searchRows(rows, 'zzz', spy.rank), [])
})

await test('candidates are built in row order', () => {
  assert.deepEqual(searchCandidates(rows).map((candidate) => candidate.row.model), rows.map((row) => row.model))
})

await test('the reasoning lookup answers per provider and model', () => {
  const groups = [{ id: 'm', name: 'M', models: [{ id: 'a', name: 'A', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }, { id: 'b', name: 'B' }] }]
  const reason = reasoningOf(groups)
  assert.equal(reason('m', 'a')?.efforts.length, 1)
  assert.equal(reason('m', 'b'), undefined)
  assert.equal(reason('gone', 'a'), undefined)
})

await test('each row carries its catalog entry for name and reasoning', () => {
  assert.equal(rows[0].entry.name, 'DeepSeek-V4.1-Flash · DeepSeek')
  assert.equal(rows[0].entry.reasoning, undefined)
})

console.log(passed === total ? `\nrows: PASS (${passed}/${total})` : `\nrows: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
