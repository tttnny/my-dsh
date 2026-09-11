// Type-only: brings the `settings` service augmentation onto Context.
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import Schema from "@deepseek-ai/schemastery";

import {
  DEFAULT_STICKY_PROMPT_SETTINGS,
  STICKY_PROMPT_SETTINGS_NS,
  type StickyPromptSettings,
} from "./settings.ts";

export const name = "dsh-oil-sticky-prompt";

/**
 * Schema of the user-owned settings section.
 *
 * The Host keeps it in the durable settings provider; the browser reads and
 * edits it through the native `settingsScope` service bound to this same
 * namespace, so the preference takes effect live without a plugin-owned
 * transport. One knob only: everything else about the sticky prompt stays a
 * build-time constant of the DOM half.
 *
 * Module-private on purpose. `Schema` is bundled (a devDependency, not a
 * runtime dependency), and exporting a schema-typed value would inline the
 * whole schemastery type surface into the shipped `lib/index.d.ts` — the
 * public surface stays exactly `name` + `apply`. The default reads
 * {@link DEFAULT_STICKY_PROMPT_SETTINGS}, so the schema and the browser-side
 * fallback cannot drift apart.
 */
const StickyPromptSettingsSchema: Schema<StickyPromptSettings> = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_STICKY_PROMPT_SETTINGS.enabled),
});

/**
 * Host half: register the settings namespace the browser half binds.
 *
 * The plugin is otherwise pure DOM and needs no Host service, so the whole
 * registration sits behind `ctx.inject(['settings'], …)`: a deployment without
 * the settings service still runs the browser half on the schema default.
 * `settings.register` is itself an effect on this fiber, so unloading the
 * plugin removes the namespace and its observers with no extra teardown.
 * @param ctx - Host context carrying the settings service when composed.
 */
export function apply(ctx: Context): void {
  ctx.inject(["settings"], (settingsCtx) => {
    // `applies: 'live'` is the honest declaration: the browser half follows the
    // committed value immediately and needs no restart.
    settingsCtx.settings.register(STICKY_PROMPT_SETTINGS_NS, StickyPromptSettingsSchema, {
      applies: "live",
    });
  });
}
