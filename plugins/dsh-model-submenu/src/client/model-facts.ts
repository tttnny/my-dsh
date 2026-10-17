/**
 * What the settings document knows about one model, for the picker's metadata
 * line.
 *
 * The Host's model catalog carries only a name and a reasoning list; context
 * window and accepted modalities live in each provider's settings profile,
 * which the settings mirror already holds in the browser. This module joins
 * the two by the identity both agree on: the catalog's provider route key and
 * model id are exactly the settings profile's provider key and model id.
 *
 * Every field is answered independently. A provider whose profile lists no
 * models (an OAuth route such as the Kimi subscription, or the account
 * provider) answers `unknown` rather than guessing the route default, because
 * the line's rule is to omit what cannot be asserted.
 */

/** Accepted-modality answer for one model. */
export type ImageAnswer = 'yes' | 'no' | 'unknown'

/** The metadata the settings document can answer for one model. */
export interface ModelFacts {
  /** Exact advertised capacity, or undefined when the model declares none. */
  readonly contextWindow: number | undefined
  /** Whether the model accepts images; `unknown` means the document is silent. */
  readonly images: ImageAnswer
}

/** One provider directory row, as the Host's LLM directory reports it. */
export interface ConfigurableProviderRow {
  readonly provider: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
}

/** One settings namespace view, as the describe answer carries it. */
export interface NamespaceRow {
  readonly ns: string
  readonly value: unknown
}

/** What one provider's profile may carry, across both adapter families. */
interface ProfileView {
  readonly models?: readonly Record<string, unknown>[]
  readonly defaultContextWindow?: unknown
  readonly defaultInput?: unknown
}

type Record_ = Record<string, unknown>

/**
 * Build the fact lookup from the settings answer.
 * @param providers - provider directory rows giving each route's settings address.
 * @param namespaces - the describe answer's namespace views.
 * @returns a lookup answering both fields for one provider and model.
 */
export function buildModelFacts(
  providers: readonly ConfigurableProviderRow[],
  namespaces: readonly NamespaceRow[],
): (provider: string, model: string) => ModelFacts {
  const byName = new Map(namespaces.map((row) => [row.ns, row.value]))
  const profiles = new Map<string, ProfileView>()
  for (const row of providers) {
    const section = byName.get(row.settingsNs)
    const profile = readPath(section, row.settingsPath)
    if (isRecord(profile)) profiles.set(row.provider, profile as ProfileView)
  }
  return (provider, model) => {
    const profile = profiles.get(provider)
    const entry = profile?.models === undefined
      ? undefined
      : profile.models.find((candidate) => candidate.id === model)
    if (profile === undefined || entry === undefined) return { contextWindow: undefined, images: 'unknown' }
    const window = typeof entry.contextWindow === 'number' && entry.contextWindow > 0
      ? entry.contextWindow
      : undefined
    return { contextWindow: window, images: imageAnswer(entry, profile) }
  }
}

/**
 * Read one model entry's accepted image modalities.
 *
 * The two adapter families disagree about an omission. The Messages family
 * names the field `inputModalities`, and leaving it out means text only. The
 * pi-ai family names it `input`, and an empty or absent list defers to the
 * route's `defaultInput`; with no route default the answer stays unknown.
 */
function imageAnswer(entry: Record_, profile: ProfileView): ImageAnswer {
  if (Array.isArray(entry.inputModalities)) return containsImage(entry.inputModalities)
  const defaultInput = Array.isArray(profile.defaultInput) ? profile.defaultInput : undefined
  if (Array.isArray(entry.input)) {
    if (entry.input.length > 0) return containsImage(entry.input)
    return defaultInput === undefined ? 'unknown' : containsImage(defaultInput)
  }
  return defaultInput === undefined ? 'no' : containsImage(defaultInput)
}

function containsImage(modalities: readonly unknown[]): ImageAnswer {
  return modalities.includes('image') ? 'yes' : 'no'
}

/**
 * Abbreviate one capacity the way the metadata line shows it.
 * @param tokens - exact advertised capacity in tokens.
 * @returns e.g. `1M ctx`, `1.5M ctx`, `272k ctx`, or `512 ctx` below a thousand.
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M ctx`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k ctx`
  return `${tokens} ctx`
}

/**
 * Build the metadata line's segments.
 * @param input.providerName - the provider's display name, omitted inside that provider's own tab.
 * @param input.facts - what the settings document answered.
 * @param input.thinks - whether the catalog advertises reasoning levels for this model.
 * @param input.effortLabel - the localized word for the reasoning segment.
 * @param input.imageLabel - the localized word for the image segment.
 * @returns the segments to join; an empty list means show no line.
 */
export function metaSegments(input: {
  readonly providerName?: string
  readonly facts: ModelFacts
  readonly thinks: boolean
  readonly effortLabel: string
  readonly imageLabel: string
}): readonly string[] {
  const segments: string[] = []
  if (input.providerName !== undefined) segments.push(input.providerName)
  if (input.facts.contextWindow !== undefined) segments.push(formatContextWindow(input.facts.contextWindow))
  if (input.thinks) segments.push(input.effortLabel)
  if (input.facts.images === 'yes') segments.push(input.imageLabel)
  return segments
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let cursor = value
  for (const key of path) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[key]
  }
  return cursor
}

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
