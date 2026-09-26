/**
 * Keep one tool out of the catalog an agent's model is handed.
 *
 * `system-prompt/assemble` is the waterfall that produces the prompt an agent
 * sends, and its `assembly.tools` is the exact array of tool schemas the model
 * receives. Rewriting it here is the subtraction `@deepseek-ai/dsh-tool-fs`
 * does not offer: that package registers `read` / `write` / `edit` /
 * `read_image` together and has no per-tool switch.
 *
 * Two mechanisms that look right and are not, both tried and measured on a
 * real session:
 *
 * - `ctx.tools.restrict({ allow })` masks the tools a scope INHERITS — the
 *   global layer and its ancestor layers — and never what the same scope
 *   registers itself. A preset's rows register into the preset's own scope, so
 *   there is nothing for it to subtract and `read_image` survives.
 * - Wrapping `ctx.tools.register` from a SIBLING row loses a race: the loader
 *   starts every row of one composition with
 *   `Promise.allSettled(config.map(...))`, so sibling `apply` bodies run
 *   concurrently and `read_image` is registered before the wrapper lands.
 *
 * The waterfall has neither problem. It runs per assembly, in this row's
 * scope, on the one array that matters — so the exclusion cannot be outrun and
 * does not depend on row order. The tool itself stays registered and callable
 * by anything that addresses it directly; what changes is the catalog the
 * model is shown.
 *
 * Hiding a tool from the assembled catalog is the mechanism the tool package
 * itself already uses — it withholds `read_image` from a route whose model
 * declares no image input — so this is an intended seam, not a workaround.
 *
 * The row is mounted as this package's `./tool-filter` export, not as a path
 * relative to the preset composition: a preset row's baseUrl is the profile
 * directory the preset was declared from, so `./plugins/…` would resolve under
 * the profile instead of here.
 *
 * @module minimal-fs/tool-filter
 */

/** The tool names removed from every catalog assembled in this preset's scope. */
const HIDDEN = ['read_image']

/** The prompt registry is where the exclusion is enforced. */
export const inject = ['systemPrompt']

/**
 * Drop the hidden tools from each assembly.
 *
 * The waterfall's returned value is authoritative, so the filter runs after
 * every downstream listener and returns a narrowed copy of whatever they
 * produced — an in-place edit of the incoming object could be dropped by a
 * later listener that builds a fresh assembly.
 * @param ctx - the preset row's context; its scope covers every agent composed
 *   from this preset.
 */
export function apply(ctx) {
  ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
    const transformed = await next()
    const tools = transformed.tools
    if (!Array.isArray(tools)) return transformed
    const kept = tools.filter((tool) => !HIDDEN.includes(tool?.name))
    return kept.length === tools.length ? transformed : { ...transformed, tools: kept }
  })
}
