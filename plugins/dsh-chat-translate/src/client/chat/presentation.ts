/**
 * 助手行渲染所需的「工作细节」呈现策略。
 *
 * 宿主把这一策略派生自 `ui-chat` 配置条目的 `transcriptView` 字段；本插件接管
 * 助手行渲染后，经 `ctx.configForms.get('ui-chat')` 读同一个字段。渲染层只用到
 * 其中两个能力：落定的思考行要不要在 Think 标题旁预览首行
 * （{@link ChatPresentationPolicy.settledReasoningPreview}），以及折叠时保留哪些
 * 助手回复（{@link ChatPresentationPolicy.foldedReplies}）。只镜像本插件真正读到的
 * 这两个字段，而不是把宿主的整张策略表搬过来。快照对象按取值常驻（同一取值恒等
 * 返回同一实例），选择器订阅看到的是稳定引用。
 */

/** 折叠回复时保留哪些助手回复：全部，还是只有最后一条结论。 */
export type FoldedReplies = 'all' | 'final';

/** 与宿主 ChatPresentationPolicy 同形的结构性镜像（只保留本插件读取的两个能力）。 */
export interface ChatPresentationPolicy {
  readonly settledReasoningPreview: boolean;
  readonly foldedReplies: FoldedReplies;
}

/**
 * 与宿主一致的唯一判据：compact 不预览，其余一律预览。两代 legacy 存储值
 * （`normal`、`expanded`）与任何未识别的值都落在「预览」这一侧——宿主对它们
 * 的读法就是 standard/detailed，而这两者都预览。
 */
const NO_PREVIEW_MODE = 'compact';

/** 宿主在用户没有显式选择时使用的模式。 */
export const DEFAULT_MODE = 'standard';

/** 宿主在没有保存折叠回复偏好时保留全部回复。 */
export const DEFAULT_FOLDED_REPLIES: FoldedReplies = 'all';

/** 四个常驻快照：同一取值返回同一实例，订阅判等才稳定。 */
const SNAPSHOTS: Readonly<Record<`${'preview' | 'plain'}:${FoldedReplies}`, ChatPresentationPolicy>> = {
  'preview:all': Object.freeze({ settledReasoningPreview: true, foldedReplies: 'all' }),
  'preview:final': Object.freeze({ settledReasoningPreview: true, foldedReplies: 'final' }),
  'plain:all': Object.freeze({ settledReasoningPreview: false, foldedReplies: 'all' }),
  'plain:final': Object.freeze({ settledReasoningPreview: false, foldedReplies: 'final' }),
};

/**
 * 两个存储值 → 策略快照。
 *
 * @param mode - `transcriptView` 的原样字符串。
 * @param foldedReplies - `foldedReplies` 的原样字符串；未识别按保留全部。
 * @returns 该组合的常驻快照。
 */
export function policyFor(mode: string, foldedReplies: string): ChatPresentationPolicy {
  const preview = mode !== NO_PREVIEW_MODE ? 'preview' : 'plain';
  const folded: FoldedReplies = foldedReplies === 'final' ? 'final' : 'all';
  return SNAPSHOTS[`${preview}:${folded}`];
}

/**
 * 存储值 → 策略快照（只按工作细节模式，折叠回复取宿主默认）。
 *
 * @param mode - `transcriptView` 的原样字符串。
 * @returns 该模式的常驻快照。
 */
export function policyForMode(mode: string): ChatPresentationPolicy {
  return policyFor(mode, DEFAULT_FOLDED_REPLIES);
}

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
  private policy: ChatPresentationPolicy = policyForMode(DEFAULT_MODE);
  private listeners = new Set<() => void>();
  private form: ModeFormLike | null = null;
  private unsubscribe: (() => void) | null = null;

  attach(form: ModeFormLike | null | undefined): void {
    this.detach();
    if (!form) {
      this.policy = policyForMode(DEFAULT_MODE);
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
    const rawFolded = typeof value?.foldedReplies === 'string' ? value.foldedReplies : '';
    const next = policyFor(raw, rawFolded);
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
