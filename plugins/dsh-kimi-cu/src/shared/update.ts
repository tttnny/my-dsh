/**
 * 更新链路的两半边共用形状：路由、清单地址、事件与失败分类。
 *
 * 这里只放类型与字面量：宿主用它执行更新并吐事件，卡片用同一份类型挑文案。
 */

/** 更新路由：GET 读检查结果，POST 跑一次更新并吐 NDJSON 事件。 */
export const UPDATE_ROUTE_PATH = '/api/dsh-kimi-cu/update';

/** macOS 的更新清单；KimiCU 自己也读这一份。 */
export const MACOS_UPDATE_MANIFEST = 'https://cdn.kimi.com/kimi-computer-use/latest/version.json';

/** Windows 的更新清单；与 macOS 是两份，版本号互不可比。 */
export const WINDOWS_UPDATE_MANIFEST = 'https://cdn.kimi.com/kimi-computer-use-windows/latest/version.json';

/** 一次更新检查的结果。 */
export interface UpdateCheck {
  /** 本机已安装的版本；读不出来是 null。 */
  current: string | null;
  /** 清单里的最新版本；读不到清单是 null。 */
  latest: string | null;
  /** 是否有可执行的更新。 */
  hasUpdate: boolean;
  /** 读清单失败的原因；成功是 null。 */
  error: string | null;
  /** 检查完成的时间戳（毫秒）。 */
  checkedAt: number;
}

/** 更新过程中的阶段，卡片据此显示一行文字。 */
export type UpdateStage = 'checking' | 'downloading' | 'verifying' | 'installing' | 'restarting';

/** 更新失败的分类，卡片据此挑一句人话。 */
export type UpdateFailureKind = 'network' | 'verify' | 'permission' | 'busy' | 'timeout' | 'unknown';

/** 更新过程中吐给卡片的事件，一行一个 JSON。 */
export type UpdateEvent =
  | { type: 'stage'; stage: UpdateStage }
  | {
    type: 'done';
    upToDate: boolean;
    version: string | null;
    /** 重连结果：done 成功、failed 试过但失败、skipped 没试（版本没变或没有管理器）。 */
    reconnect: 'done' | 'failed' | 'skipped';
    raw: string;
  }
  | { type: 'error'; kind: UpdateFailureKind; raw: string };
