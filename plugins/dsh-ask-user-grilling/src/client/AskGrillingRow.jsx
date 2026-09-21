import { useMemo, useState } from 'react';
import {
  DisclosureRow,
  IconInspectOutline12,
  IconQuestionOutline14,
  MarkdownText,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { readAskCard } from '../card.js';

/**
 * `ask_user_grilling` 的 transcript 行：按 wire 工具名注册进 `tool.call.toolview`，
 * 与官方 `ask_user_question` 那张卡并列（注册自有的 key，不接管官方那张）。
 *
 * 官方卡的取数止于 argsRaw 的 id/question 与结果的 answers，轮末补充题不在 argsRaw 里、
 * detail 也不在范围内，于是配不上对就退回原始 JSON。这里换成读卡模型：argsRaw 里没有的
 * 答案按补充题另列，detail 走 markdown。
 *
 * @param {{ block: object, toolName: string, inspect?: () => void, t: Function }} props - 槽位给的行数据。
 * @returns {import('react').JSX.Element} 这一行的卡片。
 */
export function AskGrillingRow({ block, toolName, inspect, t }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((value) => !value);
  const settled = 'kind' in block;
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? '';
  const resultText = settled ? firstText(block.content) : undefined;
  const model = readAskCard({
    argsRaw,
    resultText,
    errorCode: settled ? block.error?.code : undefined,
    failed: settled && block.isError === true,
  });
  const failure = settled && block.isError === true ? failureText(resultText, block.error) : undefined;
  const expandable = argsRaw !== '' || resultText !== undefined || model.questions.length > 0;
  const open = expanded && expandable;
  const status = statusLabel(model.state, t);

  return (
    <div className="dsg-root" data-tool={toolName} data-state={model.state}>
      {status === null ? null : <span className="dsg-visuallyHidden">{status}</span>}
      <DisclosureRow
        icon={leadingFor(model.state)}
        title={t('row.title')}
        open={open}
        expandable={expandable}
        onToggle={toggle}
        expandOnRowClick
        keepContentWhenOpen
        rowClassName="dsg-row"
        leadingClassName="dsg-leading"
        chevronClassName="dsg-chevron"
        titleClassName="dsg-title"
        collapsedContent={
          <>
            <span className="dsg-sep" aria-hidden="true" />
            <span className="dsg-summary">{summaryFor(model, t)}</span>
          </>
        }
      >
        <div className="dsg-bodyWrap">
          <CardBody model={model} argsRaw={argsRaw} resultText={resultText} failure={failure} t={t} />
          {inspect === undefined ? null : (
            <button type="button" className="dsg-inspectButton" onClick={inspect}>
              <IconInspectOutline12 />
              {t('row.inspect')}
            </button>
          )}
        </div>
      </DisclosureRow>
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

/**
 * 行的前导图标：失败与拒绝用状态点，其余用问号图标（与官方行同一套语义）。
 * @param {string} state - 卡片状态。
 * @returns {import('react').ReactNode} 前导节点。
 */
function leadingFor(state) {
  if (state === 'error' || state === 'rejected') return <StateDot state="error" />;
  if (state === 'cancelled' || state === 'interrupted') return <StateDot state="warning" />;
  return <IconQuestionOutline14 />;
}

/**
 * 屏幕阅读器用的状态文字。扫描光与状态点都是纯视觉的。
 * @param {string} state - 卡片状态。
 * @param {Function} t - 本插件的取词函数。
 * @returns {string|null} 状态文字，正常态为 null。
 */
function statusLabel(state, t) {
  switch (state) {
    case 'running':
      return t('row.waiting');
    case 'error':
      return t('row.failed');
    case 'cancelled':
      return t('row.cancelled');
    case 'interrupted':
      return t('row.interrupted');
    default:
      return null;
  }
}

/**
 * 折叠行右侧的摘要。
 * @param {object} model - 卡片模型。
 * @param {Function} t - 本插件的取词函数。
 * @returns {string} 摘要文字。
 */
function summaryFor(model, t) {
  switch (model.state) {
    case 'running':
      return t('row.waiting');
    case 'answered':
      return t('row.answered', { answered: model.answered, total: model.total });
    case 'rejected':
      return t('row.rejected');
    case 'cancelled':
      return t('row.cancelled');
    case 'interrupted':
      return t('row.interrupted');
    default:
      return t('row.failed');
  }
}

/**
 * 正文：拒绝时先给违规清单，取消/中断时给说明加题目，失败给失败说明，其余按问答列表画。
 * @param {{ model: object, argsRaw: string, resultText: string|undefined, failure: string|undefined, t: Function }} props - 卡片模型与原始文本。
 * @returns {import('react').ReactNode} 正文。
 */
function CardBody({ model, argsRaw, resultText, failure, t }) {
  if (model.state === 'rejected') {
    return (
      <div className="dsg-card" role="group" aria-label={t('row.violations')}>
        <p className="dsg-verdict">{model.error ?? t('row.rejected')}</p>
        <ul className="dsg-violations">
          {model.violations.map((violation, index) => (
            <li key={String(index)}>{violation}</li>
          ))}
        </ul>
        <QuestionEntries questions={model.questions} showAnswers={false} t={t} />
      </div>
    );
  }
  if (model.questions.length === 0) {
    // 运行中的半截 JSON、或不是本插件形状的结果：原样给出，别装作读懂了
    const raw = model.state === 'running' ? argsRaw : resultText;
    return raw === undefined || raw === '' ? null : <pre className="dsg-raw">{raw}</pre>;
  }
  if (model.state === 'cancelled' || model.state === 'interrupted') {
    return (
      <div className="dsg-card">
        <p className="dsg-verdict">
          {model.state === 'cancelled' ? t('row.cancelledDetail') : t('row.interruptedDetail')}
        </p>
        <QuestionEntries questions={model.questions} showAnswers={false} t={t} />
      </div>
    );
  }
  if (model.state === 'error') {
    return (
      <div className="dsg-card">
        {failure === undefined ? null : <p className="dsg-failure">{failure}</p>}
        <QuestionEntries questions={model.questions} showAnswers={false} t={t} />
      </div>
    );
  }
  return (
    <div className="dsg-card">
      <QuestionEntries questions={model.questions} showAnswers={model.state === 'answered'} t={t} />
    </div>
  );
}

/**
 * 题目列表：有答案的画 dt/dd，没答案的只画题干；detail 走 markdown。
 * @param {{ questions: object[], showAnswers: boolean, t: Function }} props - 题目与是否画答案。
 * @returns {import('react').JSX.Element} 列表。
 */
function QuestionEntries({ questions, showAnswers, t }) {
  const labels = useMemo(() => markdownLabels(t), [t]);
  return (
    <dl className="dsg-list">
      {questions.map((question) => (
        <div className="dsg-item" key={question.id}>
          <dt className="dsg-question">
            {question.header === '' ? null : <span className="dsg-header">{question.header}</span>}
            {question.question}
          </dt>
          {question.detail === undefined ? null : (
            <div className="dsg-detail">
              <MarkdownText text={question.detail} labels={labels} />
            </div>
          )}
          {showAnswers ? <AnswerLine question={question} t={t} /> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * 一道题的答案行：选中项逐行列出，自由文本接在后面，一条都没有就是「未回答」。
 * @param {{ question: object, t: Function }} props - 题目与取词函数。
 * @returns {import('react').JSX.Element} 答案行。
 */
function AnswerLine({ question, t }) {
  return (
    <dd className="dsg-answer">
      {question.answers.length === 0 ? (
        <span className="dsg-skipped">{t('row.skipped')}</span>
      ) : (
        question.answers.map((answer, index) => (
          <span className="dsg-answerLine" key={`${question.id}-${String(index)}`}>
            {answer}
          </span>
        ))
      )}
    </dd>
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
