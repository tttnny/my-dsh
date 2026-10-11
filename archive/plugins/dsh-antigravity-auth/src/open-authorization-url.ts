/**
 * Best-effort Host browser launch that hands the terminal user the OAuth
 * authorization URL without persisting it in the session's `command/done`
 * event (that event follows ordinary session persistence).
 *
 * DSH exposes no public transient-presentation or browser-authority API for
 * plugins to hand off an external login URL, so this module spawns the
 * platform default opener directly, mirroring the best-effort helper the DSH
 * TUI renderer uses for its own hrefs, and reports every failure as `false`: a
 * Host without a desktop browser simply cannot complete interactive Google
 * sign-in from the terminal (documented limitation; no public Host API exists
 * to close it).
 *
 * @module antigravity-auth/open-authorization-url
 */

import { spawn, type ChildProcess } from 'node:child_process'

/** Spawn used to launch the platform opener. */
export type OpenSpawnFn = typeof spawn

/** One platform default-browser opener invocation. */
export interface OpenerSpec {
  /** Executable. */
  readonly command: string
  /** Arguments, with the URL last on POSIX. */
  readonly args: string[]
  /**
   * Whether the argument list must reach the Windows shell without Node's own
   * quoting. `cmd` splits an unquoted `&` into a second command, and libuv
   * quotes an argument only when it contains whitespace or a quote, so the
   * Windows opener supplies its own quotes and disables Node's rewriting.
   */
  readonly verbatimArguments: boolean
}

/** The Google authorization endpoint this plugin starts logins against. */
const AUTHORIZATION_HOST = 'accounts.google.com'

/**
 * Resolve the host default-browser opener. Darwin uses `open`, Windows
 * `cmd /c start`, elsewhere `xdg-open`.
 *
 * The Windows command line is `cmd /c start "" "<url>"`: the empty quoted token
 * is the `start` window title (without it `start` treats the URL as the title),
 * and the quoted URL keeps its `&`-separated query parameters from being read
 * as command separators. Both quotes reach `cmd` verbatim because Node's
 * default argument handling would leave a `&`-only argument unquoted.
 * @param platform - `process.platform` snapshot.
 * @param url - already-validated https authorization URL.
 */
export function openerSpec(platform: NodeJS.Platform, url: string): OpenerSpec {
  if (platform === 'darwin') return { command: 'open', args: [url], verbatimArguments: false }
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '""', `"${url}"`], verbatimArguments: true }
  }
  return { command: 'xdg-open', args: [url], verbatimArguments: false }
}

/**
 * Whether a candidate is the Google authorization endpoint this plugin starts.
 * @param value - candidate authorization URL.
 */
export function isAntigravityAuthorizationUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === AUTHORIZATION_HOST
      && parsed.pathname.startsWith('/o/oauth2/')
  } catch {
    return false
  }
}

/**
 * Open the authorization URL in the host default browser, best effort.
 * @param url - the Google authorization URL returned by `OAuthFlow.start()`.
 * @param spawnFn - injectable spawn.
 * @param platform - injectable platform.
 * @returns true once the opener process spawned; false when the URL is not an
 * Antigravity authorization URL, spawn threw, or the opener could not start.
 * The URL never enters the returned value or a diagnostic.
 */
export async function openAuthorizationUrl(
  url: string,
  spawnFn: OpenSpawnFn = spawn,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (!isAntigravityAuthorizationUrl(url)) return false
  const spec = openerSpec(platform, url)
  try {
    const child: ChildProcess = spawnFn(spec.command, spec.args, {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: spec.verbatimArguments,
    })
    return await new Promise<boolean>((resolve) => {
      child.once('error', () => {
        // Missing opener or EACCES: the launch is best-effort, and the URL must
        // not be reproduced in a failure report.
        resolve(false)
      })
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    })
  } catch {
    // spawn threw synchronously (invalid argv on a stub): report no launch.
    return false
  }
}
