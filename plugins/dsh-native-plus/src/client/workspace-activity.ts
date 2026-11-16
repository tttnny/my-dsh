/**
 * 侧边栏工作区行的运行标记：把「这个目录里有会话在跑」写到工作区行上。
 *
 * 为什么要写属性而不是纯 CSS：宿主折叠工作区时不渲染里面的会话行
 * （`deriveGroups` 里 `sessions: expanded ? … : []`），`:has()` 拿不到任何信号。
 * 所以判据在这里算，行上只留本插件自己的属性 `data-np-running`，样式表认它。
 *
 * 判据与宿主侧边栏会话行的「进行中」同一套：回合在跑看会话列表快照的 `running`，
 * 子代理在跑看 `projectionsBySession[父会话].values.subagentCatalog` 各项的 `running`，
 * 工作区归属看 `workspaces.list` 的 `items[].sessionIds`，不在任何工作区的会话归未分组桶。
 * 会话列表快照的 `running` 由宿主的 `api-session/status` 事件实时更新（`session-controller`
 * 的 `handleSessionStatus`），与 `uiSession.sessionStatus` 那张表同源，所以这里只读列表快照。
 *
 * 宿主契约只写结构子集（与 index.ts 的 `ClientServices` 同一套做法），不引契约包：
 * 这些字段由 `scripts/smoke-client.mjs` 的假快照与 `scripts/test-anchors.mjs` 的
 * `data-row-key` 锚点守着。
 */

/** 宿主快照源的结构子集：只读本插件用到的那两个方法。 */
export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** `workspaces.list` 快照里本插件读的字段。 */
export interface WorkspaceListLike {
  readonly items: readonly {
    readonly workspaceId: string
    readonly sessionIds: readonly string[]
  }[]
}

/** 会话列表快照里本插件读的字段。 */
export interface SessionListLike {
  /** 宿主列表成员；子代理不在其中，它们挂在父会话的 `subagentCatalog` 上。 */
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, { readonly running?: boolean } | undefined>>
  readonly projectionsBySession: Readonly<Record<string, {
    readonly values: { readonly subagentCatalog?: readonly { readonly id: string }[] }
  } | undefined>>
}

/** 行上的标记属性。`data-np-` 前缀归本插件，锚点自检不拿它去宿主源码里找。 */
export const ACTIVITY_ATTRIBUTE = 'data-np-running'

/** 工作区行的行键前缀（宿主 `data-row-key` 的形状）。 */
const ROW_KEY_PREFIX = 'workspace:'

/** 未分组桶的键：宿主 `UNGROUPED_KEY` 是空串。 */
const UNGROUPED_KEY = ''

/**
 * 一个会话是否正在跑。
 * @param id - 会话 id。
 * @param sessions - 会话列表快照。
 * @returns 是否正在跑。
 */
function isRunning(id: string, sessions: SessionListLike): boolean {
  return sessions.byId[id]?.running === true
}

/**
 * 该会话是否有正在跑的子代理，与宿主 `runningChildCount` 同一套判据。
 * @param id - 父会话 id。
 * @param sessions - 会话列表快照。
 * @returns 是否有子代理在跑。
 */
function hasRunningChild(id: string, sessions: SessionListLike): boolean {
  const catalog = sessions.projectionsBySession[id]?.values.subagentCatalog
  return catalog?.some(child => isRunning(child.id, sessions)) === true
}

/**
 * 算出「里面有会话在跑」的工作区键集合。
 * @param workspaces - 工作区列表快照。
 * @param sessions - 会话列表快照。
 * @returns 工作区键集合；未分组桶的键是空串。
 */
export function runningWorkspaceKeys(
  workspaces: WorkspaceListLike,
  sessions: SessionListLike,
): Set<string> {
  const keys = new Set<string>()
  const accounted = new Set<string>()
  const active = (id: string): boolean => isRunning(id, sessions) || hasRunningChild(id, sessions)
  for (const workspace of workspaces.items) {
    for (const id of workspace.sessionIds) {
      accounted.add(id)
      if (active(id)) {
        keys.add(workspace.workspaceId)
        break
      }
    }
  }
  for (const id of sessions.ids) {
    if (accounted.has(id)) continue
    if (active(id)) {
      keys.add(UNGROUPED_KEY)
      break
    }
  }
  return keys
}

/**
 * 把键集合写到当前文档的工作区行上；标记没变的行不动。
 * @param doc - 承载侧边栏的文档。
 * @param keys - 有会话在跑的工作区键集合。
 */
export function applyActivity(doc: Document, keys: ReadonlySet<string>): void {
  for (const row of doc.querySelectorAll<HTMLElement>(`[data-row-key^="${ROW_KEY_PREFIX}"]`)) {
    const key = row.getAttribute('data-row-key')?.slice(ROW_KEY_PREFIX.length)
    if (key === undefined) continue
    const marked = row.hasAttribute(ACTIVITY_ATTRIBUTE)
    if (keys.has(key)) {
      if (!marked) row.setAttribute(ACTIVITY_ATTRIBUTE, '')
    } else if (marked) {
      row.removeAttribute(ACTIVITY_ATTRIBUTE)
    }
  }
}

/** 两个快照源。 */
export interface ActivitySources {
  workspaces: SnapshotSource<WorkspaceListLike>
  sessions: SnapshotSource<SessionListLike>
}

/**
 * 两个集合是否同内容（顺序无关）。
 * @param a - 集合一。
 * @param b - 集合二。
 * @returns 是否同内容。
 */
function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const key of a) if (!b.has(key)) return false
  return true
}

/**
 * 持续把运行标记同步到工作区行上，返回撤销函数。
 *
 * 三条触发路径：两个快照源变化、行被重建、调用时的首次同步。行重建靠
 * `MutationObserver` 兜住——分组方式切换、工作区增删都会换掉行节点，而 React 不会
 * 替本插件补回属性。观察器只认增删节点里带 `data-row-key` 的，对话流的高频变更
 * 不会触发重放。
 * @param doc - 承载侧边栏的文档。
 * @param sources - 工作区与会话列表两个快照源。
 * @returns 撤销函数：退订、断开观察器、撤掉所有标记属性。
 */
export function watchWorkspaceActivity(doc: Document, sources: ActivitySources): () => void {
  const view = doc.defaultView
  const Observer = view?.MutationObserver
  let keys: ReadonlySet<string> = new Set()
  let frame = 0
  const paint = (): void => {
    frame = 0
    applyActivity(doc, keys)
  }
  const schedule = (): void => {
    if (frame !== 0) return
    if (view?.requestAnimationFrame === undefined) {
      paint()
      return
    }
    frame = view.requestAnimationFrame(paint)
  }
  const recompute = (): void => {
    const next = runningWorkspaceKeys(sources.workspaces.getSnapshot(), sources.sessions.getSnapshot())
    if (sameKeys(next, keys)) return
    keys = next
    schedule()
  }
  const disposers = [
    sources.workspaces.subscribe(recompute),
    sources.sessions.subscribe(recompute),
  ]
  const observer = Observer === undefined || doc.body === null
    ? undefined
    : new Observer((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== 1) continue
          const element = node as Element
          if (element.matches('[data-row-key]') || element.querySelector('[data-row-key]') !== null) {
            schedule()
            return
          }
        }
      }
    })
  observer?.observe(doc.body, { childList: true, subtree: true })
  recompute()
  schedule()
  return () => {
    for (const dispose of disposers) dispose()
    observer?.disconnect()
    if (frame !== 0 && view?.cancelAnimationFrame !== undefined) view.cancelAnimationFrame(frame)
    frame = 0
    for (const row of doc.querySelectorAll(`[${ACTIVITY_ATTRIBUTE}]`)) row.removeAttribute(ACTIVITY_ATTRIBUTE)
  }
}
