/**
 * Behavioural tests for the browser half, run with `node --test`.
 *
 * The bundle is hand-written in the loader's lazy-CJS factory format (the
 * `clientBundle` tsdown preset that normally emits it is not published), so the
 * things that could silently break are exactly the ones a build would have
 * caught: the registration protocol, the module specifiers it requires, and
 * whether the card renders and writes the field it claims to own.
 *
 * The bundle is executed against a stub loader and stub services, then rendered
 * with `react-test-renderer` — no browser, no DSH shell. The card subscribes to
 * its section through `useSyncExternalStore`, so it is rendered as a component
 * rather than called as a function.
 *
 * The settings page is SHARED with `dsh-a6api`, so these tests also cover the
 * election: the shell claims `settings.section` only while no participant holds
 * it, the card joins the page's child slot, and the page renders one tab per
 * registered card, filtered by id.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'

const require_ = createRequire(import.meta.url)

/**
 * The ui-primitives baseline as thin React doubles. The harness cannot load the
 * published package (its ESM entry imports bundled stylesheets), so these mirror
 * the element shape and prop pass-through the real controls document: `Button`
 * renders a `<button>`, `Input` a wrapper `<span>` around the native `<input>`,
 * and `Checkbox` a `<label>` around a native checkbox that reports the checked
 * bit on change. Only the exports this bundle requires are present.
 */
const primitives = {
  Button: ({ variant, size, icon, className, children, ...rest }) => createElement(
    'button',
    { type: 'button', className, ...rest },
    icon !== undefined && icon !== null ? createElement('span', null, icon) : null,
    children,
  ),
  Input: ({ icon, className, ...rest }) => createElement(
    'span',
    { className },
    icon !== undefined && icon !== null ? createElement('span', null, icon) : null,
    createElement('input', rest),
  ),
  Checkbox: ({ checked, onChange, label, disabled = false, title, className }) => createElement(
    'label',
    { className, title },
    createElement('input', {
      type: 'checkbox',
      checked,
      disabled,
      onChange: (event) => { onChange(event.target.checked) },
    }),
    createElement('span', null, label),
  ),
}

/** Child slot both participants register their card into. */
const ITEM_SLOT = 'relay.settings.item'
/** Page id the first participant to activate claims. */
const PAGE_ID = 'relay'
/** Sidebar position of the shared page. */
const PAGE_ORDER = 120

/**
 * Execute the bundle the way the client module loader does and return what it
 * registered plus the exports its factory produced.
 *
 * @returns {{registered: object, exports: object}} the load call and its module.
 */
function loadBundle() {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let registered
  const sandbox = {
    __ModuleLoader__: {
      load: (row) => {
        registered = row
      },
    },
    document: undefined,
  }
  // The bundle is a classic script whose only free variables are the loader
  // facade and `document`; a Function wrapper is the smallest honest stand-in.
  new Function('window', 'document', source)(sandbox, undefined)
  assert.ok(registered !== undefined, 'the bundle must call window.__ModuleLoader__.load')
  const resolved = new Map([
    ['react', require_('react')],
    ['react/jsx-runtime', require_('react/jsx-runtime')],
    ['@deepseek-ai/dsh-client-ui-primitives', primitives],
  ])
  const exports_ = registered.factory((specifier) => {
    const module = resolved.get(specifier)
    assert.ok(module !== undefined, `the bundle required an unavailable module: ${specifier}`)
    return module
  })
  return { registered, exports: exports_ }
}

/**
 * A slot registry stub with the slice of the contract the bundle uses:
 * `inject` (run immediately), `register`, `entries`, `getVersion` and
 * `subscribe`.
 *
 * @param {object} options - registry options.
 * @param {object[]} options.sectionEntries - pre-existing `settings.section` rows.
 * @returns {object} the registry plus everything it recorded.
 */
function stubSlots({ sectionEntries = [] } = {}) {
  const registrations = []
  const injections = []
  const itemEntries = []
  let version = 0
  let listeners = []
  const commit = (options) => {
    itemEntries.push({ options })
    version += 1
    for (const listener of [...listeners]) listener()
  }
  const slots = {
    inject: (name, callback) => {
      injections.push(name)
      return callback()
    },
    register: (options, component) => {
      registrations.push({ options, component })
      if (options.name === ITEM_SLOT) commit(options)
      return () => {}
    },
    entries: (name) => (name === ITEM_SLOT ? [...itemEntries] : [...sectionEntries]),
    getVersion: (name) => (name === ITEM_SLOT ? version : 0),
    subscribe: (name, listener) => {
      listeners.push(listener)
      return () => {
        listeners = listeners.filter(entry => entry !== listener)
      }
    },
  }
  return { slots, registrations, injections, itemEntries, commit }
}

/**
 * The context the bundle is applied to. The proxy models the kernel's inject
 * guard: reading an undeclared service throws, which is how a missing `inject`
 * entry surfaces as a broken page instead of a silent no-op.
 *
 * @param {object} options - context options.
 * @param {object} options.form - the plugin entry's config form stub the card writes through.
 * @param {object} options.routeForm - the `llm-pi-ai` entry's config form stub the model list reads.
 * @param {object[]} options.sectionEntries - pre-existing `settings.section` rows.
 * @param {object} options.llm - the optional `remote.llm` face, when the runtime has one.
 * @param {object} options.settings - the optional `remote.settings` face.
 * @returns {object} the context plus the slot registry it carries.
 */
function stubContext({ form, routeForm, sectionEntries = [], llm, settings } = {}) {
  const { slots, registrations, injections, itemEntries, commit } = stubSlots({ sectionEntries })
  const declared = new Set(['slots', 'locale', 'configForms'])
  const optional = {}
  if (llm !== undefined) optional['remote.llm'] = llm
  if (settings !== undefined) optional['remote.settings'] = settings
  const waiting = []
  const services = {
    slots,
    locale: {
      register: () => () => {},
      bind: (ns) => (key) => `${ns}:${key}`,
      getSnapshot: () => ({ revision: 1 }),
      subscribe: () => () => {},
    },
    // One shared config form per profile entry, keyed by entry id: this
    // plugin's own entry, and the adapter's `llm-pi-ai` entry whose route the
    // card edits models in.
    configForms: { get: (entryId) => (entryId === 'llm-pi-ai' ? routeForm : form) },
  }
  const base = {
    ...services,
    // `ctx.get` is how an OPTIONAL service is read without tripping the guard;
    // it must stay callable on the stub or the shell cannot read `locale`.
    get: (name) => services[name] ?? optional[name],
    effect: (factory) => factory(),
    // The kernel's optional-dependency seam: the callback runs while the deps are
    // available. The stub re-runs a pending callback whenever a face it names is
    // mounted, which is what the card's capability store observes.
    inject: (deps, callback) => {
      waiting.push({ deps, callback })
      if (deps.every((dep) => dep in services || dep in optional)) callback(base)
      return () => {}
    },
  }
  const ctx = new Proxy(base, {
    get: (target, property) => {
      if (typeof property !== 'string') return target[property]
      if (!(property in target) && !declared.has(property)) {
        throw new Error(`cannot get property "${property}" without inject`)
      }
      return target[property]
    },
  })
  /**
   * Mount one optional Remote face, the way the Client assembly does after this
   * plugin has already activated.
   */
  const provide = (name, service) => {
    optional[name] = service
    for (const entry of waiting) {
      if (entry.deps.includes(name)) entry.callback(base)
    }
  }
  return { ctx, registrations, injections, itemEntries, commit, provide }
}

/**
 * A config form stub with the shared contract's snapshot shape.
 * @param {object} overrides - snapshot fields overriding the ready defaults.
 * @param {boolean} accepted - what a write answers; false is a Host refusal.
 * @returns {object} the form plus the writes it recorded.
 */
function stubForm(overrides = {}, accepted = true) {
  const writes = []
  let snapshot = {
    status: 'ready',
    value: { endpoint: 'cn', endpoints: { cn: 'ps.air-outer.com', intl: 'agentrouter.org' } },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
    ...overrides,
  }
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: (field, value) => {
      writes.push({ field, value })
      // A refused write leaves the section exactly as it stood, which is what
      // the card's read-back has to observe.
      if (accepted) snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } }
      return Promise.resolve(accepted)
    },
    unset: () => Promise.resolve(accepted),
  }
}

/**
 * The models the bundle patch declares, as the resolved `llm-pi-ai` section
 * carries them. Two entries are enough to cover both shapes the card must
 * preserve: one declaring every level, one withholding `off` entirely.
 */
const ROUTE_MODELS = [
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    contextWindow: 1000000,
    maxTokens: 128000,
    input: ['text', 'image'],
    reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  {
    id: 'glm-5.3',
    name: 'GLM 5.3',
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
  },
]

/** The relay host the route's `baseURL` names; the fence rewrites it on the wire. */
const SENTINEL_BASE_URL = 'https://relay.agentrouter.internal/v1'

/**
 * The `llm-pi-ai` form stub: the adapter's own entry, read by the model list.
 * @param {object} options - snapshot options.
 * @param {object[]} options.models - the models the resolved route serves.
 * @param {object} options.user - the raw user layer, present only when it owns the list.
 * @param {object} options.snapshot - further snapshot field overrides.
 * @returns {object} the form stub.
 */
function stubRouteForm({ models = ROUTE_MODELS, user, snapshot = {} } = {}) {
  const value = {
    providers: {
      agentrouter: {
        displayName: 'AgentRouter',
        api: 'openai-completions',
        baseURL: SENTINEL_BASE_URL,
        models,
      },
    },
  }
  const state = {
    status: 'ready',
    value,
    base: value,
    user,
    revision: 7,
    writable: true,
    mode: 'host',
    ...snapshot,
  }
  return { getSnapshot: () => state, subscribe: () => () => {} }
}

/**
 * The `remote.llm` face, answering one model listing.
 * @param {object[]} models - the models the relay lists.
 * @param {object} outcome - a full RemoteResult overriding the success default.
 * @returns {object} the face plus the calls it recorded.
 */
function stubLlm(models, outcome) {
  const calls = []
  return {
    calls,
    discoverModels: (ns, request) => {
      calls.push({ ns, request })
      return Promise.resolve(outcome ?? { ok: true, value: models })
    },
  }
}

/**
 * The `remote.settings` face, answering one write.
 * @param {object} outcome - a full RemoteResult overriding the success default.
 * @returns {object} the face plus the calls it recorded.
 */
function stubSettings(outcome) {
  const calls = []
  return {
    calls,
    mutate: (ns, ops, revision) => {
      calls.push({ ns, ops, revision })
      return Promise.resolve(outcome ?? { ok: true, value: { ns, revision: 8, writable: true, value: {} } })
    },
  }
}

/**
 * A translator that keeps `%s` placeholders, so a rendered diagnostic can be
 * asserted together with the Host message it carries.
 */
const MESSAGE_TEMPLATES = {
  refreshAdded: 'refreshAdded(%s,%s)',
  refreshNone: 'refreshNone(%s)',
  refreshFailed: 'refreshFailed(%s)',
  saveConflict: 'saveConflict(%s)',
  saveFailed: 'saveFailed(%s)',
  invalidId: 'invalidId(%s)',
  invalidDuplicate: 'invalidDuplicate(%s)',
  invalidNumber: 'invalidNumber(%s,%s)',
  invalidEffort: 'invalidEffort(%s,%s)',
}

/**
 * The bound translator the card is rendered with.
 * @param {string} key - dictionary key.
 * @returns {string} the key, or its message template.
 */
function stubT(key) {
  return MESSAGE_TEMPLATES[key] ?? key
}

/**
 * Render the model list on its own.
 * @param {object} exports_ - the loaded bundle's exports.
 * @param {object} routeForm - the `llm-pi-ai` form stub.
 * @param {object} operations - the normalized Host operations the card calls.
 * @returns {Promise<object>} the react-test-renderer tree.
 */
async function renderList(exports_, routeForm, operations) {
  let tree
  await act(async () => {
    tree = create(createElement(exports_.ModelList, { routeForm, operations, t: stubT }))
  })
  return tree
}

/**
 * One control inside a rendered tree.
 * @param {object} tree - a rendered tree.
 * @param {Function} predicate - node predicate.
 * @returns {object} the first matching node.
 */
function find(tree, predicate) {
  return tree.root.find(predicate)
}

/** The action button with the given `data-action`, when it exists. */
function actionOf(tree, name) {
  return find(tree, (node) => node.type === 'button' && node.props['data-action'] === name)
}

/** One model row by the id its draft row currently shows, when it exists. */
function rowOf_(tree, id) {
  return tree.root.findAll((node) => node.type === 'li' && node.props['data-model-id'] === id).at(0)
}

/** One field input of one row, addressed the way the card renders it. */
function inputOf(tree, index, field) {
  return find(
    tree,
    (node) => node.type === 'input'
      && node.props['data-model'] === String(index)
      && node.props['data-field'] === field,
  )
}

/** One model row's effort row, the wrapper that pairs a level checkbox with its wire box. */
function effortRowOf(tree, index, level) {
  return find(
    tree,
    (node) => node.type === 'div'
      && node.props['data-level'] === level
      && node.props['data-model'] === String(index),
  )
}

/** One reasoning level's checkbox, addressed by its row. */
function effortCheckboxOf(tree, index, level) {
  return effortRowOf(tree, index, level)
    .findAll((node) => node.type === 'input' && node.props.type === 'checkbox').at(0)
}

/** One reasoning level's wire box, addressed by its row. */
function effortWireOf(tree, index, level) {
  return effortRowOf(tree, index, level)
    .find((node) => node.type === 'input' && node.props['data-wire'] === level)
}

/** One input modality's checkbox, addressed by the wrapper the card renders around it. */
function modalityCheckboxOf(tree, index, name) {
  return find(
    tree,
    (node) => node.type === 'span'
      && node.props['data-modality'] === name
      && node.props['data-model'] === String(index),
  ).findAll((node) => node.type === 'input' && node.props.type === 'checkbox').at(0)
}

/** The status line's rendered text and kind. */
function statusOf(tree) {
  const node = find(tree, (child) => child.type === 'p' && child.props.className === 'dshAr_status' && child.props.role !== undefined)
  return { kind: node.props['data-kind'], text: node.props.children }
}

/**
 * The models array one recorded write set, for payload assertions.
 * @param {object} call - one recorded `remote.settings.mutate` call.
 * @returns {object[]} the drafted models.
 */
function modelsOfWrite(call) {
  return call.ops[0].value
}

/**
 * Apply the bundle to a stub context.
 * @param {object} options - context options.
 * @returns {object} the exports plus what the application registered.
 */
function applyBundle(options = {}) {
  const { exports } = loadBundle()
  const context = stubContext(options)
  exports.apply(context.ctx)
  return { exports, ...context }
}

/**
 * Render the card and return its tree.
 * @param {object} exports_ - the loaded bundle's exports.
 * @param {object} form - the plugin entry's config form stub it reads.
 * @returns {Promise<object>} the react-test-renderer tree.
 */
async function renderCard(exports_, form) {
  let tree
  await act(async () => {
    tree = create(createElement(exports_.EndpointCard, { form, t: (key) => key }))
  })
  return tree
}

/**
 * The endpoint choices a rendered card offers, keyed by endpoint.
 * @param {object} tree - a rendered card.
 * @returns {Map<string, object>} label props per endpoint.
 */
function choicesOf(tree) {
  const choices = new Map()
  for (const node of tree.root.findAll((node) => node.type === 'label')) {
    const endpoint = node.props['data-endpoint']
    if (endpoint !== undefined) choices.set(endpoint, node)
  }
  return choices
}

test('the bundle registers under its package id and declares the services it uses', () => {
  const { registered, exports } = loadBundle()
  assert.equal(registered.id, '@lynn123411/dsh-llm-agentrouter', 'the id must match the package name the Host scans')
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots', 'locale', 'configForms'])
  assert.equal(
    exports.SETTINGS_NS,
    'llm-agentrouter',
    'the browser half must address the namespace the Host half registers',
  )
})

test('apply claims the shared page and registers one card into its child slot', () => {
  const { registrations, injections, itemEntries } = applyBundle({ form: stubForm() })

  assert.deepEqual(
    injections,
    ['settings.section', ITEM_SLOT],
    'the card joins the shared page instead of the Plugins settings tabs',
  )
  assert.equal(registrations.length, 2, 'one page claim plus one card')

  const page = registrations.find((entry) => entry.options.name === 'settings.section')
  assert.ok(page !== undefined, 'someone must declare the shared page')
  assert.equal(page.options.id, PAGE_ID)
  assert.equal(page.options.order, PAGE_ORDER)
  assert.deepEqual(
    Object.keys(page.options.children),
    [ITEM_SLOT],
    'the page must declare the child slot its participants register into',
  )

  assert.equal(itemEntries.length, 1)
  const card = itemEntries[0]
  assert.equal(card.options.name, ITEM_SLOT)
  assert.equal(card.options.id, 'llm-agentrouter', 'the card id is the plugin settings namespace')
  assert.equal(card.options.order, 20, 'the endpoint card is the second tab, after A6api')
  assert.equal(typeof card.options.label, 'function', 'the tab label localizes')
  assert.equal(card.options.label(), 'settings.agentrouter:title', 'the tab shows the card title')
  assert.equal(card.options.locale, 'settings.agentrouter')
})

test('the card joins the page shell without ever redeclaring it', () => {
  // The loser's contract: the page row already exists, so the shell must stay
  // silent and only the card may register.
  const { registrations } = applyBundle({
    form: stubForm(),
    sectionEntries: [{ options: { id: PAGE_ID } }],
  })
  assert.equal(
    registrations.find((entry) => entry.options.name === 'settings.section'),
    undefined,
    'a second declarer would trip the kernel duplicate-id guard',
  )
  assert.equal(registrations.length, 1, 'only the card registers when another participant holds the page')
  assert.equal(registrations[0].options.name, ITEM_SLOT)
})

test('the dictionaries cover the shared page name too', () => {
  // A missing key renders as the key itself in one language only, which no test
  // of the rendered card would notice.
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const keysOf = (name) => {
    const body = source.slice(source.indexOf(`const ${name} = {`))
    return [...body.slice(0, body.indexOf('};')).matchAll(/^\t{3}(\w+):/gm)].map((match) => match[1]).sort()
  }
  assert.deepEqual(keysOf('en'), keysOf('zh'))
  assert.ok(keysOf('zh').includes('pageNav'), 'the shared page is named in the dictionaries')
})

test('the shell renders one tab per registered card and filters each panel by id', async () => {
  const { registrations, commit } = applyBundle({ form: stubForm() })
  const page = registrations.find((entry) => entry.options.name === 'settings.section')

  // Stand in for the other participant: dsh-a6api's card, registered first.
  commit({ id: 'dsh-a6api', order: 10, label: () => 'A6api' })

  const rendered = []
  const renderSlot = (name, owner, filter) => {
    rendered.push({ name, owner, filter })
    return createElement('div', { 'data-panel': filter.only })
  }
  const PageComponent = page.component
  let tree
  await act(async () => {
    tree = create(createElement(PageComponent, {
      renderSlot,
      relayTabs: page.options.inject().relayTabs,
    }))
  })

  const tabs = () => tree.root.findAll((node) => node.type === 'button' && node.props.role === 'tab')
  assert.deepEqual(
    tabs().map((node) => node.props.children[0]),
    ['A6api', 'settings.agentrouter:title'],
    'tabs follow the card order: the other participant first, this card second',
  )
  assert.deepEqual(tabs().map((node) => node.props['aria-selected']), [true, false], 'the first tab opens selected')
  assert.deepEqual(
    rendered.map((entry) => entry.name),
    [ITEM_SLOT, ITEM_SLOT],
    'both panels come from the shared page child slot',
  )
  assert.deepEqual(
    rendered.map((entry) => entry.filter.only),
    ['dsh-a6api', 'llm-agentrouter'],
    'each panel renders exactly its own card',
  )
  const panels = () => tree.root.findAll((node) => node.props.role === 'tabpanel')
  assert.equal(panels()[1].props.style.display, 'none', 'the inactive panel is hidden by style, not only by attribute')

  // Switching tabs re-filters and moves the marker.
  await act(async () => {
    tabs()[1].props.onClick()
  })
  assert.deepEqual(tabs().map((node) => node.props['aria-selected']), [false, true])
})

test('a card that registers after the page mounted appears as its own tab', async () => {
  // The participants activate independently, so the roster must stay live: the
  // page may already be projected when a card lands — or lands before it, which
  // the roster test above covers.
  const { registrations, commit } = applyBundle({ form: stubForm() })
  const page = registrations.find((entry) => entry.options.name === 'settings.section')

  const rendered = []
  const renderSlot = (name, owner, filter) => {
    rendered.push(filter.only)
    return null
  }
  const PageComponent = page.component
  let tree
  await act(async () => {
    tree = create(createElement(PageComponent, {
      renderSlot,
      relayTabs: page.options.inject().relayTabs,
    }))
  })

  const tabs = () => tree.root.findAll((node) => node.type === 'button' && node.props.role === 'tab')
  assert.deepEqual(
    tabs().map((node) => node.props.children[0]),
    ['settings.agentrouter:title'],
    'this plugin already contributed its card during apply',
  )

  await act(async () => {
    commit({ id: 'dsh-a6api', order: 10, label: () => 'A6api' })
  })
  assert.deepEqual(
    tabs().map((node) => node.props.children[0]),
    ['A6api', 'settings.agentrouter:title'],
    'a later registration orders itself into the existing tab bar',
  )
  assert.deepEqual(rendered, ['llm-agentrouter', 'dsh-a6api', 'llm-agentrouter'])
})

test('the card renders both endpoints, marks the selected one, and names each host', async () => {
  const { exports } = loadBundle()
  const tree = await renderCard(exports, stubForm())
  const choices = choicesOf(tree)
  assert.deepEqual([...choices.keys()], ['cn', 'intl'], 'both endpoints are offered, domestic first')
  assert.equal(choices.get('cn').props['data-selected'], 'true', 'the stored endpoint is selected')
  assert.equal(choices.get('intl').props['data-selected'], undefined)
  assert.equal(choices.get('cn').props['data-disabled'], undefined, 'a writable ready section allows a switch')

  const hosts = tree.root
    .findAll((node) => node.type === 'span' && node.props.className === 'dshAr_choiceHost')
    .map((node) => node.props.children)
  assert.ok(hosts.includes('ps.air-outer.com'), 'each choice shows the host it means')
  assert.ok(hosts.includes('agentrouter.org'))

  // Each endpoint carries its own guidance, so neither choice is a guess.
  const hints = tree.root
    .findAll((node) => node.type === 'span' && node.props.className === 'dshAr_choiceHint')
    .map((node) => node.props.children)
  assert.deepEqual(hints, ['cnHint', 'intlHint'], 'both endpoints explain when they apply')
})

test('choosing the other endpoint writes exactly the endpoint field', async () => {
  const { exports } = loadBundle()
  const form = stubForm()
  const tree = await renderCard(exports, form)
  const radios = tree.root.findAll((node) => node.type === 'input' && node.props.type === 'radio')
  assert.equal(radios.length, 2, 'one radio per endpoint')
  const intl = radios.find((node) => node.props.value === 'intl')
  await act(async () => {
    intl.props.onChange()
  })
  assert.deepEqual(form.writes, [{ field: 'endpoint', value: 'intl' }], 'one write, one field')
  assert.equal(
    choicesOf(tree).get('intl').props['data-selected'],
    'true',
    'the card follows the section it just wrote',
  )
})

test('a refused endpoint write is reported and leaves the selection where it stood', async () => {
  const { exports } = loadBundle()
  // The form answers `false` for a Host refusal and runs its own recovery read;
  // the card must surface that as a failure instead of claiming the switch.
  const form = stubForm({}, false)
  const tree = await renderCard(exports, form)
  const intl = tree.root
    .findAll((node) => node.type === 'input' && node.props.type === 'radio')
    .find((node) => node.props.value === 'intl')
  await act(async () => {
    intl.props.onChange()
  })
  assert.deepEqual(form.writes, [{ field: 'endpoint', value: 'intl' }], 'the attempt is still one write')
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'failed' }, 'the card reports the refusal')
  assert.equal(choicesOf(tree).get('cn').props['data-selected'], 'true', 'the stored endpoint still stands')
})

test('an unwritable or unreadable section offers no write', async () => {
  const { exports } = loadBundle()
  for (const overrides of [{ writable: false }, { status: 'loading', value: undefined }, { status: 'unavailable' }]) {
    const form = stubForm(overrides)
    const tree = await renderCard(exports, form)
    const where = JSON.stringify(overrides)
    for (const choice of choicesOf(tree).values()) {
      assert.equal(choice.props['data-disabled'], 'true', `${where} must not invite a switch`)
    }
    // Disabled chrome is a hint; refusing the write is the guarantee.
    const other = tree.root
      .findAll((node) => node.type === 'input' && node.props.type === 'radio')
      .find((node) => node.props.value === 'intl')
    await act(async () => {
      other.props.onChange()
    })
    assert.deepEqual(form.writes, [], `${where} must write nothing`)
  }
})

test('the model list shows the route’s own models and their declared parameters', async () => {
  const { exports } = loadBundle()
  const tree = await renderList(exports, stubRouteForm(), {})

  const rows = tree.root.findAll((node) => node.type === 'li')
  assert.deepEqual(
    rows.map((node) => node.props['data-model-id']),
    ['claude-opus-5', 'glm-5.3'],
    'one row per model the route serves, in declared order',
  )
  assert.equal(inputOf(tree, 0, 'contextWindow').props.value, '1000000', 'a capacity is edited as what it resolves to')
  assert.equal(inputOf(tree, 1, 'maxTokens').props.value, '131072')

  // Off is offered only where the route declares it, and its wire box only opens
  // then — an unoffered level cannot carry a value the relay would never get.
  assert.equal(effortCheckboxOf(tree, 0, 'off').props.checked, true)
  assert.equal(effortCheckboxOf(tree, 1, 'off').props.checked, false, 'glm-5.3 always thinks')
  assert.equal(effortWireOf(tree, 1, 'off').props.disabled, true)
  assert.equal(effortWireOf(tree, 0, 'xhigh').props.value, 'xhigh', 'the wire spelling is editable, not implied')

  assert.equal(modalityCheckboxOf(tree, 0, 'image').props.checked, true)
  assert.equal(modalityCheckboxOf(tree, 1, 'image').props.checked, false, 'a model declaring no modalities claims none')
})

test('update merges the relay’s listing and seeds only the new models with the defaults', async () => {
  const { exports } = loadBundle()
  const asked = []
  const operations = {
    discover: (request) => {
      asked.push(request)
      return Promise.resolve({ ok: true, models: [{ id: 'claude-opus-5' }, { id: 'gpt-6-astra' }] })
    },
    // The card is wired with both faces; a merge that cannot be saved would be a
    // dead end, so 更新 is offered only alongside the ability to write.
    write: () => Promise.resolve({ ok: true, revision: 8 }),
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  await act(async () => {
    actionOf(tree, 'refresh').props.onClick()
  })

  assert.deepEqual(
    asked,
    [{ provider: 'agentrouter', baseURL: SENTINEL_BASE_URL, api: 'openai-completions' }],
    'the probe names the route and the endpoint the route resolves to',
  )
  assert.deepEqual(
    tree.root.findAll((node) => node.type === 'li').map((node) => node.props['data-model-id']),
    ['claude-opus-5', 'glm-5.3', 'gpt-6-astra'],
    'a listed model is kept once, a missing one is appended — never a wholesale replace',
  )
  assert.equal(inputOf(tree, 2, 'contextWindow').props.value, '1048576', 'a discovered model starts from the documented defaults')
  assert.equal(inputOf(tree, 2, 'maxTokens').props.value, '131072')
  assert.equal(inputOf(tree, 0, 'contextWindow').props.value, '1000000', 'an existing model keeps what it had')
  assert.equal(
    effortCheckboxOf(tree, 2, 'xhigh').props.checked,
    true,
    'every level is offered by default',
  )
  assert.deepEqual(statusOf(tree), { kind: 'info', text: 'refreshAdded(2,1)' })
})

test('saving writes the drafted list as the route’s models, fenced by the revision it read', async () => {
  const { exports } = loadBundle()
  const settings = stubSettings()
  const operations = {
    discover: () => Promise.resolve({ ok: true, models: [{ id: 'gpt-6-astra' }] }),
    write: (ops, revision) => settings.mutate('llm-pi-ai', ops, revision).then(
      (response) => (response.ok
        ? { ok: true, revision: response.value.revision }
        : { ok: false, code: response.error.code, message: response.error.message }),
    ),
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  await act(async () => {
    actionOf(tree, 'refresh').props.onClick()
  })
  await act(async () => {
    inputOf(tree, 0, 'contextWindow').props.onChange({ target: { value: '4096' } })
  })
  await act(async () => {
    modalityCheckboxOf(tree, 0, 'image')
      .props.onChange({ target: { checked: false } })
  })
  await act(async () => {
    actionOf(tree, 'save').props.onClick()
  })

  assert.equal(settings.calls.length, 1, 'one atomic write for the whole list')
  const call = settings.calls[0]
  assert.equal(call.ns, 'llm-pi-ai', 'the list lives on the adapter’s route, not in this plugin’s namespace')
  assert.deepEqual(call.ops.map((op) => [op.op, op.path]), [['set', ['providers', 'agentrouter', 'models']]])
  assert.equal(call.revision, 7, 'the write is fenced by the revision the draft was opened at')
  const models = modelsOfWrite(call)
  assert.deepEqual(models.map((model) => model.id), ['claude-opus-5', 'glm-5.3', 'gpt-6-astra'])
  assert.equal(models[0].contextWindow, 4096, 'an edited capacity is written as a number')
  assert.deepEqual(models[0].input, ['text'], 'an unchecked modality is dropped')
  assert.deepEqual(models[1].reasoningEfforts, { low: 'low', high: 'high', max: 'max' }, 'an untouched model is written exactly as it stood')
  assert.deepEqual(models[2], {
    id: 'gpt-6-astra',
    name: 'gpt-6-astra',
    contextWindow: 1048576,
    maxTokens: 131072,
    input: ['text', 'image'],
    reasoningEfforts: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  }, 'a discovered model carries the documented defaults, with `off` sending nothing')
  assert.deepEqual(statusOf(tree), { kind: 'info', text: 'saveDone' })
})

test('a draft the adapter would refuse never reaches the Host', async () => {
  const { exports } = loadBundle()
  const written = []
  const operations = {
    write: (ops, revision) => {
      written.push({ ops, revision })
      return Promise.resolve({ ok: true, revision: 9 })
    },
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  const save = async () => {
    await act(async () => {
      actionOf(tree, 'save').props.onClick()
    })
  }

  await act(async () => {
    inputOf(tree, 1, 'id').props.onChange({ target: { value: '' } })
  })
  await save()
  assert.deepEqual(written, [], 'an empty id is refused before the wire')
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'invalidId(2)' })

  await act(async () => {
    inputOf(tree, 1, 'id').props.onChange({ target: { value: 'claude-opus-5' } })
  })
  await save()
  assert.deepEqual(written, [])
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'invalidDuplicate(claude-opus-5)' })

  await act(async () => {
    inputOf(tree, 1, 'id').props.onChange({ target: { value: 'glm-5.3' } })
    inputOf(tree, 1, 'contextWindow').props.onChange({ target: { value: '-1' } })
  })
  await save()
  assert.deepEqual(written, [], 'a capacity the schema would refuse is caught here')
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'invalidNumber(2,fieldContext)' })

  await act(async () => {
    inputOf(tree, 1, 'contextWindow').props.onChange({ target: { value: '1000000' } })
    effortCheckboxOf(tree, 1, 'medium')
      .props.onChange({ target: { checked: true } })
  })
  await save()
  assert.deepEqual(written, [], 'an offered level with no wire value is caught here')
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'invalidEffort(2,medium)' })
})

test('a refused write keeps the draft and shows the Host’s own diagnostic', async () => {
  const { exports } = loadBundle()
  const operations = {
    write: () => Promise.resolve({ ok: false, code: 'settings/refused', message: 'agentrouter: model "x" declares no protocol' }),
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  await act(async () => {
    inputOf(tree, 0, 'name').props.onChange({ target: { value: 'Renamed' } })
  })
  await act(async () => {
    actionOf(tree, 'save').props.onClick()
  })
  assert.deepEqual(
    statusOf(tree),
    { kind: 'error', text: 'saveFailed(agentrouter: model "x" declares no protocol)' },
    'the adapter’s own refusal is what the user reads',
  )
  assert.equal(inputOf(tree, 0, 'name').props.value, 'Renamed', 'a refused draft is not thrown away')
})

test('a stale revision reads as a conflict rather than a generic refusal', async () => {
  const { exports } = loadBundle()
  const operations = {
    write: () => Promise.resolve({ ok: false, code: 'settings/conflict', message: 'revision 9 stands' }),
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  await act(async () => {
    inputOf(tree, 0, 'name').props.onChange({ target: { value: 'Renamed' } })
  })
  await act(async () => {
    actionOf(tree, 'save').props.onClick()
  })
  assert.deepEqual(statusOf(tree), { kind: 'error', text: 'saveConflict(revision 9 stands)' })
})

test('reset removes a user-owned list, and otherwise only drops the draft', async () => {
  const { exports } = loadBundle()
  const written = []
  const operations = {
    write: (ops, revision) => {
      written.push({ ops, revision })
      return Promise.resolve({ ok: true, revision: 12 })
    },
  }

  // The user layer owns the list: reset clears that override so the composition
  // (the bundle patch's hand-declared models) serves again. The route dict holds
  // nothing but `models`, so removing the list would leave it empty — and a reset
  // that leaves an empty dict behind keeps the route looking user-owned.
  const owned = await renderList(
    exports,
    stubRouteForm({ user: { providers: { agentrouter: { models: [{ id: 'glm-5.3' }] } } } }),
    operations,
  )
  await act(async () => {
    actionOf(owned, 'reset').props.onClick()
  })
  assert.deepEqual(written, [{
    ops: [
      { op: 'unset', path: ['providers', 'agentrouter', 'models'] },
      { op: 'unset', path: ['providers', 'agentrouter'] },
      { op: 'unset', path: ['providers'] },
    ],
    revision: 7,
  }])
  assert.deepEqual(statusOf(owned), { kind: 'info', text: 'resetDone' })

  // A sibling the user set through another surface keeps its ancestor alive.
  const shared = await renderList(
    exports,
    stubRouteForm({
      user: { providers: { agentrouter: { models: [{ id: 'glm-5.3' }], maxTokens: 4096 } } },
    }),
    operations,
  )
  await act(async () => {
    actionOf(shared, 'reset').props.onClick()
  })
  assert.deepEqual(
    written.at(-1).ops,
    [{ op: 'unset', path: ['providers', 'agentrouter', 'models'] }],
    'an ancestor holding another field is never removed',
  )

  // No stored override: there is nothing to unset, so a draft is simply dropped.
  const drafted = await renderList(exports, stubRouteForm(), operations)
  assert.equal(actionOf(drafted, 'reset').props.disabled, true, 'nothing to reset before an edit')
  await act(async () => {
    inputOf(drafted, 0, 'name').props.onChange({ target: { value: 'Renamed' } })
  })
  assert.equal(actionOf(drafted, 'reset').props.disabled, false, 'a draft is resettable without any stored override')
  const before = written.length
  await act(async () => {
    actionOf(drafted, 'reset').props.onClick()
  })
  assert.equal(written.length, before, 'dropping a draft writes nothing')
  assert.equal(inputOf(drafted, 0, 'name').props.value, 'Claude Opus 5', 'the dropped draft re-reads the section')
})

test('an unwritable or unreadable route section offers no edit, probe, or write', async () => {
  const { exports } = loadBundle()
  const written = []
  let probed = 0
  const operations = {
    discover: () => {
      probed += 1
      return Promise.resolve({ ok: true, models: [{ id: 'gpt-6-astra' }] })
    },
    write: (ops, revision) => {
      written.push({ ops, revision })
      return Promise.resolve({ ok: true, revision: 8 })
    },
  }
  for (const snapshot of [{ writable: false }, { status: 'unavailable', value: undefined }, { status: 'loading', value: undefined }]) {
    const where = JSON.stringify(snapshot)
    const tree = await renderList(exports, stubRouteForm({ models: [], snapshot }), operations)
    for (const name of ['refresh', 'save', 'add']) {
      assert.equal(actionOf(tree, name).props.disabled, true, `${where} must not offer ${name}`)
    }
    await act(async () => {
      actionOf(tree, 'refresh').props.onClick()
      actionOf(tree, 'save').props.onClick()
      actionOf(tree, 'add').props.onClick()
    })
    assert.equal(probed, 0, `${where} must not probe the relay`)
    assert.deepEqual(written, [], `${where} must write nothing`)
  }

  // Disabled chrome is a hint; naming the reason is what the card owes the user.
  const readOnly = await renderList(exports, stubRouteForm({ snapshot: { writable: false } }), operations)
  const hints = readOnly.root
    .findAll((node) => node.type === 'p' && node.props.className === 'dshAr_lead')
    .map((node) => node.props.children)
  assert.ok(hints.includes('readOnlyModels'), 'a read-only deployment is named, not silently inert')
})

test('without the LLM Remote the probe is unavailable and says so, while editing still works', async () => {
  const { exports } = loadBundle()
  const written = []
  const operations = {
    write: (ops, revision) => {
      written.push({ ops, revision })
      return Promise.resolve({ ok: true, revision: 9 })
    },
  }
  const tree = await renderList(exports, stubRouteForm(), operations)
  assert.equal(actionOf(tree, 'refresh').props.disabled, true)
  const hints = tree.root
    .findAll((node) => node.type === 'p' && node.props.className === 'dshAr_lead')
    .map((node) => node.props.children)
  assert.ok(hints.includes('refreshUnavailable'), 'the missing capability is named')

  await act(async () => {
    inputOf(tree, 0, 'name').props.onChange({ target: { value: 'Renamed' } })
  })
  await act(async () => {
    actionOf(tree, 'save').props.onClick()
  })
  assert.equal(written.length, 1, 'the write face is independent of the probe face')
})

test('apply binds the adapter namespace and unwraps the Remote results the card consumes', async () => {
  const llm = stubLlm([{ id: 'gpt-6-astra' }])
  const settings = stubSettings({ ok: false, error: { code: 'settings/conflict', message: 'stale revision' } })
  const form = stubForm()
  const routeForm = stubRouteForm()
  const { registrations } = applyBundle({ form, routeForm, llm, settings })

  const card = registrations.find((entry) => entry.options.name === ITEM_SLOT)
  const injected = card.options.inject()
  assert.equal(injected.form, form, 'the endpoint switch reads its own entry’s form')
  assert.equal(injected.routeForm, routeForm, 'the model list reads the adapter entry’s form')
  assert.equal(injected.operations.available(), true, 'the probe face is reported present')

  const found = await injected.operations.discover({ provider: 'agentrouter', baseURL: SENTINEL_BASE_URL })
  assert.deepEqual(found, { ok: true, models: [{ id: 'gpt-6-astra' }] }, 'a Remote success becomes the card’s own outcome shape')
  assert.deepEqual(llm.calls, [{ ns: 'llm-pi-ai', request: { provider: 'agentrouter', baseURL: SENTINEL_BASE_URL } }])

  const refused = await injected.operations.write([{ op: 'unset', path: ['providers', 'agentrouter', 'models'] }], 7)
  assert.deepEqual(refused, { ok: false, code: 'settings/conflict', message: 'stale revision' }, 'a Remote refusal keeps its code')
  assert.deepEqual(settings.calls.map((call) => call.ns), ['llm-pi-ai'])
})

test('a runtime without the optional Remotes still mounts the card', async () => {
  // The two Host faces are optional reads, so their absence must not trip the
  // inject guard and take the whole plugin off the page — and a click in that
  // state answers with a reason instead of throwing.
  const { registrations } = applyBundle({ form: stubForm(), routeForm: stubRouteForm() })
  const card = registrations.find((entry) => entry.options.name === ITEM_SLOT)
  const injected = card.options.inject()
  assert.equal(injected.operations.available(), false)
  assert.deepEqual(
    await injected.operations.discover({}),
    { ok: false, message: 'settings.agentrouter:refreshUnavailable' },
  )
  assert.deepEqual(
    await injected.operations.write([], 1),
    { ok: false, code: 'settings/unavailable', message: 'settings.agentrouter:readOnlyModels' },
  )
})

test('a Remote face that mounts after activation turns 更新 on without a reload', async () => {
  // The namespaces install asynchronously, so a face captured at activation could
  // read as absent for the whole session; the card must pick it up when it lands.
  const { exports } = loadBundle()
  const routeForm = stubRouteForm()
  const context = stubContext({ form: stubForm(), routeForm })
  exports.apply(context.ctx)
  const card = context.registrations.find((entry) => entry.options.name === ITEM_SLOT)
  const injected = card.options.inject()
  assert.equal(injected.operations.available(), false, 'nothing is mounted yet')

  let tree
  await act(async () => {
    tree = create(createElement(exports.ModelList, {
      routeForm,
      operations: injected.operations,
      t: stubT,
    }))
  })
  assert.equal(actionOf(tree, 'refresh').props.disabled, true, 'no probe face, no probe')

  await act(async () => {
    context.provide('remote.llm', stubLlm([{ id: 'gpt-6-astra' }]))
  })
  assert.equal(actionOf(tree, 'refresh').props.disabled, false, 'the announcement re-renders into the new capability')
  await act(async () => {
    actionOf(tree, 'refresh').props.onClick()
  })
  assert.deepEqual(
    tree.root.findAll((node) => node.type === 'li').map((node) => node.props['data-model-id']),
    ['claude-opus-5', 'glm-5.3', 'gpt-6-astra'],
    'the probe works once its face arrives',
  )
})

test('the card renders the model list under the endpoint choices when the route form is injected', async () => {
  const { exports } = loadBundle()
  const routeForm = stubRouteForm()
  let tree
  await act(async () => {
    tree = create(createElement(exports.EndpointCard, {
      form: stubForm(),
      t: stubT,
      routeForm,
      operations: { write: () => Promise.resolve({ ok: true, revision: 8 }) },
    }))
  })
  assert.equal(choicesOf(tree).size, 2, 'the endpoint switch is unchanged by the new section')
  assert.ok(rowOf_(tree, 'claude-opus-5') !== undefined, 'the route’s models are listed in the same tab')

  // A card injected without the route form shows only the switch.
  const legacy = await renderCard(exports, stubForm())
  assert.deepEqual(
    legacy.root.findAll((node) => node.props['data-model-list'] !== undefined),
    [],
    'the model list is additive, never a precondition for the endpoint switch',
  )
})

test('the inject guard every other case relies on really throws', () => {
  // A guard that stopped guarding would make the whole file pass while a real
  // page break (reading an undeclared service) went unnoticed, so the gate gets
  // its own counter-example.
  const { ctx } = stubContext({ form: stubForm(), routeForm: stubRouteForm() })
  assert.throws(() => ctx.remote, /cannot get property "remote" without inject/)
  assert.throws(() => ctx.llm, /cannot get property "llm" without inject/)
  assert.equal(ctx.get('remote.llm'), undefined, 'the optional read the card uses stays legal')
})
