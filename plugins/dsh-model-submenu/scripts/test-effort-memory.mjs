/**
 * Effort-memory self-check: what is remembered per model, and what degrades.
 *
 * The load-bearing rule is per-model: switching away and back must restore the
 * level last chosen for that exact provider/model pair, never another model's.
 *
 * Run: node scripts/test-effort-memory.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EFFORTS_KEY,
  effortFor,
  readEfforts,
  rememberEffort,
} from '../src/client/effort-memory.ts'

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

/** A storage that only answers the two methods the module may call. */
function fakeStorage() {
  const rows = new Map()
  return {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => { rows.set(key, value) },
  }
}

await test('the memory lives under one browser-wide key', () => {
  assert.equal(EFFORTS_KEY, 'dsh-model-submenu.efforts')
})

await test('nothing remembered answers nothing', () => {
  assert.deepEqual(readEfforts(fakeStorage()), [])
  assert.equal(effortFor(readEfforts(fakeStorage()), 'magpie', 'a'), undefined)
})

await test('a remembered level comes back for its own model only', () => {
  const storage = fakeStorage()
  rememberEffort(storage, 'magpie', 'a', 'high')
  const memory = readEfforts(storage)
  assert.equal(effortFor(memory, 'magpie', 'a'), 'high')
  assert.equal(effortFor(memory, 'magpie', 'b'), undefined)
  assert.equal(effortFor(memory, 'a6api', 'a'), undefined)
})

await test('remembering another level for the same model replaces it', () => {
  const storage = fakeStorage()
  rememberEffort(storage, 'magpie', 'a', 'high')
  rememberEffort(storage, 'magpie', 'a', 'max')
  assert.equal(effortFor(readEfforts(storage), 'magpie', 'a'), 'max')
  assert.equal(readEfforts(storage).length, 1)
})

await test('remembering the provider default forgets the model instead', () => {
  const storage = fakeStorage()
  rememberEffort(storage, 'magpie', 'a', 'high')
  rememberEffort(storage, 'magpie', 'a', undefined)
  assert.equal(effortFor(readEfforts(storage), 'magpie', 'a'), undefined)
})

await test('a value that is not a table degrades to empty', () => {
  const storage = fakeStorage()
  storage.setItem(EFFORTS_KEY, 'not json')
  assert.deepEqual(readEfforts(storage), [])
})

await test('a row missing any half is dropped, the rest still read', () => {
  const storage = fakeStorage()
  storage.setItem(EFFORTS_KEY, JSON.stringify([
    { provider: 'magpie', model: 'a', effort: 'high' },
    { provider: 'magpie', model: 'b' },
    { provider: 'magpie', model: 'c', effort: 7 },
    null,
  ]))
  assert.deepEqual(readEfforts(storage), [{ provider: 'magpie', model: 'a', effort: 'high' }])
})

await test('a storage that throws reads empty and writes nowhere', () => {
  const hostile = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.deepEqual(readEfforts(hostile), [])
  assert.deepEqual(rememberEffort(hostile, 'magpie', 'a', 'high'), [{ provider: 'magpie', model: 'a', effort: 'high' }])
})

console.log(passed === total ? `\neffort-memory: PASS (${passed}/${total})` : `\neffort-memory: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
