/**
 * Favorites self-check: what one key holds, what a broken value degrades to,
 * and how favorites reorder a catalog.
 *
 * The load-bearing assertions are the degradation ones: a privacy-mode
 * browser throws on the property read, and a hand-edited or half-written value
 * must read as an empty table instead of breaking the menu.
 *
 * Run: node scripts/test-favorites.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  FAVORITES_KEY,
  isFavorite,
  orderWithFavorites,
  readFavorites,
  toggleFavorite,
} from '../src/client/favorites.ts'

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
function fakeStorage(seed) {
  const rows = new Map(seed === undefined ? [] : [[FAVORITES_KEY, seed]])
  return {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => { rows.set(key, value) },
    read: () => rows.get(FAVORITES_KEY),
  }
}

await test('the table lives under one browser-wide key', () => {
  assert.equal(FAVORITES_KEY, 'dsh-model-submenu.favorites')
})

await test('an absent value reads as an empty table', () => {
  assert.deepEqual(readFavorites(fakeStorage()), [])
})

await test('a written table reads back with provider and model', () => {
  const storage = fakeStorage()
  toggleFavorite(storage, 'magpie', 'd1api/deepseek-v4.1-flash')
  assert.deepEqual(readFavorites(storage), [{ provider: 'magpie', model: 'd1api/deepseek-v4.1-flash' }])
})

await test('toggling the same model removes it again', () => {
  const storage = fakeStorage()
  toggleFavorite(storage, 'magpie', 'a')
  toggleFavorite(storage, 'magpie', 'b')
  const left = toggleFavorite(storage, 'magpie', 'a')
  assert.deepEqual(left, [{ provider: 'magpie', model: 'b' }])
  assert.deepEqual(readFavorites(storage), left)
})

await test('the same model id under another provider is a different favorite', () => {
  const storage = fakeStorage()
  toggleFavorite(storage, 'magpie', 'kimi-k3')
  assert.equal(isFavorite(readFavorites(storage), 'a6api', 'kimi-k3'), false)
  assert.equal(isFavorite(readFavorites(storage), 'magpie', 'kimi-k3'), true)
})

await test('a value that is not a table degrades to empty', () => {
  assert.deepEqual(readFavorites(fakeStorage('{"not":"a list"}')), [])
  assert.deepEqual(readFavorites(fakeStorage('not json at all')), [])
  assert.deepEqual(readFavorites(fakeStorage('null')), [])
})

await test('a row missing either half is dropped, the rest still read', () => {
  const value = JSON.stringify([
    { provider: 'magpie', model: 'a' },
    { provider: 'magpie' },
    { model: 'b' },
    { provider: 7, model: 'c' },
    null,
  ])
  assert.deepEqual(readFavorites(fakeStorage(value)), [{ provider: 'magpie', model: 'a' }])
})

await test('a storage that throws reads as empty and writes nowhere', () => {
  const hostile = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.deepEqual(readFavorites(hostile), [])
  assert.deepEqual(toggleFavorite(hostile, 'magpie', 'a'), [{ provider: 'magpie', model: 'a' }])
})

await test('an absent storage reads as empty', () => {
  assert.deepEqual(readFavorites(undefined), [])
  assert.deepEqual(toggleFavorite(undefined, 'magpie', 'a'), [{ provider: 'magpie', model: 'a' }])
})

await test('favorites float to the front across providers, each list in catalog order', () => {
  const catalog = [
    { provider: 'magpie', model: 'b' },
    { provider: 'a6api', model: 'qwen' },
    { provider: 'magpie', model: 'a' },
    { provider: 'a6api', model: 'kimi' },
  ]
  const favorites = [
    { provider: 'magpie', model: 'a' },
    { provider: 'a6api', model: 'kimi' },
  ]
  assert.deepEqual(
    orderWithFavorites(catalog, (row) => isFavorite(favorites, row.provider, row.model)),
    [
      { provider: 'magpie', model: 'a' },
      { provider: 'a6api', model: 'kimi' },
      { provider: 'magpie', model: 'b' },
      { provider: 'a6api', model: 'qwen' },
    ],
  )
})

await test('an empty favorite table leaves the catalog untouched', () => {
  const catalog = [{ provider: 'm', model: 'b' }, { provider: 'm', model: 'a' }]
  assert.deepEqual(orderWithFavorites(catalog, () => false), catalog)
})

console.log(passed === total ? `\nfavorites: PASS (${passed}/${total})` : `\nfavorites: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
