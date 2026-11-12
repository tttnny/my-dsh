import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, IconInfoOutlineRegular, Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client';
// 类型只读：会话标准属性（`sessionId` / `useSession` / `useSessions`）由这个包的浏览器半边合并。
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import {
  enabledFor,
  overridesAfterWrite,
  readConfig,
  type ConfigForm,
} from './config.js';
import { NS } from './locales.js';

/**
 * 模型与推理等级菜单里的「主动汇报」开关：按会话开关，默认值来自插件配置。
 *
 * 与官方智能体团队开关同一行样式：整行悬停高亮，标签旁的按钮解释这个开关做什么，
 * 开关本身在行尾。子代理会话不显示——催办本来就不进子代理，这个开关在那里没有作用。
 *
 * 点开关先按新值重画；写入交给设置表单排队，宿主拒收就把行退回宿主上的值。
 * 写入在途时开关禁用，避免连点叠出两条互相覆盖的写入。
 */

/** 座位给的取词与菜单状态，加上本插件在 `inject` 里投出去的那张表单。 */
type EnabledToggleProps = PropsRuntime<'conversation.input.model.options'>
  & PropsLocale<typeof NS>
  & { form: ConfigForm };

/**
 * 渲染菜单里的开关；子代理会话里什么都不画。
 * @param props - 菜单座位给的属性、取词函数与配置表单。
 * @returns 开关那一行，或子代理会话里的 `null`。
 */
export function EnabledToggle(props: EnabledToggleProps): ReactElement | null {
  const { sessionId, useSession, useSessions } = props;
  const addressedChild = useSession(snapshot => snapshot.subagent !== null);
  const listedChild = useSessions(state => state.byId[sessionId]?.origin === 'subagent');
  if (addressedChild || listedChild) return null;
  return <RootEnabledToggle {...props} />;
}

/**
 * 根会话里的开关本体：读当前会话的开关值，改的时候写回配置。
 * @param props - 菜单座位给的属性、取词函数与配置表单。
 * @returns 开关那一行；宿主没服务这份配置时什么都不画。
 */
function RootEnabledToggle(
  { sessionId, form, locked, reportFailure, t }: EnabledToggleProps,
): ReactElement | null {
  const [config, setConfig] = useState(() => readConfig(form));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const sync = (): void => { setConfig(readConfig(form)); };
    sync();
    return form.subscribe(sync);
  }, [form]);

  if (config === undefined) return null;

  const enabled = enabledFor(config.sessionOverrides, config.defaultEnabled, sessionId);

  /**
   * 改这个会话的开关。
   * @param next - 用户点出来的新值。
   */
  const select = (next: boolean): void => {
    const overrides = overridesAfterWrite(config.sessionOverrides, sessionId, next, config.defaultEnabled);
    // 切回默认值时字典里那条会被删掉；已经是默认值就没有要写的。
    if (overrides === config.sessionOverrides) return;
    setConfig({ ...config, sessionOverrides: overrides });
    setPending(true);
    void form.set('sessionOverrides', overrides).then(
      (accepted) => {
        // 宿主没收下：把行退回宿主上的值，别让页面显示一个没存住的开关。
        if (!accepted) {
          setConfig(readConfig(form));
          reportFailure(t('toggle.failed'));
        }
      },
      () => {
        setConfig(readConfig(form));
        reportFailure(t('toggle.failed'));
      },
    ).finally(() => { setPending(false); });
  };

  return (
    <div className="dsh-notify-toggle-row">
      <span className="dsh-notify-toggle-label">
        <span>{t('toggle.label')}</span>
        <Tooltip label={t('toggle.description')} side="top" delayMs={300} maxWidth={300} portal openOnClick>
          <Button variant="ghost" size="sm" className="dsh-notify-toggle-info" aria-label={t('toggle.infoLabel')}>
            <IconInfoOutlineRegular size={11} aria-hidden="true" />
          </Button>
        </Tooltip>
      </span>
      <Switch
        className="dsh-notify-toggle-switch"
        checked={enabled}
        disabled={locked || pending}
        label={t('toggle.label')}
        onChange={select}
      />
    </div>
  );
}
