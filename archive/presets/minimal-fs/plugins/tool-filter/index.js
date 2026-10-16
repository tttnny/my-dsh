/**
 * Keep one tool out of the catalog an agent's model is handed.
 *
 * `system-prompt/assemble` is the waterfall that produces the prompt an agent
 * sends, and its `assembly.tools` is the exact array of tool schemas the model
 * receives. Rewriting it here withdraws a tool this preset's scope inherited
 * from a layer above it and cannot decline by omission.
 *
 * `grilling_form` is that tool: `@lynn123411/dsh-grilling-form` registers it
 * from its own bundle-layer row (the root `- id: tool-grilling-form` insert in
 * the package's `cordis.patch.yml`, live once the package is in
 * `dsh.profile.bundles`), so the GLOBAL layer hands it to every scope.
 * Withholding it here is what keeps the catalog at the three file tools.
 *
 * `read_image` needs no entry: `@deepseek-ai/dsh-tool-fs` selects each tool by
 * its own config switch, and this preset's `tool-fs` row sets `readImage:
 * false`, so the tool is never registered in the first place.
 *
 * Hiding a tool from the assembled catalog is the mechanism the tool package
 * itself already uses — it withholds `read_image` from a route whose model
 * declares no image input — so this is an intended seam.
 *
 * The row is mounted as this package's `./tool-filter` export, not as a path
 * relative to the preset composition: a preset row's baseUrl is the profile
 * directory the preset was declared from, so `./plugins/…` would resolve under
 * the profile instead of here.
 *
 * @module minimal-fs/tool-filter
 */

/** The tool names removed from every catalog assembled in this preset's scope. */
const HIDDEN = ['grilling_form']

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
