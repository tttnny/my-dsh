import { setupSettingsUi } from './settings/ui.tsx';
import { setupComposerToggle } from './composer/dock-toggle.tsx';
import { AssistantStepView } from './chat/assistant-step.tsx';
import { chatPresentation } from './chat/presentation.ts';
import { ensureAssistantStyles } from './chat/styles.ts';
import { bindRowCopy } from './locales.ts';
// Type-only, erased from the bundle: the renderer augments Context with the
// `slots` service the shared 「阅读体验」 page shell consumes, and the settings
// contract declares the `settings.section` slot its page component renders into.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

/** Client plugin name, shared with the browser bundle id. */
export const name = 'dsh-chat-translate';

/**
 * Declared services: slots for the keyed assistant-row takeover, the shared
 * 「阅读体验」 settings page (page claim plus the card registration) and the
 * composer dock pill; configForms for this plugin's own configuration form
 * plus the host `ui-chat` entry whose `transcriptView` field drives the
 * reasoning-row presentation policy; the remote + remote.credentials pair for
 * the credentials Remote namespace; and locale for the card's own dictionary.
 * The runtime withholds any service not declared here; `locale` is declared
 * rather than sampled because `ctx.get('locale')` at apply time can beat the
 * locale plugin's `provide`, which silently left the card's dictionary
 * unregistered.
 */
export const inject = ['slots', 'configForms', 'remote', 'remote.credentials', 'locale'];

interface ClientContext {
  effect(factory: () => void | (() => void), label?: string): void;
  get?(serviceName: string): any;
  slots?: {
    inject(name: string, register: () => unknown): () => void;
    register(options: Record<string, unknown>, component: unknown): () => void;
  };
  configForms?: { get(namespace: string): any };
  locale?: any;
  remote?: { credentials?: any };
}

/**
 * Mount the assistant-row takeover (keyed `conversation.chat.node` /
 * `assistant-step`), the settings UI card inside the shared reading-settings
 * page, and the translation toggle in the composer dock.
 * @param ctx - DSH browser client context.
 */
export function apply(ctx: ClientContext): void {
  ensureAssistantStyles();
  // 行渲染器的私有文案（红线重试提示）绑上本命名空间的活翻译器。
  bindRowCopy(ctx.locale);

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
          // 思考行的 settledReasoningPreview 来自活的工作细节模式。
          inject: () => ({ hooks: { presentation: chatPresentation } }),
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

  // 3. Join the shared 「阅读体验」 settings page (claim it, or register a card into it)
  ctx.effect(() => setupSettingsUi(ctx), 'dsh-chat-translate: settings section');

  // 4. 「译」开关：输入框下方那一行，与设置页总开关同一个 enabled
  ctx.effect(() => setupComposerToggle(ctx), 'dsh-chat-translate: composer dock toggle');
}

export { AssistantStepView } from './chat/assistant-step.tsx';
export { planAssistantRow } from './chat/row-plan.ts';
export { chatTranslate, createTranslateStore } from './chat/translate-store.ts';
export { chatPresentation, createChatPresentation, POLICY_BY_MODE } from './chat/presentation.ts';
export { ensureAssistantStyles } from './chat/styles.ts';
export { setupSettingsUi } from './settings/ui.tsx';
export { setupComposerToggle, ComposerTranslateToggle } from './composer/dock-toggle.tsx';
export { settingsStore } from './settings/store.ts';
