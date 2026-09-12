/** Human command for inspecting and starting the shared Antigravity login. */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { AntigravityAuthService } from './auth-service.ts';
import { type LoopbackRpcMode } from './loopback-rpc.ts';
type AuthCommandService = Pick<AntigravityAuthService, 'status' | 'acknowledgeRisk' | 'startLogin' | 'cancelLogin' | 'logout'>;
/**
 * Build the slash command shared by every interactive DSH surface.
 * @param service - the shared Host auth service.
 * @param accountMode - live account-control activation for this Host
 * composition (enabled on a local terminal Host with no WebServer or a
 * loopback-bound WebServer, blocked on a public Web bind); when blocked the
 * command denies every operation without touching the auth service.
 * @param openUrl - best-effort Host browser launcher for the authorization
 * URL; the URL is delivered there and never echoed into the command result,
 * because `CommandResult.text` is persisted verbatim into `command/done`. The
 * resolved false value means the Host has no usable browser launch, which the
 * command reports without reproducing the URL.
 */
export declare function createAntigravityAuthCommand(service: AuthCommandService, accountMode: () => LoopbackRpcMode, openUrl?: (url: string) => boolean | Promise<boolean>): CommandDefinition;
export {};
//# sourceMappingURL=auth-command.d.ts.map