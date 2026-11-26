import { useEffect, useState } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import { DEFAULT_ENABLED, enabledFor } from '../enablement.ts';
import { NS } from './locales.ts';

export const MODEL_OPTIONS_SLOT = 'conversation.input.model.options';

type ToggleProps = PropsRuntime<typeof MODEL_OPTIONS_SLOT>
  & PropsLocale<typeof NS>
  & { form: ConfigForm<Record<string, unknown>> };

export function SessionToggle(props: ToggleProps) {
  const { sessionId, useSession, useSessions } = props;
  const addressedChild = useSession(snapshot => snapshot.subagent !== null);
  const listedChild = useSessions(state => state.byId[sessionId]?.origin === 'subagent');
  if (addressedChild || listedChild) return null;
  return <RootSessionToggle key={sessionId} {...props} />;
}

function RootSessionToggle({ sessionId, form, locked, reportFailure, t }: ToggleProps) {
  const [snapshot, setSnapshot] = useState(() => form.getSnapshot());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const sync = () => setSnapshot(form.getSnapshot());
    sync();
    return form.subscribe(sync);
  }, [form]);

  if (snapshot.status !== 'ready' || snapshot.value === undefined) return null;
  const fallback = typeof snapshot.value.enabled === 'boolean' ? snapshot.value.enabled : DEFAULT_ENABLED;
  const enabled = enabledFor(snapshot.value.sessionOverrides, fallback, sessionId);

  async function select(next: boolean) {
    setPending(true);
    try {
      const path = ['sessionOverrides', sessionId];
      // Clearing a user value exposes the composition layer's value for this session.
      const base = snapshot.base as { sessionOverrides?: unknown } | null | undefined;
      const afterUnset = enabledFor(base?.sessionOverrides, fallback, sessionId);
      // The form queue supplies the revision when this path edit is sent.
      const accepted = await form.mutate([next === fallback && next === afterUnset
        ? { op: 'unset', path }
        : { op: 'set', path, value: next }]);
      if (!accepted) reportFailure(t('sessionToggle.failed'));
    } catch {
      reportFailure(t('sessionToggle.failed'));
    } finally {
      setSnapshot(form.getSnapshot());
      setPending(false);
    }
  }

  return (
    <div className="dsh-judge-session-toggle">
      <span>{t('sessionToggle.label')}</span>
      <Switch
        className="dsh-judge-session-switch"
        checked={enabled}
        disabled={locked || pending || !snapshot.writable}
        label={t('sessionToggle.label')}
        onChange={select}
      />
    </div>
  );
}
