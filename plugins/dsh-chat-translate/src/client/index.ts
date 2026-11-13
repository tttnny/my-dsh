import { setupSettingsUi } from './settings/ui.tsx';
import { settingsStore } from './settings/store.ts';
import { setupComposerToggle } from './composer/dock-toggle.tsx';
import { AssistantStepView } from './chat/assistant-step.tsx';
import { chatPresentation } from './chat/presentation.ts';
import { chatTranslate } from './chat/translate-store.ts';
import { ensureAssistantStyles } from './chat/styles.ts';
import { bindRowCopy } from './locales.ts';
// Type-only, erased from the bundle: the renderer augments Context with the
// `slots` service the keyed seats consume, and the settings contract declares
// the `configForms` service the card's host form is reached through.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

/** Client plugin name, shared with the browser bundle id. */
export const name = 'dsh-chat-translate';

/**
 * Declared services: slots for the keyed assistant-row takeover, this plugin's
 * configuration page on the **Plugins** page, and the composer dock pill;
 * configForms for this plugin's own configuration form plus the host `ui-chat`
 * entry whose `transcriptView` field drives the reasoning-row presentation
 * policy; the remote + remote.credentials pair for the credentials Remote
 * namespace; and locale for the card's own dictionary. The runtime withholds
 * any service not declared here; `locale` is declared rather than sampled
 * because `ctx.get('locale')` at apply time can beat the locale plugin's
 * `provide`, which silently left the card's dictionary unregistered.
 *
 * `chatFileMentions` is deliberately absent from this list: the service is
 * optional (the Host's `ui-deliverables` provides it), and a name listed here
 * keeps the whole entry pending on a page without that package. The row
 * renderer declares it through `ctx.inject` in `apply` instead, whose lifecycle
 * runs only while the service is provided.
 */
export const inject = ['slots', 'configForms', 'remote', 'remote.credentials', 'locale'];

/** Structural mirror of the Host's optional `ChatFileMentions` service. */
interface FileMentionsService {
  forClosing(owner: unknown, sessionId: string): unknown;
}

interface ClientContext {
  effect(factory: () => void | (() => void), label?: string): void;
  inject(deps: readonly string[], callback: (scope: ClientContext) => void): unknown;
  slots?: {
    inject(name: string, register: () => unknown): () => void;
    register(options: Record<string, unknown>, component: unknown): () => void;
  };
  configForms?: { get(namespace: string): any };
  locale?: any;
  remote?: { credentials?: any };
  chatFileMentions?: FileMentionsService;
}

/**
 * Mount the assistant-row takeover (keyed `conversation.chat.node` /
 * `assistant-step`), this plugin's configuration page on the **Plugins** page,
 * and the translation toggle in the composer dock.
 * @param ctx - DSH browser client context.
 */
export function apply(ctx: ClientContext): void {
  ensureAssistantStyles();

  // 0. 文件提及解析（`chatFileMentions`）由宿主 ui-deliverables 提供，是可选的：
  //    它缺席时提及链接停用，助手行接管与其余功能照常。这份依赖经 ctx.inject 声明，
  //    缺席交给宿主生命周期——服务到位时回调运行、服务消失时回调被拆掉。助手行的
  //    注册项从回调维护的这一份读：服务缺席时它返回 undefined，正文里的提及链接
  //    随之停用。
  let fileMentions: FileMentionsService | undefined;
  ctx.inject(['chatFileMentions'], (scope) => {
    const service = scope.chatFileMentions;
    fileMentions = service;
    scope.effect(
      () => () => {
        if (fileMentions === service) fileMentions = undefined;
      },
      'dsh-chat-translate: file mentions'
    );
  });

  // 1. 接管助手行：keyed slot 的替换语义，priority -1 排在宿主默认注册（0）之前
  //    渲染；本渲染器抛错时按框架退位规则退出 cell，宿主原渲染器回位。
  ctx.effect(() => {
    const slots = ctx.slots;
    if (!slots || typeof slots.inject !== 'function') return () => {};
    return slots.inject('conversation.chat.node', () =>
      slots.register(
        {
          name: 'conversation.chat.node',
          key: 'assistant-step',
          // 行内的折叠、停止、未知块等 chrome 文案复用宿主 `chat` 词典，
          // 两侧渲染逐字一致；t 由座次按该命名空间合成。
          locale: 'chat',
          priority: -1,
          // 思考行的 settledReasoningPreview 与 foldedReplies 来自活的工作细节模式；
          // fileMentions 由这条注册项自己提供（0.2.2 起不再走 owner props），
          // 服务缺席时返回 undefined，正文里的提及链接随之停用。
          inject: (sessionId: string) => ({
            hooks: { presentation: chatPresentation },
            fileMentions: (owner: unknown) => fileMentions?.forClosing(owner, sessionId),
          }),
        },
        AssistantStepView
      )
    );
  }, 'dsh-chat-translate: assistant step takeover');

  // 2. 「工作细节」模式跟随宿主：读 ui-chat 条目的 transcriptView。
  ctx.effect(() => {
    let form: unknown = null;
    try {
      form = ctx.configForms?.get('ui-chat') ?? null;
    } catch {
      form = null;
    }
    chatPresentation.attach(form as Parameters<typeof chatPresentation.attach>[0]);
    return () => chatPresentation.detach();
  }, 'dsh-chat-translate: chat presentation source');

  // 3. This plugin's configuration page on the host's **Plugins** page.
  ctx.effect(() => setupSettingsUi(ctx), 'dsh-chat-translate: plugins page config');

  // 4. 「译」开关：输入框下方那一行，与设置页总开关同一个 enabled
  ctx.effect(() => setupComposerToggle(ctx), 'dsh-chat-translate: composer dock toggle');

  // 5. 换了提示词就丢掉池里旧措辞的译文：不丢的话，读者改了提示词却看不到任何
  //    变化——已经翻过的段落照样取旧译文，一个请求都不发。宿主半边的磁盘池按世代
  //    作废，这是浏览器半边对应的那一半。
  let lastPrompt = settingsStore.getState().committed.prompt;
  ctx.effect(
    () =>
      settingsStore.subscribe(() => {
        const next = settingsStore.getState().committed.prompt;
        if (next === lastPrompt) return;
        lastPrompt = next;
        chatTranslate.dropTranslations();
      }),
    'dsh-chat-translate: relay pool follows the prompt'
  );

  // 行渲染器的私有文案（失败块的 ↻ 标签与败因泡泡）绑上本命名空间的活翻译器。
  // 放在最后：此时 setupSettingsUi 的 locale.register(NS) 已落地，bind 立刻可解析键。
  bindRowCopy(ctx.locale);
}

export { AssistantStepView } from './chat/assistant-step.tsx';
export { planAssistantRow } from './chat/row-plan.ts';
export { chatTranslate, createTranslateStore } from './chat/translate-store.ts';
export { chatPresentation, createChatPresentation, policyForMode } from './chat/presentation.ts';
export { ensureAssistantStyles } from './chat/styles.ts';
export { setupSettingsUi } from './settings/ui.tsx';
export { setupComposerToggle, ComposerTranslateToggle } from './composer/dock-toggle.tsx';
export { settingsStore } from './settings/store.ts';
