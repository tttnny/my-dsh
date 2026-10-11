/**
 * Host-half check for the merchant probe's wire request (server/probe.ts).
 *
 * 「探测商家」must follow the model protocol the route actually runs on: a probe
 * that speaks OpenAI Chat while the route speaks Messages would fix the merchant
 * of a line no traffic uses. This check stands up a throwaway HTTP server and
 * pins, for each of the three protocols, the endpoint, the auth headers and the
 * body fields of the request the probe really sends — plus that switching the
 * protocol switches the request immediately (no restart, no memory).
 *
 * Run with: node scripts/test-probe-protocol.mjs (requires a prior `pnpm build`).
 */

import { createServer } from 'node:http'

const { probeSingleModel, buildProbeRequest } = await import(new URL('../lib/index.js', import.meta.url).href)

const failures = []
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`)
  else { console.log(`  FAIL ${label}`); failures.push(label) }
}

/** The fake gateway: records every request it receives and answers 200. */
const seen = []
const server = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk })
  req.on('end', () => {
    let body = null
    try { body = JSON.parse(raw) } catch { /* keep null */ }
    seen.push({ url: req.url, method: req.method, headers: req.headers, body })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const last = () => seen[seen.length - 1]
const header = (name) => last()?.headers?.[name.toLowerCase()]

/** One probe with no log identity: the request is all that is exercised. */
const probe = async (protocol) => {
  seen.length = 0
  const result = await probeSingleModel(base, 'sk-test-key', undefined, undefined, 'm-a', protocol)
  return result
}

// 1. OpenAI Chat: the completions endpoint, Bearer auth, chat body. This is the
// pre-existing behaviour and must not have moved.
{
  const result = await probe('openai-completions')
  check('chat: the probe succeeds against the endpoint', result.success === true)
  check('chat: it posts to /v1/chat/completions', last()?.method === 'POST' && last()?.url === '/v1/chat/completions')
  check('chat: it authenticates with Bearer', header('authorization') === 'Bearer sk-test-key')
  check('chat: it sends the chat body (model + messages + max_tokens)',
    last()?.body?.model === 'm-a'
    && Array.isArray(last()?.body?.messages)
    && last()?.body?.max_tokens === 1)
}

// 2. OpenAI Response: the responses endpoint, same Bearer auth, responses body
// (input / max_output_tokens — `messages` and `max_tokens` are not that protocol).
{
  await probe('openai-responses')
  check('responses: it posts to /v1/responses', last()?.method === 'POST' && last()?.url === '/v1/responses')
  check('responses: it authenticates with Bearer', header('authorization') === 'Bearer sk-test-key')
  check('responses: it sends the responses body (model + input + max_output_tokens)',
    last()?.body?.model === 'm-a'
    && Array.isArray(last()?.body?.input)
    && last()?.body?.max_output_tokens === 16)
  check('responses: it does not borrow the chat fields',
    !('messages' in (last()?.body ?? {})) && !('max_tokens' in (last()?.body ?? {})))
}

// 3. Messages: the messages endpoint on the bare address (a /v1 in the base would
// double the segment), x-api-key auth plus the api version header, and the
// Messages body shape.
{
  await probe('anthropic-messages')
  check('messages: it posts to /v1/messages (never /v1/v1/messages)',
    last()?.method === 'POST' && last()?.url === '/v1/messages')
  check('messages: it authenticates with x-api-key, not Bearer',
    header('x-api-key') === 'sk-test-key' && header('authorization') === undefined)
  check('messages: it carries the anthropic-version header', header('anthropic-version') === '2023-06-01')
  check('messages: it sends the messages body (model + messages + max_tokens)',
    last()?.body?.model === 'm-a'
    && Array.isArray(last()?.body?.messages)
    && last()?.body?.max_tokens === 1)
}

// 3b. A base URL that already ends in a slash must not produce a doubled slash in
// any protocol; the clean-up is shared, so one case per scheme is enough.
{
  await probeSingleModel(`${base}/`, 'sk-test-key', undefined, undefined, 'm-a', 'anthropic-messages')
  check('a trailing slash on the base address yields a clean /v1/messages', last()?.url === '/v1/messages')
  await probeSingleModel(`${base}/`, 'sk-test-key', undefined, undefined, 'm-a', 'openai-completions')
  check('a trailing slash on the base address yields a clean /v1/chat/completions', last()?.url === '/v1/chat/completions')
}

// 4. Switching the protocol switches the request on the very next probe: the
// choice is read per call, so no restart (and no stale decision) is involved.
{
  await probe('openai-completions')
  const first = last()?.url
  await probe('anthropic-messages')
  const second = last()?.url
  await probe('openai-completions')
  const third = last()?.url
  check('switching protocol changes the very next probe',
    first === '/v1/chat/completions' && second === '/v1/messages' && third === '/v1/chat/completions')
}

// 5. No protocol named (an older caller) must keep the pre-existing chat request;
// an unknown value must not silently pick a different wire format either.
{
  await probe(undefined)
  check('an absent protocol probes as OpenAI Chat', last()?.url === '/v1/chat/completions')
  await probe('openai')
  check('an unknown protocol probes as OpenAI Chat', last()?.url === '/v1/chat/completions')
}

// 5b. The pure builder agrees with the wire: cheap pin for the address semantics
// (bare base in, `/v1/messages` out) independent of the server round trip.
{
  const spec = buildProbeRequest('anthropic-messages', 'https://api.a6api.com', 'k', 'm-a')
  check('the builder puts Messages on the bare address + /v1/messages',
    spec.url === 'https://api.a6api.com/v1/messages')
}

// 6. A failing upstream is reported, not retried blind, and still names the model.
{
  server.close()
  const dead = createServer((_req, res) => { res.writeHead(401, { 'content-type': 'text/plain' }); res.end('nope') })
  await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve))
  const deadBase = `http://127.0.0.1:${dead.address().port}`
  const result = await probeSingleModel(deadBase, 'sk-test-key', undefined, undefined, 'm-a', 'anthropic-messages')
  check('a rejected probe reports failure with the model and no merchant',
    result.success === false && result.modelName === 'm-a' && result.merchant === undefined
    && /HTTP 401/.test(result.error ?? ''))
  await new Promise((resolve) => dead.close(resolve))
}

console.log(failures.length === 0 ? '\nprobe-protocol: PASS' : `\nprobe-protocol: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
