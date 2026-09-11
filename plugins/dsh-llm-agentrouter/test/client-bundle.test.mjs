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
 * @param {object} options.scope - the settings scope stub the card writes through.
 * @param {object[]} options.sectionEntries - pre-existing `settings.section` rows.
 * @returns {object} the context plus the slot registry it carries.
 */
function stubContext({ scope, sectionEntries = [] } = {}) {
  const { slots, registrations, injections, itemEntries, commit } = stubSlots({ sectionEntries })
  const declared = new Set(['slots', 'locale', 'settingsScope'])
  const services = {
    slots,
    locale: {
      register: () => () => {},
      bind: (ns) => (key) => `${ns}:${key}`,
      getSnapshot: () => ({ revision: 1 }),
      subscribe: () => () => {},
    },
    settingsScope: { bind: () => scope },
  }
  const base = {
    ...services,
    // `ctx.get` is how an OPTIONAL service is read without tripping the guard;
    // it must stay callable on the stub or the shell cannot read `locale`.
    get: (name) => services[name],
    effect: (factory) => factory(),
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
  return { ctx, registrations, injections, itemEntries, commit }
}

/**
 * A settings scope stub with the contract's snapshot shape.
 * @param {object} overrides - snapshot fields overriding the ready defaults.
 * @returns {object} the scope plus the writes it recorded.
 */
function stubScope(overrides = {}) {
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
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } }
      return Promise.resolve()
    },
    unset: () => Promise.resolve(),
  }
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
 * @param {object} scope - the settings scope stub it reads.
 * @returns {Promise<object>} the react-test-renderer tree.
 */
async function renderCard(exports_, scope) {
  let tree
  await act(async () => {
    tree = create(createElement(exports_.EndpointCard, { scope, t: (key) => key }))
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
  assert.deepEqual(exports.inject, ['slots', 'locale', 'settingsScope'])
  assert.equal(
    exports.SETTINGS_NS,
    'llm-agentrouter',
    'the browser half must address the namespace the Host half registers',
  )
})

test('apply claims the shared page and registers one card into its child slot', () => {
  const { registrations, injections, itemEntries } = applyBundle({ scope: stubScope() })

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
    scope: stubScope(),
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
  const { registrations, commit } = applyBundle({ scope: stubScope() })
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
  const { registrations, commit } = applyBundle({ scope: stubScope() })
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
  const tree = await renderCard(exports, stubScope())
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
  const scope = stubScope()
  const tree = await renderCard(exports, scope)
  const radios = tree.root.findAll((node) => node.type === 'input' && node.props.type === 'radio')
  assert.equal(radios.length, 2, 'one radio per endpoint')
  const intl = radios.find((node) => node.props.value === 'intl')
  await act(async () => {
    intl.props.onChange()
  })
  assert.deepEqual(scope.writes, [{ field: 'endpoint', value: 'intl' }], 'one write, one field')
  assert.equal(
    choicesOf(tree).get('intl').props['data-selected'],
    'true',
    'the card follows the section it just wrote',
  )
})

test('an unwritable or unreadable section offers no write', async () => {
  const { exports } = loadBundle()
  for (const overrides of [{ writable: false }, { status: 'loading', value: undefined }, { status: 'unavailable' }]) {
    const scope = stubScope(overrides)
    const tree = await renderCard(exports, scope)
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
    assert.deepEqual(scope.writes, [], `${where} must write nothing`)
  }
})
