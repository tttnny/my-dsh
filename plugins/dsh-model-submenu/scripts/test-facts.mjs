/**
 * Model-fact self-check: which parts of one model's metadata line the settings
 * document can answer, and what the line looks like when it cannot.
 *
 * The load-bearing assertions are the omissions. A missing context window, an
 * unfavorited image answer, and a model the settings document never lists must
 * all vanish from the line instead of rendering a guess.
 *
 * Run: node scripts/test-facts.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildModelFacts,
  formatContextWindow,
  metaSegments,
} from '../src/client/model-facts.ts'

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

/** The provider directory entries the Host reports for one deployment. */
const providers = [
  { provider: 'magpie', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'magpie'] },
  { provider: 'a6api', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'a6api'] },
  { provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] },
  { provider: 'deepseek-account', settingsNs: 'llm-deepseek-account', settingsPath: [] },
  { provider: 'kimi-coding', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'kimi-coding'] },
]

/** A describe answer shaped like the Host's, covering both adapter families. */
const namespaces = [
  {
    ns: 'llm-pi-ai',
    value: {
      providers: {
        magpie: {
          displayName: 'Magpie',
          defaultContextWindow: 262144,
          defaultInput: ['text', 'image'],
          models: [
            { id: 'deepseek/deepseek-flash', name: 'DeepSeek-V4.1-Flash · DeepSeek', contextWindow: 1000000, input: ['text', 'image'] },
            { id: 'd1api/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash · d1api', contextWindow: 1048576, input: ['text', 'image'] },
            { id: 'codex/gpt-6-luna', name: 'GPT-6-Luna · Codex', contextWindow: 272000, input: ['text', 'image'] },
            { id: 'no-window', name: 'No window', input: ['text', 'image'] },
          ],
        },
        a6api: {
          displayName: 'A6api',
          defaultContextWindow: 262144,
          defaultInput: ['text'],
          models: [
            { id: 'kimi-k3', name: 'Kimi K3 · A6api', contextWindow: 1048576, input: ['text', 'image'] },
            { id: 'qwen3.8-max', name: 'Qwen3.8 Max · A6api', input: [] },
          ],
        },
      },
    },
  },
  {
    ns: 'llm-deepseek',
    value: {
      defaultContextWindow: 1000000,
      models: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1000000, inputModalities: ['text'] },
        { id: 'deepseek-v4-vision', name: 'DeepSeek V4 Vision', contextWindow: 1000000, inputModalities: ['text', 'image'] },
        { id: 'quiet-vision', name: 'Deepseek quiet', contextWindow: 500000 },
      ],
    },
  },
  { ns: 'llm-deepseek-account', value: { modelOverrides: {} } },
]

const facts = buildModelFacts(providers, namespaces)

await test('a model that declares a context window reports it', () => {
  assert.deepEqual(facts('magpie', 'deepseek/deepseek-flash'), { contextWindow: 1000000, images: 'yes' })
})

await test('a model without a context window reports none, not the route default', () => {
  assert.equal(facts('magpie', 'no-window').contextWindow, undefined)
})

await test('an empty pi-ai input list falls back to the route default', () => {
  assert.equal(facts('a6api', 'qwen3.8-max').images, 'no')
})

await test('a route default that names images answers yes for a model that stays quiet', () => {
  assert.equal(facts('magpie', 'no-window').images, 'yes')
})

await test('a declared text-only model answers no', () => {
  assert.equal(facts('deepseek-official', 'deepseek-v4-pro').images, 'no')
})

await test('a declared image model answers yes', () => {
  assert.equal(facts('deepseek-official', 'deepseek-v4-vision').images, 'yes')
})

await test('an omitted modality list in the Messages family means text only', () => {
  assert.equal(facts('deepseek-official', 'quiet-vision').images, 'no')
})

await test('a provider the settings document never lists answers unknown on both', () => {
  assert.deepEqual(facts('deepseek-account', 'whatever'), { contextWindow: undefined, images: 'unknown' })
  assert.deepEqual(facts('kimi-coding', 'kimi-k3'), { contextWindow: undefined, images: 'unknown' })
})

await test('an account provider falls back to the DeepSeek family defaults', () => {
  assert.deepEqual(facts('deepseek-account', 'deepseek-flash'), { contextWindow: 1000000, images: 'yes' })
  assert.deepEqual(facts('deepseek-account', 'deepseek-v4-pro'), { contextWindow: 1000000, images: 'no' })
})

await test('a model the family defaults do not name still answers unknown', () => {
  assert.deepEqual(facts('deepseek-account', 'some-future-model'), { contextWindow: undefined, images: 'unknown' })
})

await test('an account model override wins over the family default', () => {
  const withOverride = buildModelFacts(providers, [
    ...namespaces,
    {
      ns: 'llm-deepseek-account',
      value: { modelOverrides: { 'deepseek-v4-pro': { contextWindow: 2000000, inputModalities: ['text', 'image'] } } },
    },
  ])
  assert.deepEqual(withOverride('deepseek-account', 'deepseek-v4-pro'), { contextWindow: 2000000, images: 'yes' })
})

await test('a model missing from a configured provider answers unknown', () => {
  assert.deepEqual(facts('magpie', 'not-in-catalog'), { contextWindow: undefined, images: 'unknown' })
})

await test('a malformed settings answer answers unknown instead of throwing', () => {
  const broken = buildModelFacts(providers, [
    { ns: 'llm-pi-ai', value: { providers: { magpie: 'not an object' } } },
    { ns: 'llm-deepseek', value: 'not an object' },
  ])
  assert.deepEqual(broken('magpie', 'anything'), { contextWindow: undefined, images: 'unknown' })
  assert.deepEqual(broken('deepseek-official', 'anything'), { contextWindow: undefined, images: 'unknown' })
})

await test('context windows abbreviate to one number and one unit', () => {
  assert.equal(formatContextWindow(1000000), '1M ctx')
  assert.equal(formatContextWindow(1048576), '1M ctx')
  assert.equal(formatContextWindow(1500000), '1.5M ctx')
  assert.equal(formatContextWindow(977000), '977k ctx')
  assert.equal(formatContextWindow(272000), '272k ctx')
  assert.equal(formatContextWindow(393216), '393k ctx')
  assert.equal(formatContextWindow(512), '512 ctx')
})

await test('the metadata line lists what the document answers, in order', () => {
  assert.deepEqual(
    metaSegments({
      providerName: 'Magpie',
      facts: { contextWindow: 1000000, images: 'yes' },
      thinks: true,
      effortLabel: '思考',
      imageLabel: '图片输入',
    }),
    ['Magpie', '1M ctx', '思考', '图片输入'],
  )
})

await test('the metadata line omits the provider, the image answer, and thinking when absent', () => {
  assert.deepEqual(
    metaSegments({
      facts: { contextWindow: undefined, images: 'unknown' },
      thinks: false,
      effortLabel: '思考',
      imageLabel: '图片输入',
    }),
    [],
  )
  assert.deepEqual(
    metaSegments({
      facts: { contextWindow: 272000, images: 'no' },
      thinks: false,
      effortLabel: '思考',
      imageLabel: '图片输入',
    }),
    ['272k ctx'],
  )
})

await test('a definite no-image answer is omitted like an unknown one', () => {
  assert.deepEqual(
    metaSegments({
      facts: { contextWindow: 1000000, images: 'no' },
      thinks: true,
      effortLabel: '思考',
      imageLabel: '图片输入',
    }),
    ['1M ctx', '思考'],
  )
})

console.log(passed === total ? `\nfacts: PASS (${passed}/${total})` : `\nfacts: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
