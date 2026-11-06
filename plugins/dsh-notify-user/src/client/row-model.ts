/**
 * 进度卡的数据视图：从一条工具调用（或它的结果）里读出标题与正文。
 *
 * 只读日志里已有的东西，不碰实时状态，所以直播与重放画出来一样：
 *   - 原生调用的 result 相位带 `meta`（`output.presentationMeta` 的产物）；
 *   - PTC 子调用的节点同样带 `meta`（由 `tool/ptc-dispatch` 供给）；
 *   - 窗口截断时 `call` 可能是 null，退回 `argsRaw`。
 *
 * 这个文件是纯数据逻辑（不碰 DOM、不碰 React），宿主半边的 `presentationMeta`
 * 也 import 这里的 `parseUpdate`——两边读的是同一份日志，形状只能有一处定义。
 */

/** 一次汇报的内容；标题可以没有。 */
export interface Update {
  title?: string;
  message: string;
}

/** 一张进度卡要画的东西：工具行与对话节点两种座位都整理成这个形状。 */
export interface NotifyCardData {
  readonly title?: string;
  readonly message: string;
  readonly time: number;
  readonly settled: boolean;
}

/**
 * 从任意对象里读汇报内容——宿主半边投影 `presentationMeta` 也走这一份，
 * 两边读的是同一份日志，形状只能有一处定义。
 * @param value - 模型参数或持久化的 `meta`。
 * @returns 读得到时返回内容；两者都空时返回 null。
 */
export function parseUpdate(value: unknown): Update | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const message = typeof record['message'] === 'string' ? record['message'] : '';
  const title = typeof record['title'] === 'string' && record['title'].length > 0 ? record['title'] : undefined;
  if (message.length === 0 && title === undefined) return null;
  return title === undefined ? { message } : { title, message };
}

/**
 * 从一段 JSON 参数里读汇报内容。
 * @param raw - 模型产出的参数 JSON 文本；流式阶段可能是截断的前缀。
 * @returns 读得到时返回内容，否则 null。
 */
export function parseArgs(raw: string | undefined): Update | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return parseUpdate(JSON.parse(raw));
  } catch {
    // 流式阶段可能拿到截断的 JSON 前缀；这一帧没有内容可画。
    return null;
  }
}

/**
 * 读一条工具调用里的汇报内容。
 * @param block - toolview 的 `block`（start 相位或 result 相位）。
 * @returns 汇报内容；读不到时给一个空正文，卡片仍会画标题兜底。
 */
export function readUpdate(block: unknown): Update {
  if (typeof block !== 'object' || block === null) return { message: '' };
  const record = block as Record<string, unknown>;
  const fromMeta = parseUpdate(record['meta']);
  if (fromMeta !== null) return fromMeta;
  const call = record['call'];
  if (typeof call === 'object' && call !== null) {
    const fromCall = parseArgs((call as Record<string, unknown>)['argsRaw'] as string | undefined);
    if (fromCall !== null) return fromCall;
  }
  return parseArgs(record['argsRaw'] as string | undefined) ?? { message: '' };
}

/**
 * 卡片标题：模型给的标题优先，否则取正文首行，再否则用兜底文案。
 * @param update - 汇报内容。
 * @param fallback - 没有标题也没有正文时显示的那句。
 * @returns 一行标题。
 */
export function titleOf(update: Update, fallback: string): string {
  if (update.title !== undefined) return update.title;
  const first = update.message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (first === undefined) return fallback;
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

/**
 * 卡片右上角的时间：`MM-DD HH:mm`，与参考里的进度卡一致。
 * @param ms - Unix 毫秒；缺省或非法时返回 null。
 * @returns 格式化后的时间，或 null。
 */
export function formatClock(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
