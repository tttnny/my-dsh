import type { ReactElement } from 'react';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.js';
import { NotifyCard, type CardConfigProps } from './NotifyCard.js';
import { failureOf, readUpdate, type NotifyCardData } from './row-model.js';

/** 跟随工具行模式下，使用宿主定位这次调用，再渲染汇报内容或失败原因。 */

/** 座位给的取词、工具行标准属性，加上本插件注入的同步配置。 */
type NotifyRowProps = ToolCallViewProps & PropsLocale<typeof NS> & CardConfigProps;

/**
 * 渲染一条 `notify_user` 工具行。
 * @param props - 工具行标准属性、本插件的取词函数与同步配置。
 * @returns 进度卡。
 */
export function NotifyRow(props: NotifyRowProps): ReactElement {
  const { t } = props;
  const failure = props.phase === 'result' && props.block.isError
    ? failureOf(props.block.content, props.block.error)
    : undefined;
  const preparing = props.phase === 'preparing';
  const update = preparing || failure !== undefined ? { message: '' } : readUpdate(props.block);
  const data: NotifyCardData = {
    ...preparing ? { title: t('row.preparing') } : update.title === undefined ? {} : { title: update.title },
    message: update.message,
    time: props.block.time,
    settled: props.phase === 'result',
    ...failure === undefined ? {} : { failure },
  };
  return <NotifyCard data={data} config={props} openFile={props.openFile} t={t} seat="row" />;
}
