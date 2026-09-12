import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { DSH_ATTRIBUTION_HEADER, createWireIdentity } from 'dsh-antigravity-auth/wire-identity'

describe('Wire Identity public DSH attribution seam', () => {
  it('forwards the value produced by DSH attributionHeaders()', () => {
    const dshHeaders = attributionHeaders()
    const dshUserAgent = dshHeaders['user-agent']
    expect(typeof dshUserAgent).toBe('string')
    expect(createWireIdentity().headers()[DSH_ATTRIBUTION_HEADER]).toBe(dshUserAgent)
  })
})
