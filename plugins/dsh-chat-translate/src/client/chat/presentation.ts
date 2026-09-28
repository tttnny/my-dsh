/**
 * 助手行渲染所需的「工作细节」呈现策略。
 *
 * 宿主把这一策略派生自 `ui-chat` 配置条目的 `transcriptView` 字段；本插件接管
 * 助手行渲染后，经 `ctx.configForms.get('ui-chat')` 读同一个字段，映射到与宿主
 * 同形、同值的策略表。策略对象按模式常驻（同一模式恒等返回同一实例），
 * 选择器订阅看到的是稳定引用。
 */

/** 与宿主 ChatPresentationPolicy 同形的结构性镜像。 */
export interface ChatPresentationPolicy {
  readonly mode: string;
  readonly foldCompletedTurns: boolean;
  readonly stepGrouping: 'collapsed' | 'history' | 'none';
  readonly liveProcessDetail: boolean;
  readonly settledReasoningPreview: boolean;
}

function policy(
  mode: string,
  foldCompletedTurns: boolean,
  stepGrouping: ChatPresentationPolicy['stepGrouping'],
  liveProcessDetail: boolean,
  settledReasoningPreview: boolean
): ChatPresentationPolicy {
  return Object.freeze({ mode, foldCompletedTurns, stepGrouping, liveProcessDetail, settledReasoningPreview });
}

/**
 * 模式 → 策略常量表，逐行对齐宿主 ui-chat 的实现（含两代 legacy 存储值：
 * `normal` 按 standard 读、`expanded` 按 detailed 读，从不写回）。
 * 渲染器只选择单个字段，不按 mode 分支。
 */
export const POLICY_BY_MODE: Readonly<Record<string, ChatPresentationPolicy>> = Object.freeze({
  compact: policy('compact', true, 'collapsed', false, false),
  standard: policy('standard', true, 'collapsed', true, true),
  detailed: policy('detailed', true, 'history', true, true),
  verbose: policy('verbose', false, 'none', false, true),
  normal: policy('standard', true, 'collapsed', true, true),
  expanded: policy('detailed', true, 'history', true, true),
});

/** 宿主在用户没有显式选择时使用的模式。 */
export const DEFAULT_MODE = 'standard';

/** 本模块只用到配置面的这一小片形状（结构性镜像，值边不跨包）。 */
interface ModeFormLike {
  getSnapshot(): { status: string; value?: Record<string, unknown> };
  subscribe(listener: () => void): () => void;
}

/**
 * 跟随 `ui-chat` 配置的活策略源。attach 之后：读一次、订一次；配置面缺席
 * （宿主半边未服务该条目、内存模式）时停在 standard，不发订阅。
 */
export class ChatPresentation {
  private policy: ChatPresentationPolicy = POLICY_BY_MODE[DEFAULT_MODE];
  private listeners = new Set<() => void>();
  private form: ModeFormLike | null = null;
  private unsubscribe: (() => void) | null = null;

  attach(form: ModeFormLike | null | undefined): void {
    this.detach();
    if (!form) {
      this.policy = POLICY_BY_MODE[DEFAULT_MODE];
      return;
    }
    this.form = form;
    this.read();
    this.unsubscribe = form.subscribe(() => this.read());
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.form = null;
  }

  getSnapshot = (): ChatPresentationPolicy => this.policy;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private read(): void {
    const form = this.form;
    if (!form) return;
    let value: Record<string, unknown> | undefined;
    try {
      const snap = form.getSnapshot();
      value = snap.status === 'ready' ? snap.value : undefined;
    } catch {
      value = undefined;
    }
    const raw = typeof value?.transcriptView === 'string' ? value.transcriptView : '';
    const next = POLICY_BY_MODE[raw] ?? POLICY_BY_MODE[DEFAULT_MODE];
    if (next !== this.policy) {
      this.policy = next;
      for (const listener of [...this.listeners]) {
        try {
          listener();
        } catch {
          // 订阅者异常互不影响。
        }
      }
    }
  }
}

export function createChatPresentation(): ChatPresentation {
  return new ChatPresentation();
}

/** 渲染器与配置面之间的进程内单例：在 client/index.ts 接线一次。 */
export const chatPresentation = createChatPresentation();
