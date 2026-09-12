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
import { spawn } from 'node:child_process';
/** Spawn used to launch the platform opener. */
export type OpenSpawnFn = typeof spawn;
/** One platform default-browser opener invocation. */
export interface OpenerSpec {
    /** Executable. */
    readonly command: string;
    /** Arguments, with the URL last on POSIX. */
    readonly args: string[];
    /**
     * Whether the argument list must reach the Windows shell without Node's own
     * quoting. `cmd` splits an unquoted `&` into a second command, and libuv
     * quotes an argument only when it contains whitespace or a quote, so the
     * Windows opener supplies its own quotes and disables Node's rewriting.
     */
    readonly verbatimArguments: boolean;
}
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
export declare function openerSpec(platform: NodeJS.Platform, url: string): OpenerSpec;
/**
 * Whether a candidate is the Google authorization endpoint this plugin starts.
 * @param value - candidate authorization URL.
 */
export declare function isAntigravityAuthorizationUrl(value: string): boolean;
/**
 * Open the authorization URL in the host default browser, best effort.
 * @param url - the Google authorization URL returned by `OAuthFlow.start()`.
 * @param spawnFn - injectable spawn.
 * @param platform - injectable platform.
 * @returns true once the opener process spawned; false when the URL is not an
 * Antigravity authorization URL, spawn threw, or the opener could not start.
 * The URL never enters the returned value or a diagnostic.
 */
export declare function openAuthorizationUrl(url: string, spawnFn?: OpenSpawnFn, platform?: NodeJS.Platform): Promise<boolean>;
//# sourceMappingURL=open-authorization-url.d.ts.map