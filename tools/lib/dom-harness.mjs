/**
 * 浏览器自检的共用底座：铺 jsdom 全局、造 ui-primitives 替身、走真实的 bundle 入口。
 *
 * 各插件的 `scripts/test-render.mjs` 都用真 react 把组件画进 jsdom，前面那一段
 * 样板是同一条路的三个坑叠出来的，抄一份改一处就会漏一处：
 *
 *   1. Node 24 把 `globalThis.navigator` 定义成 getter-only，直接赋值会抛；
 *   2. jsdom 不做布局，`offsetWidth` 恒为 0，组件里读它做贴合判断的要自己补；
 *   3. `@deepseek-ai/dsh-client-ui-primitives` 的真组件是浏览器里的 ESM、带 `.css`
 *      导入，Node 里跑不起来，只能用替身——但替身必须把 children 与 aria 原样
 *      渲染出来，否则验的就不是本插件的视图结构了。
 *
 * 本文件是**零依赖**的：`JSDOM` 由调用方传进来（`import { JSDOM } from 'jsdom'`），
 * 因为 `tools/` 下不许有依赖安装，而 jsdom 是各包自己的 devDependency。
 *
 * 用法：
 *
 *   import { JSDOM } from 'jsdom'
 *   import { installDom, primitivesStub, loadClientBundle } from '../../../tools/lib/dom-harness.mjs'
 *
 *   installDom(JSDOM, { storage: true })
 *   const exported = await loadClientBundle({
 *     root: import.meta.dirname + '/..',
 *     primitives: primitivesStub({
 *       Modal: ({ children }) => createElement('div', { role: 'dialog' }, children),
 *     }),
 *   })
 */

/**
 * 铺好 jsdom 的那一套全局。
 * @param jsdom - `JSDOM` 构造函数，由调用方从自己的依赖里取。
 * @param options - 可选项：`url` 页面地址；`storage` 是否铺 localStorage；`raf` 是否铺 requestAnimationFrame。
 * @returns 造出来的 jsdom 窗口，需要直接读 `dom.window` 时用得上。
 */
export function installDom(jsdom, options = {}) {
  const { url = 'http://127.0.0.1:3080/', storage = false, raf = false } = options
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const dom = new jsdom('<!doctype html><html><body></body></html>', { url, pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  // Node 24 的 globalThis.navigator 是 getter-only，赋值会抛；jsdom 那份本来就在
  // window 上，而 React 读的正是 window.navigator。
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

  for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver']) {
    globalThis[name] = dom.window[name]
  }
  // 没有 IntersectionObserver 时组件按「已在视口」处理，首跑照发。
  globalThis.IntersectionObserver = undefined

  if (storage) globalThis.localStorage = dom.window.localStorage
  if (raf) {
    globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  // jsdom 不做布局也没有滚动，组件调它是安全的空操作。
  globalThis.HTMLElement.prototype.scrollIntoView = () => {}
  return dom
}

/**
 * 造一个 ui-primitives 替身。
 *
 * 传进来的每个组件就是它真实的渲染结果；没传的一律渲染成空。`rankByName` 这类
 * 具名导出按普通值还原，不是组件。
 *
 * @param known - 本测试关心的那几个组件与具名导出。
 * @returns 可以直接塞进模块表的替身对象。
 */
export function primitivesStub(known) {
  return new Proxy(known, { get: (target, key) => (key in target ? target[key] : () => null) })
}

/**
 * 走真实的 bundle 入口装载插件，与页面里 shell 用的是同一条 `__ModuleLoader__` 路径。
 *
 * @param options - `root` 包目录；`primitives` 上面那个替身；`extra` 还要额外提供的模块。
 * @returns 插件 `apply()` 之前拿到的导出对象。
 */
export async function loadClientBundle({ root, primitives, extra = {} }) {
  const { createRequire } = await import('node:module')
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(join(root, 'scripts', 'noop.mjs'))

  const table = {
    'react': () => require('react'),
    'react/jsx-runtime': () => require('react/jsx-runtime'),
    'react-dom': () => require('react-dom'),
    'react-dom/client': () => require('react-dom/client'),
    '@deepseek-ai/dsh-client-ui-primitives': () => primitives,
    ...extra,
  }

  let exported
  globalThis.window.__ModuleLoader__ = {
    load: ({ factory }) => {
      exported = factory((spec) => {
        const resolve = table[spec]
        if (resolve === undefined) throw new Error(`module table miss: ${spec}`)
        return resolve()
      })
    },
  }
  await import(`${pathToFileURL(join(root, 'lib', 'client.js')).href}?render=${String(Date.now())}`)
  return exported
}
