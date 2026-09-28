import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { Pill, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { settingsStore, type ClientSettingsState } from '../settings/store.ts';
import { NS } from '../locales.ts';

/**
 * `t` 由注册项的 `locale: NS` 注入，类型走共享的 `PropsLocale`。owner props
 * （`PropsRuntime<'conversation.composer.dock'>`）的类型随
 * `@deepseek-ai/dsh-client-ui-conversation` 声明，本包不依赖它（与 dsh-a6api
 * 同法），组件也不读那些 prop。
 */
export type DockToggleProps = PropsLocale<typeof NS>;

/**
 * 对话输入框下方那一行的翻译开关：一个胶囊按钮，点亮表示正文翻译开着。
 * 它与设置页「总开关」是同一个 `enabled` 字段——点击写 profile 配置，两处
 * 状态由同一个 store 同步；关闭与重开的行为（还原英文、重扫补翻）也走
 * 同一条链路。Key 没配齐时照常可切换：缺配置只是不产生翻译，界面无特殊态。
 */
export function ComposerTranslateToggle(props: DockToggleProps): ReactElement {
  const { t } = props;
  const [state, setState] = useState<ClientSettingsState>(() => settingsStore.getState());

  useEffect(() => settingsStore.subscribe(() => setState(settingsStore.getState())), []);

  return (
    <Tooltip label={() => (state.enabled ? t('dockOn') : t('dockOff'))} side="top" align="end" portal>
      <Pill
        active={state.enabled}
        onClick={() => void settingsStore.update({ enabled: !settingsStore.getState().enabled })}
      >
        {t('dockLabel')}
      </Pill>
    </Tooltip>
  );
}

/**
 * 把开关注册进 `conversation.composer.dock`——ui-conversation 声明的
 * 「输入框卡片下方那一行」。该 slot 只在会话形态渲染，新建会话的 Hero 形态
 * 没有这一行，按钮随之不出现。`slots.inject` 等声明落地再注册，声明塌缩时
 * 注册一起退场。
 * @param ctx - DSH browser client context（`slots` 已在客户端半边声明注入）。
 * @returns 撤销本次贡献的 disposer。
 */
export function setupComposerToggle(ctx: any): () => void {
  if (typeof window === 'undefined') return () => {};
  const slots = ctx?.slots;
  if (!slots || typeof slots.inject !== 'function') return () => {};
  return slots.inject('conversation.composer.dock', () =>
    slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'dsh-chat-translate-toggle',
        // -2 排在 dsh-a6api 胶囊（-1）的左侧，整行最左；官方统计胶囊是 0。
        order: -2,
        locale: NS,
      },
      ComposerTranslateToggle
    )
  );
}
