import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  IconBranchOutlineRegular,
  IconDownloadOutlineRegular,
  IconInspectOutlineRegular,
  IconQuestionOutlineRegular,
  IconCheckOutlineRegular,
  MarkdownText,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  answerItems,
  messageText,
  readCallModel,
  roundCall,
  userReplyAfter,
} from '../form-model.js';
import { createFormSession, initialFormAnswers } from '../form-session.js';

/**
 * 取词函数：`t(key)` 取一句，`t(key, params)` 把字典里的 `{name}` 占位符换成实参。
 * 字典本身在 `locales.js`（键集由 `scripts/smoke-client.mjs` 逐条对齐中英文）。
 * @typedef {(key: string, params?: Record<string, unknown>) => string} Translate
 */

/**
 * 会话记录快照里本插件读到的那一件：按名字取视图。取出来的 `chat` 视图就是 form-model 的
 * ChatSnapshotLike（`roundCall` 按那份读位置索引与节点表，本文件另读它的 `legacy.nodes`）。
 * @typedef {{ views: { get: (name: string) => unknown } }} ConversationSnapshot
 */

/**
 * 槽位的标准属性与注入进来的动作（见下面各组件自己的 `@param` 说明）。
 * 平台没有发布这些槽位 props 的类型，所以按**本插件实际读到的成员**就地声明。
 * 刻意不声明成一个全域 interface 再合并到平台模块上：只服务这一个文件。
 * @typedef {object} FormSessionProps
 * @property {unknown} sessionId 当前会话 id（storage 按它分份）。
 * @property {Translate} t 本插件的取词函数。
 * @property {(selector: (state: { draft: string }) => unknown) => unknown} useInput 订阅原生输入状态。
 * @property {{ setDraft: (text: string) => void }} inputActions 输入动作；写草稿走这里。
 */

/**
 * 轮次尾部那个注册项的槽位数据。
 * @typedef {FormSessionProps & {
 *   turn: { turn: unknown, end?: { seq?: unknown } },
 *   useConversation: (selector: (snapshot: ConversationSnapshot) => unknown) => unknown,
 *   forkAt?: (seq: number) => Promise<unknown>,
 * }} TailProps
 */

/**
 * 工具行那个注册项的槽位数据。
 * @typedef {FormSessionProps & {
 *   block: unknown,
 *   toolName: string,
 *   inspect?: () => void,
 * }} RowProps
 */

/**
 * `GrillingForm`（表单本体）的 props。
 * @typedef {FormSessionProps & {
 *   model: { state: import('../form-model.js').FormState, questions: import('../form-model.js').Question[], violations: string[], error: string|undefined, failure: string|undefined },
 *   toolName: unknown,
 *   callId: unknown,
 *   replyText: string|undefined,
 *   forkSeq: number|undefined,
 *   forkAt?: (seq: number) => Promise<unknown>,
 * }} GrillingFormProps
 */

/**
 * `QuestionList` 的 props。
 * @typedef {{
 *   questions: import('../form-model.js').Question[],
 *   answers: import('../form-model.js').AnswerTable,
 *   locked: boolean,
 *   t: Translate,
 *   onToggleOption: (question: import('../form-model.js').Question, label: string) => void,
 *   onCustom: (question: import('../form-model.js').Question, custom: string) => void,
 * }} QuestionListProps
 */

/**
 * `OptionList` 的 props。
 * @typedef {{
 *   question: import('../form-model.js').Question,
 *   answer: import('../form-model.js').Answer|undefined,
 *   locked: boolean,
 *   t: Translate,
 *   onToggleOption: (question: import('../form-model.js').Question, label: string) => void,
 *   onCustom: (question: import('../form-model.js').Question, custom: string) => void,
 * }} OptionListProps
 */

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
 * 这些组合规则（推荐默认与实发那份怎么叠、写操作落到哪把表上、冻结怎么判、草稿与作答一致不
 * 一致）全归 `src/form-session.js` 的**表单会话**内壳；组件只持 state、渲染，并拿内壳算好的显示那份。
 *
 * **只读即冻结**：记录里在这条调用之后出现了用户发言（kind `user`/`steering`、seq 更大），
 * 这一轮就算过去了——表单不再换成一行行答案，而是**停住**：勾选框与自填框按提交时的样子原样
 * 留着，看得到、改不了、文字还能选中复制。冻结那份按用户**实际发出去的那条消息**反解重画
 * （他在原生输入框里改过、增删过的都以那条消息为准）；那条消息里根本没有作答块时，本轮就是
 * **没作答**（本地勾选与推荐默认都不许冒充他的答案，只挂一行说明）。冻结之后**不折叠、始终
 * 摊开**：顶上留一行摘要（本轮几题、答了几题），它不是开关——没有箭头、不可点，表就排在它下面。
 *
 * 槽位给轮次尾部条目的数据：本轮（`turn`，`TurnLocation`）、收尾位置（`seq`）与 `openFile`；
 * 分叉要的是**本轮结束位置** `turn.end.seq`——`seq` 是收尾助手那条，切在那儿会把这次调用切在
 * 门外，所以它只用来兜底判断，`turn.end` 拿不到就不画那个键。`sessionId`、`inputActions`、
 * `useInput`、`useConversation` 是 session 作用域的标准属性；分叉动作以注入形式进来（`forkAt`），
 * 组件自己不去取服务。
 *
 * @param {TailProps} props - 轮次尾部的槽位数据、标准属性与注入的分叉动作。
 * @returns {import('react').ReactNode} 本轮的表单；本轮没有表就什么都不画。
 */
export function GrillingFormTail({ turn, sessionId, t, useInput, useConversation, inputActions, forkAt }) {
  // 平台发布的会话快照没有可导入的类型，这里把 `chat` 视图按**本插件真正读到的成员**
  // （轮次位置索引、节点表、legacy 发言节点）命个名——形状就是 form-model 的
  // ChatSnapshotLike，与 roundCall 读的是同一份。断言在这里只起命名作用，不再放宽别的。
  const chat = /** @type {import('../form-model.js').ChatSnapshotLike|undefined} */ (
    useConversation((snapshot) => snapshot.views.get('chat'))
  );
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
 * @param {RowProps} props - 槽位给的行数据与取词函数。
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
 * @param {GrillingFormProps} props - 表单模型、作答来源、分叉切点与交互回调。
 * @returns {import('react').ReactNode} 这一轮的表单（冻结后只在顶上多一行摘要，表照旧摊开）。
 */
function GrillingForm({ model, toolName, callId, sessionId, t, useInput, inputActions, replyText, forkSeq, forkAt }) {
  const draft = useInput((state) => state.draft);

  // 用户自己动过的那一份，连他「清空过这题」也在里面；他没动过的题不出现在这里。
  const [storedAnswers, setStoredAnswers] = useState(
    () => initialFormAnswers({ sessionId, callId, storage: storageOf() }),
  );
  // 分叉失败了就在按键上说明；换一轮（callId 变了）时由 React 按新的初始值重建。
  const [forkFailed, setForkFailed] = useState(false);
  // 两表不变量、冻结判定、写穿顺序、导入门禁与草稿状态都归内壳管（见 src/form-session.js）；
  // 组件只拿它算好的显示那份与几个动作，state 仍在这里。
  const session = createFormSession({
    questions: model.questions,
    sessionId,
    callId,
    replyText,
    storedAnswers,
    storage: storageOf(),
    draft,
  });
  const { readOnly, unanswered, answers, canImport, draftState } = session;
  const onFork = typeof forkAt === 'function' && forkSeq !== undefined
    ? () => {
      setForkFailed(false);
      forkAt(forkSeq).catch(() => { setForkFailed(true); });
    }
    : undefined;

  /** 勾选 / 取消一个选项：写操作交回用户自己那份的新表，显示那份由内壳重算。
   * @type {(question: import('../form-model.js').Question, label: string) => void} */
  const toggleOption = (question, label) => setStoredAnswers(session.toggle(question.id, label));
  /** 每题的自填空：选项覆盖不到的情况写在这里。
   * @type {(question: import('../form-model.js').Question, custom: string) => void} */
  const writeCustom = (question, custom) => setStoredAnswers(session.setCustom(question.id, custom));
  /** 导入：把草稿里那段导入块换成当前作答（没有块就放在最前面），草稿里别的字一个不动。 */
  const onImport = () => inputActions.setDraft(session.importInto(draft));

  const footer = (
    <div className="dsg-footer">
      {onFork === undefined ? null : (
        <Button
          className="dsg-fork"
          variant="outline"
          size="sm"
          icon={<IconBranchOutlineRegular />}
          onClick={onFork}
        >
          {forkFailed ? t('row.forkFailed') : t('row.fork')}
        </Button>
      )}
      {readOnly ? null : (
        <Button
          className="dsg-import"
          variant="outline"
          size="sm"
          icon={draftState === 'current' ? <IconCheckOutlineRegular /> : <IconDownloadOutlineRegular />}
          disabled={!canImport}
          title={canImport ? undefined : t('row.importDisabled')}
          onClick={onImport}
        >
          {t(importLabelKey(draftState))}
        </Button>
      )}
    </div>
  );

  // 冻结：不折叠、始终摊开。顶上留一行摘要（几个题、答了几题、问号图标），它不是开关——
  // 没有箭头、不可点；底下就是那张停住的表。
  if (readOnly) {
    return (
      <div className="dsg-root" data-tool={toolName} data-state={model.state} data-readonly="true">
        <div className="dsg-form">
          <p className="dsg-summary">
            <span className="dsg-summaryIcon">
              <IconQuestionOutlineRegular />
            </span>
            {t('row.frozenSummary', {
              total: model.questions.length,
              answered: questionsAnswered(model.questions, answers),
            })}
          </p>
          {unanswered ? <p className="dsg-unanswered">{t('row.unanswered')}</p> : null}
          <QuestionList
            questions={model.questions}
            answers={answers}
            locked
            t={t}
            onToggleOption={toggleOption}
            onCustom={writeCustom}
          />
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="dsg-root" data-tool={toolName} data-state={model.state}>
      <div className="dsg-form">
        <QuestionList
          questions={model.questions}
          answers={answers}
          locked={false}
          t={t}
          onToggleOption={toggleOption}
          onCustom={writeCustom}
        />
        {footer}
      </div>
    </div>
  );
}

/** 导入键的文案键：还没导入与已经旧了都叫他点「更新输入框」，已经是当前那份就只是「已导入」。
 * @param {string} draftState - 内壳算出来的草稿状态。
 * @returns {string} 字典键。 */
function importLabelKey(draftState) {
  if (draftState === 'current') return 'row.imported';
  if (draftState === 'stale') return 'row.updateImport';
  return 'row.import';
}

/** 这一轮答了几题（按显示那份算），冻结摘要用；判据只有 answerItems 一处。
 * @param {import('../form-model.js').Question[]} questions - 题目模型。
 * @param {import('../form-model.js').AnswerTable} answers - 显示中的作答表。
 * @returns {number} 有作答的题数。 */
function questionsAnswered(questions, answers) {
  return questions.filter((question) => answerItems(question, answers[question.id]).length > 0).length;
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
 * @param {QuestionListProps} props - 题目、作答与交互回调。
 * @returns {import('react').ReactNode} 列表。
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
 * 一道题的作答区：按题型分三种。单选画成一题至多一项的选项行、多选是若干勾选框、自由题只有
 * 一个自己打字的框；单选与多选底下另有一个自填框，用来补选项覆盖不到的话。冻结时整块锁住，
 * 但长相与可填时一模一样（勾选态、自填的字、推荐徽标、说明都原样留着，只是改不了）。
 *
 * 单选靠勾选框自己的开关语义表达（ui-primitives 里没有单选控件）：选中那一项上再点一下就
 * 取消，勾别的项时上一个自动让位——内壳保证一题至多留一项。只是**外观**上把单选那题的选择器
 * 画成圆圈加实心点（`dsg-optionSingle`，见 GrillingForm.css）：它底下仍是那个勾选框控件，
 * 键盘、读屏念的都是「复选框」，勾选/取消的行为一个字不改。
 *
 * 自填框用原生 textarea——ui-primitives 没有多行输入控件，官方那张答题卡也是自己画的
 * textarea；除它之外的控件都用 ui-primitives。
 * @param {OptionListProps} props - 题目、当前作答、锁定状态与回调。
 * @returns {import('react').ReactNode} 该题的作答区。
 */
function OptionList({ question, answer, locked, t, onToggleOption, onCustom }) {
  const selected = answer?.selected ?? [];
  // 自由题与另外两种的差别只在那个框上（高一点、不写提示语）；选项列表由题型自己决定有没有。
  const free = question.type === 'free';
  return (
    <div className="dsg-options">
      {question.options.map((option) => (
        <div className="dsg-optionRow" key={option.label}>
          <div className="dsg-optionMain">
            <Checkbox
              className={question.type === 'single' ? 'dsg-option dsg-optionSingle' : 'dsg-option'}
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
        rows={free ? 4 : 2}
        readOnly={locked}
        value={answer?.custom ?? ''}
        placeholder={free ? undefined : t('row.customPlaceholder')}
        aria-label={`${t('row.customLabel')}：${question.question}`}
        onChange={locked ? () => {} : (event) => onCustom(question, event.target.value)}
      />
    </div>
  );
}

/**
 * `MarkdownText` 要的那份 chrome 标签，取自本插件的字典（形状就用 ui-primitives 自己导出的
 * `MarkdownLabels`，不另抄一份）。
 * @param {Translate} t - 本插件的取词函数。
 * @returns {import('@deepseek-ai/dsh-client-ui-primitives').MarkdownLabels} 标签。
 */
function markdownLabels(t) {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  };
}
