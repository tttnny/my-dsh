import { describe, expect, it, vi } from 'vitest'
import { commandAccountMode, createLoopbackRpcGuard } from '../src/loopback-rpc.ts'

const signal = new AbortController().signal

function success(value: unknown) {
  return Promise.resolve({ ok: true as const, value })
}

describe('commandAccountMode', () => {
  it('enables the account command on a terminal composition without a WebServer', () => {
    expect(commandAccountMode(undefined)).toBe('enabled')
  })

  it('enables the account command on a loopback-bound Web composition', () => {
    expect(commandAccountMode({ host: '127.0.0.1' })).toBe('enabled')
  })

  it.each(['0.0.0.0', '::', 'unknown-host'])('enables the account command on the public bind %s', bindHost => {
    expect(commandAccountMode({ host: bindHost })).toBe('enabled')
  })

  it('enables the account command when a WebServer composes no published bind', () => {
    expect(commandAccountMode({})).toBe('enabled')
  })
})

describe('loopback RPC guard', () => {
  it('keeps the real handler on the explicit loopback Web bind', async () => {
    const delegate = vi.fn((_endpoint: string, payload: unknown) => success(payload))
    const guard = createLoopbackRpcGuard('127.0.0.1', delegate)

    expect(guard.mode).toBe('enabled')
    await expect(guard.handler('status', { value: 1 }, signal)).resolves.toEqual({
      ok: true,
      value: { value: 1 },
    })
    expect(delegate).toHaveBeenCalledWith('status', { value: 1 }, signal)
  })

  it('keeps the real handler when WebServer is absent', async () => {
    const delegate = vi.fn((_endpoint: string, payload: unknown) => success(payload))
    const guard = createLoopbackRpcGuard(undefined, delegate)

    expect(guard.mode).toBe('enabled')
    await expect(guard.handler('status', { value: 2 }, signal)).resolves.toEqual({
      ok: true,
      value: { value: 2 },
    })
    expect(delegate).toHaveBeenCalledWith('status', { value: 2 }, signal)
  })

  it.each(['0.0.0.0', 'unknown-host'])('keeps the real handler on non-loopback bind %s', async bindHost => {
    const delegate = vi.fn((_endpoint: string, payload: unknown) => success(payload))
    const guard = createLoopbackRpcGuard(bindHost, delegate)

    expect(guard.mode).toBe('enabled')
    await expect(guard.handler('status', { value: 3 }, signal)).resolves.toEqual({
      ok: true,
      value: { value: 3 },
    })
    expect(delegate).toHaveBeenCalledWith('status', { value: 3 }, signal)
  })
})
