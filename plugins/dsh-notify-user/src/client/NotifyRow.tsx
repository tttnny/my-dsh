import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  IconChevronDownOutlineRegular,
  MarkdownDelegateProvider,
  MarkdownText,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  DEFAULT_COLLAPSIBLE,
  DEFAULT_NUDGE_AFTER,
  readConfig,
  type ClientConfig,
  type ConfigForm,
} from './config.js';
import { NS } from './locales.js';
import { formatClock, readUpdate, titleOf } from './row-model.js';

/**
 * `notify_user` 的进度卡：一行标题（圆点 + 标题 + 折叠键 + 时间），下面是模型写的正文。
 *
 * 正文默认展开；「带不带折叠键」由插件页的配置项决定（`collapsible`）。直播与重放都只读
 * 日志里的那一份（`meta` 或参数），不碰实时状态；本轮进行中工具行内联可见，本轮结束后
 * 随「工作过程」一起折叠。
 */

/** 座位给的取词、工具行标准属性，加上本插件注入的配置表单。 */
type NotifyRowProps = ToolCallViewProps & PropsLocale<typeof NS> & { form: ConfigForm };

/** 配置表单还没就绪时的兜底。 */
const FALLBACK_CONFIG: ClientConfig = { nudgeAfter: DEFAULT_NUDGE_AFTER, collapsible: DEFAULT_COLLAPSIBLE };

/** 订阅配置表单，配置一变卡片就跟着变。 */
function useClientConfig(form: ConfigForm): ClientConfig {
  const [config, setConfig] = useState<ClientConfig>(() => readConfig(form) ?? FALLBACK_CONFIG);
  useEffect(() => {
    const sync = (): void => { setConfig(readConfig(form) ?? FALLBACK_CONFIG); };
    sync();
    return form.subscribe(sync);
  }, [form]);
  return config;
}

/** 交给 `MarkdownText` 的文案：宿主那个渲染器不自带语言。 */
function markdownLabels(t: NotifyRowProps['t']): MarkdownLabels {
  return {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  };
}

/**
 * 渲染一条 `notify_user` 调用。
 * @param props - 工具行标准属性、本插件的取词函数与配置表单。
 * @returns 进度卡。
 */
export function NotifyRow(props: NotifyRowProps): ReactElement {
  const { t, form } = props;
  const config = useClientConfig(form);
  const [open, setOpen] = useState(true);

  const preparing = props.phase === 'preparing';
  const update = preparing ? { message: '' } : readUpdate(props.block);
  const title = preparing ? t('row.preparing') : titleOf(update, t('row.fallbackTitle'));
  const hasBody = update.message.trim().length > 0;
  const collapsible = config.collapsible && hasBody;
  const expanded = collapsible ? open : true;
  const running = props.phase === 'start';
  const time = formatClock(props.block.time);

  return (
    <div
      className="dsh-notify-card"
      data-tool="notify_user"
      data-state={preparing ? 'preparing' : running ? 'running' : 'settled'}
      data-collapsible={collapsible || undefined}
    >
      <div className="dsh-notify-head">
        <span className="dsh-notify-dot" aria-hidden="true" />
        {collapsible ? (
          <button
            type="button"
            className="dsh-notify-toggle"
            aria-expanded={expanded}
            onClick={() => { setOpen((value) => !value); }}
          >
            <span className="dsh-notify-title">
              {running ? <TextShimmer active>{title}</TextShimmer> : title}
            </span>
            <IconChevronDownOutlineRegular
              className="dsh-notify-chevron"
              data-open={expanded || undefined}
              size={14}
            />
          </button>
        ) : (
          <span className="dsh-notify-title">
            {running ? <TextShimmer active>{title}</TextShimmer> : title}
          </span>
        )}
        {time === null ? null : <span className="dsh-notify-time">{time}</span>}
      </div>
      {expanded && hasBody ? (
        <div className="dsh-notify-body">
          <MarkdownDelegateProvider openFile={props.openFile}>
            <MarkdownText text={update.message} labels={markdownLabels(t)} variant="compact" />
          </MarkdownDelegateProvider>
        </div>
      ) : null}
    </div>
  );
}
