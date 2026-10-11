/** Offline-friendly Host service factory used by tests and embedding code. */

import { createMemoryAuthStore } from './auth-store.ts'
import { createAntigravityAuthService } from './auth-service.ts'
import type { AntigravityAuthService, AntigravityAuthServiceOptions } from './auth-service.ts'

/** Use an in-memory store unless the caller explicitly selects a persistent path/store. */
export function createBootstrapStatusService(
  options: AntigravityAuthServiceOptions = {},
): AntigravityAuthService {
  return createAntigravityAuthService(
    options.store === undefined && options.storePath === undefined
      ? { ...options, store: createMemoryAuthStore() }
      : options,
  )
}

export type { AntigravityAuthService, AntigravityAuthServiceOptions }
