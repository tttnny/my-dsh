import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  IconChevronDownOutlineRegular,
  MarkdownDelegateProvider,
  MarkdownText,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { OpenFileOptions } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NOTIFY_TOOL_NAME } from '../shared/config.js';
import type { SyncedConfig } from '@deepseek-ai/dsh-client-config/types';
import type { PluginConfig } from '../config.js';
import { DEFAULT_CLIENT_CONFIG } from './config.js';
import { NS } from './locales.js';
import { formatClock, titleOf, type NotifyCardData } from './row-model.js';

/**
 * 进度卡的展示件：一行标题（圆点 + 标题 + 时间；悬停时圆点变成折叠键），下面是模型写的正文。
 *
 * 正文默认收起，点圆点展开；「带不带折叠键」由插件页的配置项决定（`collapsible`），
 * 「正文默认展开」决定初始状态（`bodyExpandedByDefault`），「只报摘要」时没有正文
 * （`summaryOnly`），标题行右侧的时间由 `showTime` 决定画不画。工具行与对话节点两种
 * 座位都把数据整理成 {@link NotifyCardData} 再交给这里，卡片的形态只有一份。
 */

export type CardHooks = Pick<SyncedConfig<PluginConfig>,
  'collapsible' | 'summaryOnly' | 'summaryRender' | 'bodyExpandedByDefault' | 'showTime'>;
export type CardConfigProps = InjectFace<{ hooks: CardHooks }>;

type NotifyCardProps = {
  readonly config: CardConfigProps;
  readonly data: NotifyCardData;
  readonly openFile: (path: string, options?: OpenFileOptions) => void;
  readonly t: PropsLocale<typeof NS>['t'];
  /** 座位：对话节点（间距交给流间距），或工具行（卡片自带内边距）。 */
  readonly seat: 'node' | 'row';
};

/** 交给 `MarkdownText` 的文案：宿主那个渲染器不自带语言。 */
function markdownLabels(t: NotifyCardProps['t']): MarkdownLabels {
  return {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  };
}

/**
 * 渲染一张进度卡。
 * @param props - 卡片数据、同步配置、文件打开动作与取词函数。
 * @returns 进度卡。
 */
export function NotifyCard({
  data, openFile, t, seat,
  config: { useCollapsible, useSummaryOnly, useSummaryRender, useBodyExpandedByDefault, useShowTime },
}: NotifyCardProps): ReactElement {
  const collapsibleByConfig = useCollapsible(value => value ?? DEFAULT_CLIENT_CONFIG.collapsible);
  const summaryOnly = useSummaryOnly(value => value ?? DEFAULT_CLIENT_CONFIG.summaryOnly);
  const summaryRender = useSummaryRender(value => value ?? DEFAULT_CLIENT_CONFIG.summaryRender);
  const bodyExpandedByDefault = useBodyExpandedByDefault(value => value ?? DEFAULT_CLIENT_CONFIG.bodyExpandedByDefault);
  const showTime = useShowTime(value => value ?? DEFAULT_CLIENT_CONFIG.showTime);
  // 配置可能晚于卡片到达：没手动切过之前跟随配置的默认值，切过之后保持用户的选择。
  const [open, setOpen] = useState<boolean | null>(null);

  if (data.failure !== undefined) {
    return (
      <div className="dsh-notify-failure" data-tool={NOTIFY_TOOL_NAME} data-state="error">
        <strong>{t('row.failed')}</strong>
        {data.failure.detail.length === 0 ? null : <div>{data.failure.detail}</div>}
      </div>
    );
  }

  const title = titleOf({ title: data.title, message: data.message }, t('row.fallbackTitle'));

  // 只报摘要 + 散文呈现：不画卡片，按普通段落渲染，看起来像助手写的正文。
  if (summaryOnly && summaryRender === 'prose') {
    return (
      <div className="dsh-notify-prose" data-tool={NOTIFY_TOOL_NAME} data-state={data.settled ? 'settled' : 'running'}>
        <MarkdownDelegateProvider openFile={openFile}>
          <MarkdownText text={title} labels={markdownLabels(t)} />
        </MarkdownDelegateProvider>
      </div>
    );
  }

  const hasBody = !summaryOnly && data.message.trim().length > 0;
  const collapsible = collapsibleByConfig && hasBody;
  const expanded = collapsible ? open ?? bodyExpandedByDefault : true;
  const time = showTime ? formatClock(data.time) : null;
  const titleNode = data.settled ? title : <TextShimmer active>{title}</TextShimmer>;

  return (
    <div
      className="dsh-notify-card"
      data-seat={seat}
      data-tool={NOTIFY_TOOL_NAME}
      data-state={data.settled ? 'settled' : 'running'}
      data-collapsible={collapsible || undefined}
    >
      <div className="dsh-notify-head">
        {collapsible ? (
          <button
            type="button"
            className="dsh-notify-toggle"
            aria-expanded={expanded}
            onClick={() => { setOpen(!expanded); }}
          >
            <span className="dsh-notify-dot" data-open={expanded || undefined} aria-hidden="true">
              <span className="dsh-notify-dot-idle" />
              <IconChevronDownOutlineRegular className="dsh-notify-chevron" size={14} />
            </span>
            <span className="dsh-notify-title">{titleNode}</span>
          </button>
        ) : (
          <>
            <span className="dsh-notify-dot" aria-hidden="true">
              <span className="dsh-notify-dot-idle" />
            </span>
            <span className="dsh-notify-title">{titleNode}</span>
          </>
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
