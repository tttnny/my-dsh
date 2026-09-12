import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createFileCapabilityGates,
  createMemoryCapabilityGates,
} from '../src/capability-gates.ts'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))))

describe('capability gate registry', () => {
  it('keeps every live gate pending until an explicit result is recorded', async () => {
    const gates = createMemoryCapabilityGates(undefined, () => Date.parse('2030-01-01T00:00:00.000Z'))
    await expect(gates.read()).resolves.toEqual({})

    await gates.recordGate0('lineage-a', 'passed')
    await gates.recordLlmFamily('lineage-a', 'gemini', 'passed')
    await gates.recordCapability('lineage-a', 'search', 'rate-limited')

    await expect(gates.read()).resolves.toEqual({
      subject: 'lineage-a',
      gate0: { outcome: 'passed', checkedAt: '2030-01-01T00:00:00.000Z' },
      llmFamilies: { gemini: { outcome: 'passed', checkedAt: '2030-01-01T00:00:00.000Z' } },
      capabilities: {
        search: { outcome: 'rate-limited', checkedAt: '2030-01-01T00:00:00.000Z' },
      },
    })

    await gates.recordGate0('lineage-a', 'rate-limited')
    await expect(gates.read()).resolves.toEqual({
      subject: 'lineage-a',
      gate0: { outcome: 'rate-limited', checkedAt: '2030-01-01T00:00:00.000Z' },
    })

    await gates.recordLlmFamily('lineage-b', 'claude', 'passed')
    await expect(gates.read()).resolves.toEqual({
      subject: 'lineage-b',
      llmFamilies: { claude: { outcome: 'passed', checkedAt: '2030-01-01T00:00:00.000Z' } },
    })
  })

  it('ignores POSIX mode bits on Windows while preserving strict POSIX enforcement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-gates-'))
    roots.push(root)
    const path = join(root, 'gates.json')
    const windowsGates = createFileCapabilityGates(path, { platform: 'win32' })
    await windowsGates.recordGate0('lineage-a', 'passed')
    await chmod(root, 0o777)
    await chmod(path, 0o666)

    await expect(windowsGates.read()).resolves.toMatchObject({ gate0: { outcome: 'passed' } })
    await expect(createFileCapabilityGates(path, { platform: 'linux' }).read()).rejects.toThrow(/could not be read/u)
    await writeFile(path, 'x'.repeat(65 * 1024))
    await expect(windowsGates.read()).rejects.toThrow(/could not be read/u)
  })

  it('rejects unsafe permissions and oversized persisted evidence before parsing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-gates-'))
    roots.push(root)
    const path = join(root, 'gates.json')
    const gates = createFileCapabilityGates(path, { platform: 'linux' })
    await gates.recordGate0('lineage-a', 'passed')

    await chmod(path, 0o644)
    await expect(gates.read()).rejects.toThrow(/could not be read/u)
    await chmod(path, 0o600)
    await writeFile(path, 'x'.repeat(65 * 1024), { mode: 0o600 })
    await expect(gates.read()).rejects.toThrow(/could not be read/u)
  })

  it('persists only the closed value-free gate schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-gates-'))
    roots.push(root)
    const path = join(root, 'gates.json')
    const gates = createFileCapabilityGates(path, { now: () => Date.parse('2030-01-01T00:00:00.000Z') })

    await gates.recordGate0('lineage-a', 'attribution-rejected')
    await gates.recordCapability('lineage-a', 'video', 'unsupported-video')

    await expect(gates.read()).resolves.toMatchObject({
      gate0: { outcome: 'attribution-rejected' },
      capabilities: { video: { outcome: 'unsupported-video' } },
    })
    const encoded = await readFile(path, 'utf8')
    expect(encoded).not.toMatch(/token|project|response|body|base64/i)
  })
})
