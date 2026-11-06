import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  IconChevronDownOutlineRegular,
  MarkdownDelegateProvider,
  MarkdownText,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { OpenFileOptions } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NOTIFY_TOOL_NAME } from '../shared/config.js';
import {
  DEFAULT_COLLAPSIBLE,
  DEFAULT_NUDGE_AFTER,
  readConfig,
  type ClientConfig,
  type ConfigForm,
} from './config.js';
import { NS } from './locales.js';
import { formatClock, titleOf, type NotifyCardData } from './row-model.js';

/**
 * 进度卡的展示件：一行标题（圆点 + 标题 + 折叠键 + 时间），下面是模型写的正文。
 *
 * 正文默认展开；「带不带折叠键」由插件页的配置项决定（`collapsible`）。工具行与
 * 对话节点两种座位都把数据整理成 {@link NotifyCardData} 再交给这里，卡片的形态只有一份。
 */

type NotifyCardProps = {
  readonly data: NotifyCardData;
  readonly form: ConfigForm;
  readonly openFile: (path: string, options?: OpenFileOptions) => void;
  readonly t: PropsLocale<typeof NS>['t'];
};

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
function markdownLabels(t: NotifyCardProps['t']): MarkdownLabels {
  return {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  };
}

/**
 * 渲染一张进度卡。
 * @param props - 卡片数据、配置表单、文件打开动作与取词函数。
 * @returns 进度卡。
 */
export function NotifyCard({ data, form, openFile, t }: NotifyCardProps): ReactElement {
  const config = useClientConfig(form);
  const [open, setOpen] = useState(true);

  const title = titleOf({ title: data.title, message: data.message }, t('row.fallbackTitle'));
  const hasBody = data.message.trim().length > 0;
  const collapsible = config.collapsible && hasBody;
  const expanded = collapsible ? open : true;
  const time = formatClock(data.time);
  const titleNode = data.settled ? title : <TextShimmer active>{title}</TextShimmer>;

  return (
    <div
      className="dsh-notify-card"
      data-tool={NOTIFY_TOOL_NAME}
      data-state={data.settled ? 'settled' : 'running'}
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
            <span className="dsh-notify-title">{titleNode}</span>
            <IconChevronDownOutlineRegular
              className="dsh-notify-chevron"
              data-open={expanded || undefined}
              size={14}
            />
          </button>
        ) : (
          <span className="dsh-notify-title">{titleNode}</span>
        )}
        {time === null ? null : <span className="dsh-notify-time">{time}</span>}
      </div>
      {expanded && hasBody ? (
        <div className="dsh-notify-body">
          <MarkdownDelegateProvider openFile={openFile}>
            <MarkdownText text={data.message} labels={markdownLabels(t)} variant="compact" />
          </MarkdownDelegateProvider>
        </div>
      ) : null}
    </div>
  );
}
