import type { ReactElement } from 'react';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConfigForm } from './config.js';
import { NS } from './locales.js';
import { NotifyCard } from './NotifyCard.js';
import { readUpdate, type NotifyCardData } from './row-model.js';

/**
 * `notify_user` 工具行的兜底渲染：正常路径下这次调用由对话节点定义接管，工具行不会出现。
 * 通用工具定义拿得到工具名时（例如节点定义没注册上），它补建的工具行由这里画成同一张进度卡；
 * 历史窗口从调用中间开始加载时通用行没有工具名，画成通用行。
 */

/** 座位给的取词、工具行标准属性，加上本插件注入的配置表单。 */
type NotifyRowProps = ToolCallViewProps & PropsLocale<typeof NS> & { form: ConfigForm };

/**
 * 渲染一条 `notify_user` 工具行。
 * @param props - 工具行标准属性、本插件的取词函数与配置表单。
 * @returns 进度卡。
 */
export function NotifyRow(props: NotifyRowProps): ReactElement {
  const { t, form } = props;
  const preparing = props.phase === 'preparing';
  const update = preparing ? { message: '' } : readUpdate(props.block);
  const data: NotifyCardData = {
    ...preparing ? { title: t('row.preparing') } : update.title === undefined ? {} : { title: update.title },
    message: update.message,
    time: props.block.time,
    settled: props.phase === 'result',
  };
  return <NotifyCard data={data} form={form} openFile={props.openFile} t={t} />;
}
