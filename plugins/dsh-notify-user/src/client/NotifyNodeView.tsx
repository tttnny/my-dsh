import type { ReactElement } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConfigForm } from './config.js';
import { NS } from './locales.js';
import { NotifyCard } from './NotifyCard.js';

/**
 * 进度卡的对话节点渲染器：座位按节点 kind 分发，数据来自定义投影出的节点。
 * 节点站在步骤组外，卡片不会随组折叠。
 */

/** 座位给的节点属性与取词函数，加上本插件注入的配置表单。 */
type NotifyNodeViewProps = PropsRuntime<'conversation.chat.node', 'notify-user'>
  & PropsLocale<typeof NS>
  & { form: ConfigForm };

/**
 * 渲染一个 `notify-user` 节点。
 * @param props - 节点、座位动作、取词函数与配置表单。
 * @returns 进度卡。
 */
export function NotifyNodeView({ node, openFile, t, form }: NotifyNodeViewProps): ReactElement {
  return <NotifyCard data={node.data} form={form} openFile={openFile} t={t} />;
}
