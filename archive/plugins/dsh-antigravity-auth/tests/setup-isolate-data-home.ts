/**
 * Point the whole suite at a throwaway Antigravity data home.
 *
 * The plugin resolves its credential and its gate evidence from `XDG_DATA_HOME`,
 * so a test that drives the real Host row — or its `/antigravity-auth` slash
 * command — would otherwise read, and on `logout` delete, the developer's own
 * account. Isolation is established once here instead of being remembered per
 * test, so no future test can reach a real credential.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testDataHome = mkdtempSync(join(tmpdir(), 'dsh-antigravity-test-home-'))
process.env.XDG_DATA_HOME = testDataHome

process.once('exit', () => {
  try {
    rmSync(testDataHome, { recursive: true, force: true })
  } catch {
    // A failed cleanup must never fail the run.
  }
})
