/**
 * 进度卡的数据视图：从一条工具调用（或它的结果）里读出标题与正文。
 *
 * 只读日志里已有的东西，不碰实时状态，所以直播与重放画出来一样：
 *   - 原生调用的 result 相位带 `meta`（`output.presentationMeta` 的产物）；
 *   - PTC 子调用的客户端节点不带 `meta`，但一定带 `call.argsRaw`；
 *   - 窗口截断时 `call` 可能是 null，退回 `argsRaw`。
 */

/** 一次汇报的内容；标题可以没有。 */
export interface Update {
  title?: string;
  message: string;
}

/** 从一段 JSON 参数里读汇报内容。 */
function parseArgs(raw: string | undefined): Update | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 流式阶段可能拿到截断的 JSON 前缀；这一帧没有内容可画。
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const message = typeof record['message'] === 'string' ? record['message'] : '';
  const title = typeof record['title'] === 'string' && record['title'].length > 0 ? record['title'] : undefined;
  if (message.length === 0 && title === undefined) return null;
  return title === undefined ? { message } : { title, message };
}

/** 从持久化的 `meta` 里读汇报内容。 */
function parseMeta(meta: unknown): Update | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const record = meta as Record<string, unknown>;
  const message = typeof record['message'] === 'string' ? record['message'] : '';
  const title = typeof record['title'] === 'string' && record['title'].length > 0 ? record['title'] : undefined;
  if (message.length === 0 && title === undefined) return null;
  return title === undefined ? { message } : { title, message };
}

/**
 * 读一条工具调用里的汇报内容。
 * @param block - toolview 的 `block`（start 相位或 result 相位）。
 * @returns 汇报内容；读不到时给一个空正文，卡片仍会画标题兜底。
 */
export function readUpdate(block: unknown): Update {
  if (typeof block !== 'object' || block === null) return { message: '' };
  const record = block as Record<string, unknown>;
  const fromMeta = parseMeta(record['meta']);
  if (fromMeta !== null) return fromMeta;
  const call = record['call'];
  if (typeof call === 'object' && call !== null) {
    const fromCall = parseArgs((call as Record<string, unknown>)['argsRaw'] as string | undefined);
    if (fromCall !== null) return fromCall;
  }
  const fromArgs = parseArgs(record['argsRaw'] as string | undefined);
  return fromArgs ?? { message: '' };
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
