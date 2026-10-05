import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
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
  importBody,
  importStale,
  isReadOnlyAfter,
  readFormModel,
  readStoredForm,
  writeStoredForm,
} from '../form-model.js';

/**
 * `grilling_form` 的 transcript 行：按 wire 工具名注册进 `tool.call.toolview`，
 * 与官方 `ask_user_question` 那张卡并列（自有 key，不接管官方那张）。
 *
 * 与官方卡的根本差别：那一张是「等答案的服务」的回执，这一张**自己就是答题的地方**。
 * 工具发完就结束了本轮，所以表单得在记录里就地可填：
 *
 *  - **摊开、不折叠、没有卡片**：不画折叠行，也不套边框/背景/内边距/内部滚动，题目、选项、
 *    按钮跟上下文同处一层，像正文自己长出来的一段。整轮的进度缩成题目区顶上的一行小灰字；
 *  - **推荐的选项默认勾上**：模型标了推荐的选项，在用户没动过那题时就是选中态；用户动过
 *    （包括把默认项取消掉）一律以他的为准；
 *  - 作答是这一行的本地状态，按会话 + callId 存进 localStorage，刷新后恢复；
 *  - 底部那个窄按钮把作答写进**原生草稿**（槽位标准属性 `inputActions.setDraft`），
 *    用户按原生发送键发出——插件不碰输入框、也不代发；
 *  - 表单里填了东西而草稿里没有对应的导入块时，行上常驻一条提醒。平台没有发送前的
 *    提交钩子，「发送前拦截」做不到，提醒只能是提醒；
 *  - 记录里在这条调用之后出现了用户发言（kind `user`/`steering`，seq 更大），这一轮就算
 *    过去了：表单转只读，内容留着给人看，不再进上下文。
 *
 * 槽位给的行数据：`{ block, toolName, callId, inspect }` 与取词函数 `t`；`sessionId`、
 * `inputActions`、`useInput`、`useConversation` 是 session 作用域的标准属性，随行数据一起交给
 * 这个组件（见 `@deepseek-ai/dsh-client-ui-conversation` 的 slots 契约）。
 *
 * @param {object} props - 槽位给的行数据与 session 标准属性。
 * @returns {import('react').JSX.Element} 这一行的表单。
 */
export function GrillingFormRow({
  block,
  toolName,
  callId,
  sessionId,
  t,
  inspect,
  inputActions,
  useInput,
  useConversation,
}) {
  const settled = 'kind' in block;
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? '';
  const resultText = settled ? firstText(block.content) : undefined;
  const model = readFormModel({ argsRaw, resultText, failed: settled && block.isError === true });
  const failure = settled && block.isError === true ? failureText(resultText, block.error) : undefined;

  const draft = useInput((state) => state.draft);
  const chat = useConversation((snapshot) => snapshot.views.get('chat'));
  const readOnly = isReadOnlyAfter(chat?.legacy?.nodes, callId);

  const storageKey = formStorageKey(sessionId);
  /** 本轮作答在会话 storage 里的读写口：storage、键、callId 三个参数只在这里拼一次。 */
  const readForm = () => readStoredForm(storageOf(), storageKey, callId);
  const writeForm = (next) => writeStoredForm(storageOf(), storageKey, callId, next);
  // 用户自己动过的那一份，连他「清空过这题」也在里面；他没动过的题不出现在这里。
  const [storedAnswers, setStoredAnswers] = useState(readForm);
  // 表单上显示、导入、计数的都是这一份：用户没动过的题上，推荐项默认勾着。
  const answers = applyRecommendedDefaults(model.questions, storedAnswers);

  const interactive = model.state === 'form' && !readOnly;
  const body = importBody(model.questions, answers);
  const canImport = interactive && body !== '';
  const stale = canImport && importStale(draft, body);
  const answered = model.questions.filter((question) => answerLines(question, answers[question.id]).length > 0).length;

  /** 记一道题的作答：内存与 storage 一起写，刷新后才恢复得回来。 */
  const setAnswer = (id, next) => {
    const merged = { ...storedAnswers, [id]: next };
    setStoredAnswers(merged);
    writeForm(merged);
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
      <FormBody
        model={model}
        failure={failure}
        argsRaw={argsRaw}
        resultText={resultText}
        answers={answers}
        answered={answered}
        interactive={interactive}
        readOnly={readOnly}
        stale={stale}
        canImport={canImport}
        t={t}
        onToggleOption={toggleOption}
        onCustom={writeCustom}
        onImport={onImport}
      />
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
 * 结果里的第一段文本。本工具只渲染一段，形状不对就当没有结果。
 * @param {unknown} content - 结果 content 数组。
 * @returns {string|undefined} 文本。
 */
function firstText(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content.find((block) => block?.type === 'text');
  return typeof text?.text === 'string' ? text.text : undefined;
}

/**
 * 失败行要显示的文字：结果里那段文本优先，没有就用错误的 name/code 拼一行。
 * @param {string|undefined} resultText - 结果文本。
 * @param {{name?: string, code?: string}|undefined} error - 结果节点上的错误。
 * @returns {string|undefined} 失败说明。
 */
function failureText(resultText, error) {
  if (resultText !== undefined && resultText !== '') return resultText;
  const parts = [error?.name, error?.code].filter((part) => typeof part === 'string' && part !== '');
  return parts.length === 0 ? undefined : parts.join(': ');
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
 * 正文：拒绝给违规清单，失败给失败说明，其余按状态画表单或只读作答。
 * @param {object} props - 表单模型、作答与交互回调。
 * @returns {import('react').ReactNode} 正文。
 */
function FormBody({
  model,
  failure,
  argsRaw,
  resultText,
  answers,
  answered,
  interactive,
  readOnly,
  stale,
  canImport,
  t,
  onToggleOption,
  onCustom,
  onImport,
}) {
  if (model.state === 'rejected') {
    return (
      <div className="dsg-form" role="group" aria-label={t('row.violations')}>
        <p className="dsg-verdict">{model.error ?? t('row.rejected')}</p>
        <ul className="dsg-violations">
          {model.violations.map((violation, index) => (
            <li key={String(index)}>{violation}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (model.questions.length === 0) {
    // 运行中的半截 JSON、或不是本插件形状的结果：原样给出，别装作读懂了
    const raw = model.state === 'running' ? argsRaw : resultText;
    return raw === undefined || raw === '' ? null : <pre className="dsg-raw">{raw}</pre>;
  }
  if (model.state === 'error') {
    return (
      <div className="dsg-form">
        <p className="dsg-failure">{failure ?? t('row.failed')}</p>
        <QuestionList questions={model.questions} answers={answers} interactive={false} readOnly={false} t={t} onToggleOption={onToggleOption} onCustom={onCustom} />
      </div>
    );
  }
  // 只有结果落库、确认这一轮投出去了（state 'form'），才有「这一轮」可言：参数还在流式
  // 传输（'running'）时题目可能已经能解析，但进度、选项与导入键都还不该出现。
  const live = model.state === 'form';
  return (
    <div className="dsg-form">
      {live ? <p className="dsg-progress">{t('row.progress', { total: model.questions.length, answered })}</p> : null}
      <QuestionList
        questions={model.questions}
        answers={answers}
        interactive={interactive}
        readOnly={readOnly}
        t={t}
        onToggleOption={onToggleOption}
        onCustom={onCustom}
      />
      {!live ? null : (
        readOnly ? (
          <p className="dsg-closed">{t('row.closed')}</p>
        ) : (
          <div className="dsg-footer">
            {stale ? <p className="dsg-reminder">{t('row.reminder')}</p> : null}
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
          </div>
        )
      )}
    </div>
  );
}

/**
 * 题目列表：可交互时画选项与自填；只读时把当时的作答原样列出来；运行中只画题干。
 * @param {object} props - 题目、作答与交互回调。
 * @returns {import('react').JSX.Element} 列表。
 */
function QuestionList({ questions, answers, interactive, readOnly, t, onToggleOption, onCustom }) {
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
          {interactive ? (
            <OptionList question={question} answer={answers[question.id]} t={t} onToggleOption={onToggleOption} onCustom={onCustom} />
          ) : null}
          {readOnly ? <AnswerLine question={question} answer={answers[question.id]} t={t} /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * 一道题的作答区：可多选的选项行加一个自填框。
 * 自填框用原生 textarea——ui-primitives 没有多行输入控件，官方那张答题卡也是自己画的
 * textarea；除它之外的控件都用 ui-primitives。
 * @param {object} props - 题目、当前作答与回调。
 * @returns {import('react').JSX.Element} 选项与自填。
 */
function OptionList({ question, answer, t, onToggleOption, onCustom }) {
  const selected = answer?.selected ?? [];
  return (
    <div className="dsg-options">
      {question.options.map((option) => (
        <div className="dsg-optionRow" key={option.label}>
          <div className="dsg-optionMain">
            <Checkbox
              className="dsg-option"
              checked={selected.includes(option.label)}
              label={option.displayLabel}
              onChange={() => onToggleOption(question, option.label)}
            />
            {option.recommended ? <Tag tone="info" className="dsg-badge">{t('row.recommended')}</Tag> : null}
          </div>
          {option.description === undefined ? null : <p className="dsg-optionDescription">{option.description}</p>}
        </div>
      ))}
      <textarea
        className="dsg-custom"
        rows={2}
        value={answer?.custom ?? ''}
        placeholder={t('row.customPlaceholder')}
        aria-label={`${t('row.customLabel')}：${question.question}`}
        onChange={(event) => onCustom(question, event.target.value)}
      />
    </div>
  );
}

/**
 * 只读的一道题：把当时的勾选与自填列出来，一条都没有就是「未作答」。
 * @param {object} props - 题目、作答与取词函数。
 * @returns {import('react').JSX.Element} 作答行。
 */
function AnswerLine({ question, answer, t }) {
  const lines = answerLines(question, answer);
  return (
    <div className="dsg-answer">
      {lines.length === 0 ? (
        <span className="dsg-skipped">{t('row.unanswered')}</span>
      ) : (
        lines.map((line, index) => (
          <span className="dsg-answerLine" key={`${question.id}-${String(index)}`}>{line}</span>
        ))
      )}
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
