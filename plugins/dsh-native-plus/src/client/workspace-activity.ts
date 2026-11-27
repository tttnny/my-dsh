/** 宿主快照源，只读本插件用到的两个方法。 */
export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface WorkspaceListLike {
  readonly items: readonly {
    readonly workspaceId: string
    readonly sessionIds: readonly string[]
  }[]
}

export interface SessionListLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, { readonly running?: boolean } | undefined>>
  readonly projectionsBySession: Readonly<Record<string, {
    readonly values: { readonly subagentCatalog?: readonly { readonly id: string }[] }
  } | undefined>>
}

export type SessionStatusLike = ReadonlyMap<string, { readonly running?: boolean }>

export const ACTIVITY_ATTRIBUTE = 'data-np-running'
const LIST_SELECTOR = '[data-sidebar-list-area]'
const ROW_KEY_PREFIX = 'workspace:'
const ROW_SELECTOR = `[data-row-key^="${ROW_KEY_PREFIX}"]`
const UNGROUPED_KEY = ''

/** 与宿主侧边栏会话行一致，优先读取原生状态表，未知时用会话摘要。 */
export function runningWorkspaceKeys(
  workspaces: WorkspaceListLike,
  sessions: SessionListLike,
  statuses: SessionStatusLike,
): Set<string> {
  const keys = new Set<string>()
  const accounted = new Set<string>()
  const running = (id: string): boolean =>
    (statuses.get(id)?.running ?? sessions.byId[id]?.running) === true
  const active = (id: string): boolean => running(id)
    || sessions.projectionsBySession[id]?.values.subagentCatalog?.some(child => running(child.id)) === true

  for (const workspace of workspaces.items) {
    for (const id of workspace.sessionIds) accounted.add(id)
    if (workspace.sessionIds.some(active)) keys.add(workspace.workspaceId)
  }
  if (sessions.ids.some(id => !accounted.has(id) && active(id))) keys.add(UNGROUPED_KEY)
  return keys
}

/** 折叠工作区不渲染会话行，所以用快照算状态，只往工作区行同步标记。 */
export function applyActivity(list: ParentNode, keys: ReadonlySet<string>): void {
  for (const row of list.querySelectorAll(ROW_SELECTOR)) {
    const key = row.getAttribute('data-row-key')?.slice(ROW_KEY_PREFIX.length)
    row.toggleAttribute(ACTIVITY_ATTRIBUTE, key !== undefined && keys.has(key))
  }
}

export interface ActivitySources {
  workspaces: SnapshotSource<WorkspaceListLike>
  sessions: SnapshotSource<SessionListLike>
  statuses: SnapshotSource<SessionStatusLike>
}

function containsElement(node: Node, selector: string): boolean {
  if (node.nodeType !== 1) return false
  const element = node as Element
  return element.matches(selector) || element.querySelector(selector) !== null
}

/** 随宿主快照变化及工作区行重建更新标记，卸载时清理观察器、订阅与标记。 */
export function watchWorkspaceActivity(doc: Document, sources: ActivitySources): () => void {
  const view = doc.defaultView
  const Observer = view?.MutationObserver
  let list: Element | null = null
  let keys: ReadonlySet<string> = new Set()
  let frame: number | undefined
  const paint = (): void => {
    frame = undefined
    if (list !== null) applyActivity(list, keys)
  }
  const schedule = (): void => {
    if (list === null || frame !== undefined) return
    if (view?.requestAnimationFrame === undefined) paint()
    else frame = view.requestAnimationFrame(paint)
  }
  const recompute = (): void => {
    const next = runningWorkspaceKeys(
      sources.workspaces.getSnapshot(), sources.sessions.getSnapshot(), sources.statuses.getSnapshot(),
    )
    if (next.size === keys.size && [...next].every(key => keys.has(key))) return
    keys = next
    schedule()
  }

  const observer = Observer === undefined ? undefined : new Observer(records => {
    if (list === null) {
      if (records.some(record => [...record.addedNodes].some(node => containsElement(node, LIST_SELECTOR)))) {
        bindList()
      }
    } else if (!list.isConnected) {
      bindList()
    } else if (records.some(record => list?.contains(record.target)
      && [...record.addedNodes].some(node => containsElement(node, ROW_SELECTOR)))) {
      schedule()
    }
  })
  function bindList(): void {
    observer?.disconnect()
    if (list !== null) applyActivity(list, new Set())
    list = doc.querySelector(LIST_SELECTOR)
    if (list === null) {
      observer?.observe(doc.documentElement, { childList: true, subtree: true })
      return
    }
    observer?.observe(list, { childList: true, subtree: true })
    // 只盯祖先的直接子节点，以便侧边栏被整体替换时重新定位。
    for (let parent = list.parentElement; parent !== null; parent = parent.parentElement) {
      observer?.observe(parent, { childList: true })
    }
    schedule()
  }

  const disposers = [sources.workspaces, sources.sessions, sources.statuses].map(source => source.subscribe(recompute))
  recompute()
  bindList()
  return () => {
    for (const dispose of disposers) dispose()
    observer?.disconnect()
    if (frame !== undefined) view?.cancelAnimationFrame?.(frame)
    if (list !== null) applyActivity(list, new Set())
  }
}
