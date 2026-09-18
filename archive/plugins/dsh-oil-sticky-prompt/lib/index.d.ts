import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
declare const name = "dsh-oil-sticky-prompt";
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
declare function apply(ctx: Context): void;
//#endregion
export { apply, name };