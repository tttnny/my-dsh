import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  IconBranchOutlineRegular,
  IconDownloadOutlineRegular,
  IconInspectOutlineRegular,
  MarkdownText,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  answerLines,
  applyImport,
  applyRecommendedDefaults,
  formStorageKey,
  frozenAnswers,
  importBody,
  messageText,
  readCallModel,
  readStoredForm,
  roundCall,
  userReplyAfter,
  writeStoredForm,
} from '../form-model.js';

/**
 * `grilling_form` 的浏览器半边：两个注册项共用这一个模块。
 *
 *  - **轮次尾部**（`conversation.chat.turnTail`，`GrillingFormTail`）：表单住在这里。轮次尾部与
 *    正文同处一层，不被这一轮的「工作过程」折叠吞掉——工具行必然被折进过程区，所以表不再住那儿。
 *    这一条从本轮里认出那次 `grilling_form` 调用（按工具名在本轮节点里定位），本轮没有就不画。
 *  - **工具行**（`tool.call.toolview`，`GrillingFormRow`）：表搬走之后它安静下来，只在入参被拒
 *    的轮次画违规清单、在调用失败时说明失败；投出去的轮次它什么都不画，页面上不会同时出现两张表。
 *
 * 表单本身：推荐的选项在用户没动过那题时默认勾上；作答按会话 + callId 存进 localStorage；
 * 底部那个窄按钮把作答写进**原生草稿**（槽位标准属性 `inputActions.setDraft`），发送权只在原生
 * 输入框的发送键上；旁边那个「从这里分叉」按**本轮结束点**开一条新会话，新会话里表单是全新的。
 *
 * **只读即冻结**：记录里在这条调用之后出现了用户发言（kind `user`/`steering`、seq 更大），
 * 这一轮就算过去了——表单不再换成一行行答案，而是**停住**：勾选框与自填框按提交时的样子原样
 * 留着，看得到、改不了、文字还能选中复制。冻结那份按用户**实际发出去的那条消息**反解重画
 * （他在原生输入框里改过、增删过的都以那条消息为准），反解拿不到就退回本地那份。
 *
 * 槽位给轮次尾部条目的数据：本轮（`turn`，`TurnLocation`）、收尾位置（`seq`）与 `openFile`；
 * 分叉要的是**本轮结束位置** `turn.end.seq`——`seq` 是收尾助手那条，切在那儿会把这次调用切在
 * 门外，所以它只用来兜底判断，`turn.end` 拿不到就不画那个键。`sessionId`、`inputActions`、
 * `useInput`、`useConversation` 是 session 作用域的标准属性；分叉动作以注入形式进来（`forkAt`），
 * 组件自己不去取服务。
 *
 * @param {object} props - 轮次尾部的槽位数据、标准属性与注入的分叉动作。
 * @returns {import('react').ReactNode} 本轮的表单；本轮没有表就什么都不画。
 */
export function GrillingFormTail({ turn, sessionId, t, useInput, useConversation, inputActions, forkAt }) {
  const chat = useConversation((snapshot) => snapshot.views.get('chat'));
  const round = roundCall(chat, turn?.turn);
  if (round === undefined) return null;
  const model = readCallModel(round.block);
  // 只有结果落库、确认这一轮投出去了（state 'form'）才有表可画；题面读不出来（窗口截断了调用头）
  // 也一样——空表没有意义。
  if (model.state !== 'form' || model.questions.length === 0) return null;
  const reply = userReplyAfter(chat?.legacy?.nodes, round.callId);
  // 切点是**本轮结束位置**（`turn/end`，表投出去之后、用户回答之前）。拿不到结束位置就不画那个键：
  // 槽位给的 `seq` 是收尾助手那条，切在那儿会把这次调用切在门外，子会话里没有表。
  return (
    <GrillingForm
      model={model}
      toolName={round.toolName}
      callId={round.callId}
      sessionId={sessionId}
      t={t}
      useInput={useInput}
      inputActions={inputActions}
      replyText={reply === undefined ? undefined : messageText(reply)}
      forkSeq={typeof turn?.end?.seq === 'number' ? turn.end.seq : undefined}
      forkAt={forkAt}
    />
  );
}

/**
 * `grilling_form` 的工具行：表搬到轮次尾部之后，这里只剩被拒的违规清单与失败说明。
 * @param {object} props - 槽位给的行数据与取词函数。
 * @returns {import('react').ReactNode} 违规清单或失败说明；投出去的轮次什么都不画。
 */
export function GrillingFormRow({ block, toolName, t, inspect }) {
  const model = readCallModel(block);
  if (model.state !== 'rejected' && model.state !== 'error') return null;
  return (
    <div className="dsg-root" data-tool={toolName} data-state={model.state}>
      {model.state === 'rejected' ? (
        <div className="dsg-form" role="group" aria-label={t('row.violations')}>
          <p className="dsg-verdict">{model.error ?? t('row.rejected')}</p>
          <ul className="dsg-violations">
            {model.violations.map((violation, index) => (
              <li key={String(index)}>{violation}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="dsg-failure">{model.failure ?? t('row.failed')}</p>
      )}
      {inspect === undefined ? null : (
        <button type="button" className="dsg-inspectButton" onClick={inspect}>
          <IconInspectOutlineRegular />
          {t('row.inspect')}
        </button>
      )}
    </div>
  );
}

/**
 * 表单本体的两态：可填，与冻结（只读即冻结）。冻结那份按实发消息反解重画。
 * @param {object} props - 表单模型、作答来源、分叉切点与交互回调。
 * @returns {import('react').JSX.Element} 这一轮的表单。
 */
function GrillingForm({ model, toolName, callId, sessionId, t, useInput, inputActions, replyText, forkSeq, forkAt }) {
  const draft = useInput((state) => state.draft);
  const readOnly = replyText !== undefined;
  const storageKey = formStorageKey(sessionId);
  // 用户自己动过的那一份，连他「清空过这题」也在里面；他没动过的题不出现在这里。
  const [storedAnswers, setStoredAnswers] = useState(() => readStoredForm(storageOf(), storageKey, callId));
  // 冻结那一刻按实发消息重画（块为准），反解拿不到才退回本地那份；可填时推荐项默认勾上。
  const answers = readOnly
    ? frozenAnswers(model.questions, storedAnswers, replyText)
    : applyRecommendedDefaults(model.questions, storedAnswers);
  const body = importBody(model.questions, answers);
  const canImport = !readOnly && body !== '';
  const answered = model.questions.filter((question) => answerLines(question, answers[question.id]).length > 0).length;
  const onFork = typeof forkAt === 'function' && forkSeq !== undefined ? () => forkAt(forkSeq) : undefined;

  /** 记一道题的作答：内存与 storage 一起写，刷新后才恢复得回来。冻结之后一律不记（改不了了）。 */
  const setAnswer = (id, next) => {
    if (readOnly) return;
    const merged = { ...storedAnswers, [id]: next };
    setStoredAnswers(merged);
    writeStoredForm(storageOf(), storageKey, callId, merged);
  };
  /** 勾选 / 取消一个选项：界面按归一化后的 label 记，同一个 label 就是同一项。 */
  const toggleOption = (question, label) => {
    const answer = answers[question.id] ?? { selected: [], custom: '' };
    const selected = answer.selected.includes(label)
      ? answer.selected.filter((item) => item !== label)
      : [...answer.selected, label];
    setAnswer(question.id, { ...answer, selected });
  };
  /** 每题的自填空：选项覆盖不到的情况写在这里。 */
  const writeCustom = (question, custom) => {
    const answer = answers[question.id] ?? { selected: [], custom: '' };
    setAnswer(question.id, { ...answer, custom });
  };
  /** 导入：把草稿里那段导入块换成当前作答（没有块就放在最前面），草稿里别的字一个不动。 */
  const onImport = () => {
    if (!canImport) return;
    inputActions.setDraft(applyImport(draft, body));
  };

  return (
    <div className="dsg-root" data-tool={toolName} data-state={model.state} data-readonly={readOnly ? 'true' : undefined}>
      <div className="dsg-form">
        <p className="dsg-progress">{t('row.progress', { total: model.questions.length, answered })}</p>
        <QuestionList
          questions={model.questions}
          answers={answers}
          locked={readOnly}
          t={t}
          onToggleOption={toggleOption}
          onCustom={writeCustom}
        />
        {readOnly ? <p className="dsg-closed">{t('row.closed')}</p> : null}
        <div className="dsg-footer">
          {onFork === undefined ? null : (
            <Button
              className="dsg-fork"
              variant="outline"
              size="sm"
              icon={<IconBranchOutlineRegular />}
              onClick={onFork}
            >
              {t('row.fork')}
            </Button>
          )}
          {readOnly ? null : (
            <Button
              className="dsg-import"
              variant="outline"
              size="sm"
              icon={<IconDownloadOutlineRegular />}
              disabled={!canImport}
              onClick={onImport}
            >
              {t('row.import')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 浏览器里读 localStorage；隐私模式下取这个属性本身就会抛，取不到就当没有存储。 */
function storageOf() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * 题目列表：可填与冻结画的是同一样东西——冻结时只是每个控件都被锁住。
 * @param {object} props - 题目、作答与交互回调。
 * @returns {import('react').JSX.Element} 列表。
 */
function QuestionList({ questions, answers, locked, t, onToggleOption, onCustom }) {
  const labels = useMemo(() => markdownLabels(t), [t]);
  return (
    <div className="dsg-list">
      {questions.map((question) => (
        <div className="dsg-item" key={question.id}>
          <div className="dsg-question">
            {question.header === '' ? null : <span className="dsg-header">{question.header}</span>}
            {question.question}
          </div>
          {question.detail === undefined ? null : (
            <div className="dsg-detail">
              <MarkdownText text={question.detail} labels={labels} />
            </div>
          )}
          <OptionList
            question={question}
            answer={answers[question.id]}
            locked={locked}
            t={t}
            onToggleOption={onToggleOption}
            onCustom={onCustom}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 一道题的作答区：可多选的选项行加一个自填框。冻结时整块锁住，但长相与可填时一模一样
 * （勾选态、自填的字、推荐徽标、说明都原样留着，只是改不了）。
 *
 * 自填框用原生 textarea——ui-primitives 没有多行输入控件，官方那张答题卡也是自己画的
 * textarea；除它之外的控件都用 ui-primitives。
 * @param {object} props - 题目、当前作答、锁定状态与回调。
 * @returns {import('react').JSX.Element} 选项与自填。
 */
function OptionList({ question, answer, locked, t, onToggleOption, onCustom }) {
  const selected = answer?.selected ?? [];
  return (
    <div className="dsg-options">
      {question.options.map((option) => (
        <div className="dsg-optionRow" key={option.label}>
          <div className="dsg-optionMain">
            <Checkbox
              className="dsg-option"
              checked={selected.includes(option.label)}
              disabled={locked}
              label={option.displayLabel}
              onChange={locked ? () => {} : () => onToggleOption(question, option.label)}
            />
            {option.recommended ? <Tag tone="info" className="dsg-badge">{t('row.recommended')}</Tag> : null}
          </div>
          {option.description === undefined ? null : <p className="dsg-optionDescription">{option.description}</p>}
        </div>
      ))}
      <textarea
        className="dsg-custom"
        rows={2}
        readOnly={locked}
        value={answer?.custom ?? ''}
        placeholder={t('row.customPlaceholder')}
        aria-label={`${t('row.customLabel')}：${question.question}`}
        onChange={locked ? () => {} : (event) => onCustom(question, event.target.value)}
      />
    </div>
  );
}

/**
 * `MarkdownText` 要的那份 chrome 标签，取自本插件的字典。
 * @param {Function} t - 本插件的取词函数。
 * @returns {{ code: { copyLabel: string, copiedLabel: string }, footnotes: string }} 标签。
 */
function markdownLabels(t) {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  };
}
