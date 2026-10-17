import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconDownloadOutlineRegular,
  IconInspectOutlineRegular,
  IconQuestionOutlineRegular,
  MarkdownDelegateProvider,
  MarkdownText,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  answerItems,
  drawsForm,
  drawsNote,
  formReplyAfter,
  messageText,
  readCallModel,
  replacedForm,
  roundCall,
  selectsOnClick,
  supersededAfter,
} from '../form-model.js';
import { carriedAnswers, createFormSession, initialFormAnswers } from '../form-session.js';

/**
 * 取词函数：t(key) 取一句，t(key, params) 把字典里的 {name} 占位符换成实参。
 * 字典本身在 locales.js（键集由 scripts/smoke-client.mjs 逐条对齐中英文）。
 * @typedef {(key: string, params?: Record<string, unknown>) => string} Translate
 */

/**
 * 会话记录快照里本插件读到的那一件：按名字取视图。取出来的 chat 视图就是 form-model 的
 * ChatSnapshotLike（roundCall 按那份读位置索引与节点表，本文件另读它的 legacy.nodes）。
 * @typedef {{ views: { get: (name: string) => unknown } }} ConversationSnapshot
 */

/**
 * 槽位的标准属性与注入进来的动作（见下面各组件自己的 @param 说明）。
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
 *   openFile?: (path: string) => void,
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
 * GrillingForm（表单本体）的 props。
 * @typedef {FormSessionProps & {
 *   model: { state: import('../form-model.js').FormState, questions: import('../form-model.js').Question[], message: string|undefined, failure: string|undefined },
 *   toolName: unknown,
 *   callId: unknown,
 *   replacedCallId: unknown,
 *   carried: import('../form-model.js').AnswerTable|undefined,
 *   replyText: string|undefined,
 *   superseded: boolean,
 *   forkSeq: number|undefined,
 *   openFile?: (path: string) => void,
 *   forkAt?: (seq: number) => Promise<unknown>,
 * }} GrillingFormProps
 */

/**
 * 交给 MarkdownText 的文案：宿主那个渲染器不自带语言，代码块与脚注的文案必须由调用方给。
 * 形状照它的 `MarkdownLabels`：`code` 里是复制键的两句话，`footnotes` 是脚注段的标题。
 * @typedef {{
 *   code: { copyLabel: string, copiedLabel: string },
 *   footnotes: string,
 * }} MarkdownLabelsLike
 */

/**
 * QuestionList 的 props。
 * @typedef {{
 *   questions: import('../form-model.js').Question[],
 *   answers: import('../form-model.js').AnswerTable,
 *   locked: boolean,
 *   t: Translate,
 *   markdownLabels: MarkdownLabelsLike,
 *   onToggleOption: (question: import('../form-model.js').Question, label: string) => void,
 *   onCustom: (question: import('../form-model.js').Question, custom: string) => void,
 * }} QuestionListProps
 */

/**
 * OptionList 的 props。
 * @typedef {{
 *   question: import('../form-model.js').Question,
 *   answer: import('../form-model.js').Answer|undefined,
 *   locked: boolean,
 *   t: Translate,
 *   markdownLabels: MarkdownLabelsLike,
 *   onToggleOption: (question: import('../form-model.js').Question, label: string) => void,
 *   onCustom: (question: import('../form-model.js').Question, custom: string) => void,
 * }} OptionListProps
 */

/**
 * grilling_form 的浏览器半边：两个注册项共用这一个模块。
 *
 *  - **轮次尾部**（conversation.chat.turnTail，GrillingFormTail）：表单住在这里。轮次尾部与
 *    正文同处一层，不被这一轮的「工作过程」折叠吞掉——工具行必然被折进过程区，所以表不再住那儿。
 *    这一条从本轮里认出那次 grilling_form 调用（按工具名在本轮节点里定位），本轮没有就不画。
 *  - **工具行**（tool.call.toolview，GrillingFormRow）：表搬走之后它安静下来，只在没投出的轮次
 *    画那句说明（入参被拒或被闸门拦下）、在调用失败时说明失败；投出去的轮次它什么都不画。
 *
 * 表单本身：推荐的选项在用户没动过那题时默认勾上；作答按会话 + callId 存进 localStorage；
 * 底部那个按钮把作答写进**原生草稿**（槽位标准属性 inputActions.setDraft），发送权只在原生
 * 输入框的发送键上；旁边那个「从这里分叉」按**本轮结束点**开一条新会话，新会话里表单是全新的。
 *
 * 题干、选项文字与两处补充说明都交给宿主的 MarkdownText 按 markdown 渲染（compact 版）；
 * 选项行是本插件自己画的——整行是一块可点的框，控件在左、文字与补充说明在右。
 *
 * 这些组合规则（推荐默认与实发那份怎么叠、写操作落到哪把表上、冻结怎么判、草稿与作答一致不
 * 一致）全归 src/form-session.js 的**表单会话**内壳；组件只持 state、渲染，并拿内壳算好的显示那份。
 *
 * **三种后果分得开**：自己的作答块到了就冻结（按那条消息重画，看得到、改不了、选项区压暗、
 * 文字还能选中复制）；后面某一轮又投出一张带 replace: true 的表就只剩一行「提问表单已被后面
 * 那张取代」；两样都没有就照旧可填——转向消息、聊别的事、答别的表都不锁它。冻结那份按用户
 * **实际发出去的那条消息**反解重画（他在原生输入框里改过、增删过的都以那条消息为准）；块坏了才
 * 退回本地那份。冻结之后**不折叠、始终摊开**：顶上留一行摘要（本轮几题、答了几题），它不是开关
 * ——没有箭头、不可点。
 *
 * 槽位给轮次尾部条目的数据：本轮（turn，TurnLocation）、收尾位置（seq）与 openFile；
 * 分叉要的是**本轮结束位置** turn.end.seq——seq 是收尾助手那条，切在那儿会把这次调用切在
 * 门外，所以它只用来兜底判断，turn.end 拿不到就不画那个键。sessionId、inputActions、
 * useInput、useConversation 是 session 作用域的标准属性；分叉动作以注入形式进来（forkAt），
 * 组件自己不去取服务。槽位给的 openFile 原样交给 MarkdownDelegateProvider——轮次尾部不在宿主
 * 那条链接代理的范围内，不包这一层，本地文件链接就点不开。
 *
 * @param {TailProps} props - 轮次尾部的槽位数据、标准属性与注入的分叉动作。
 * @returns {import('react').ReactNode} 本轮的表单；本轮没有表就什么都不画。
 */
export function GrillingFormTail({ turn, sessionId, t, useInput, useConversation, inputActions, openFile, forkAt }) {
  // 平台发布的会话快照没有可导入的类型，这里把 chat 视图按**本插件真正读到的成员**
  // （轮次位置索引、节点表、legacy 发言节点）命个名——形状就是 form-model 的
  // ChatSnapshotLike，与 roundCall 读的是同一份。断言在这里只起命名作用，不再放宽别的。
  const chat = /** @type {import('../form-model.js').ChatSnapshotLike|undefined} */ (
    useConversation((snapshot) => snapshot.views.get('chat'))
  );
  const round = roundCall(chat, turn?.turn);
  if (round === undefined) return null;
  const model = readCallModel(round.block);
  // 只有结果落库、确认这一轮投出去了、题面也读得出来，才有表可画（判据在 form-model 里只有一份）。
  if (!drawsForm(model)) return null;
  // 这块作答块认的是这次调用的 id：别的表、别的轮次的块都不会被当成它的作答。
  const reply = formReplyAfter(chat?.legacy?.nodes, round.callId);
  const superseded = reply === undefined && supersededAfter(chat, turn?.turn);
  // 取代发生的那一刻：把旧表题干一样的那些题的勾选搬过来，草稿里旧表那块也换成这张表的。
  const replaced = reply === undefined && !superseded ? replacedForm(chat, turn?.turn) : undefined;
  const carried = carriedAnswers({ sessionId, storage: storageOf(), replaced, questions: model.questions });
  return (
    <GrillingForm
      model={model}
      toolName={round.toolName}
      callId={round.callId}
      replacedCallId={replaced?.callId}
      carried={carried}
      sessionId={sessionId}
      t={t}
      useInput={useInput}
      inputActions={inputActions}
      replyText={reply === undefined ? undefined : messageText(reply)}
      superseded={superseded}
      forkSeq={typeof turn?.end?.seq === 'number' ? turn.end.seq : undefined}
      openFile={openFile}
      forkAt={forkAt}
    />
  );
}

/**
 * grilling_form 的工具行：表搬到轮次尾部之后，这里只剩没投出的说明与失败说明。
 * @param {RowProps} props - 槽位给的行数据与取词函数。
 * @returns {import('react').ReactNode} 说明；投出去的轮次什么都不画。
 */
export function GrillingFormRow({ block, toolName, t, inspect }) {
  const model = readCallModel(block);
  if (!drawsNote(model)) return null;
  return (
    <div className="dsg-root" data-tool={toolName} data-state={model.state}>
      <div className="dsg-form">
        {model.state === 'notShown'
          ? <p className="dsg-verdict">{model.message ?? t('row.notShown')}</p>
          : <p className="dsg-failure">{model.failure ?? t('row.failed')}</p>}
      </div>
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
 * 交给 MarkdownText 的文案对象。它要求引用稳定（换一次身份就丢掉渲染缓存），所以按取词函数
 * 记一份——字典随语言切换时才换。
 * @param {Translate} t - 取词函数。
 * @returns {MarkdownLabelsLike} 代码块与脚注的文案。
 */
function useMarkdownLabels(t) {
  return useMemo(() => ({
    code: { copyLabel: t('row.copyCode'), copiedLabel: t('row.copiedCode') },
    footnotes: t('row.footnotes'),
  }), [t]);
}

/**
 * 表单本体的三态：可填、冻结（自己的作答块到了）、已被取代（后面那张顶掉了它）。
 * @param {GrillingFormProps} props - 表单模型、作答来源、分叉切点与交互回调。
 * @returns {import('react').ReactNode} 这一轮的表单。
 */
function GrillingForm({ model, toolName, callId, replacedCallId, carried, sessionId, t, useInput, inputActions, replyText, superseded, forkSeq, openFile, forkAt }) {
  const draft = useInput((state) => state.draft);
  const markdownLabels = useMarkdownLabels(t);

  // 用户自己动过的那一份，连他「清空过这题」也在里面；他没动过的题不出现在这里。
  // 这一轮取代了前面那张表时，搬过来的勾选先进初值——刷新前后都得看得见。
  const [storedAnswers, setStoredAnswers] = useState(
    () => initialFormAnswers({ sessionId, callId, storage: storageOf(), carried }),
  );
  // 分叉失败了就在按键上说明；换一轮（callId 变了）时由 React 按新的初始值重建。
  const [forkFailed, setForkFailed] = useState(false);
  // 两表不变量、冻结判定、写穿顺序、导入门禁与草稿状态都归内壳管（见 src/form-session.js）；
  // 组件只拿它算好的显示那份与几个动作，state 仍在这里。
  const session = createFormSession({
    questions: model.questions,
    sessionId,
    callId,
    replacedCallId,
    replyText,
    superseded,
    storedAnswers,
    storage: storageOf(),
    draft,
  });
  const { readOnly, answers, draftState } = session;

  // 取代发生的那一刻：草稿里旧表那块换成这张表的（旧块整段拿掉，新块放在它原来的位置）。
  // 只在挂载时做一次——之后草稿是用户的，插件不再动它；旧块不在草稿里时这一步什么都不改。
  useEffect(() => {
    if (replacedCallId === undefined) return;
    const next = session.importInto(draft);
    if (next !== draft) inputActions.setDraft(next);
  }, []);

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
  /** 导入：把草稿里这张表的块换成当前作答（没有就放在最前面），草稿里别的字一个字不动。 */
  const onImport = () => inputActions.setDraft(session.importInto(draft));

  // 提问表单已被后面那张取代：旧表只剩一行字——同一时刻只有一张表可填。
  if (superseded) {
    return (
      <div className="dsg-root" data-tool={toolName} data-state={model.state} data-superseded="true">
        <div className="dsg-form">
          <p className="dsg-superseded">{t('row.superseded')}</p>
        </div>
      </div>
    );
  }

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
          onClick={onImport}
        >
          {t(importLabelKey(draftState))}
        </Button>
      )}
    </div>
  );

  // 冻结：不折叠、始终摊开。顶上留一行摘要（几个题、答了几题、问号图标），它不是开关——
  // 没有箭头、不可点；底下就是那张停住的表，选项区整体压暗。可填与冻结画的是同一棵树，
  // 只差 `data-readonly` 这一个标记：摘要行与压暗都由它挂样式。
  return (
    <MarkdownDelegateProvider openFile={openFile}>
      <div
        className="dsg-root"
        data-tool={toolName}
        data-state={model.state}
        {...readOnly ? { 'data-readonly': 'true' } : {}}
      >
        <div className="dsg-form">
          {readOnly ? (
            <p className="dsg-summary">
              <span className="dsg-summaryIcon">
                <IconQuestionOutlineRegular />
              </span>
              {t('row.frozenSummary', {
                total: model.questions.length,
                answered: questionsAnswered(model.questions, answers),
              })}
            </p>
          ) : null}
          <QuestionList
            questions={model.questions}
            answers={answers}
            locked={readOnly}
            t={t}
            markdownLabels={markdownLabels}
            onToggleOption={toggleOption}
            onCustom={writeCustom}
          />
          {footer}
        </div>
      </div>
    </MarkdownDelegateProvider>
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
  return questions.filter((question) => answerItems(answers[question.id]).length > 0).length;
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
 * 题目列表：可填与冻结画的是同一样东西——冻结时只是每个控件都被锁住、选项区压暗。每题前面是
 * 插件画的题号（1. 2. …），作答块里也只记这个号；题干、题目的补充说明、选项、每题的补充框
 * 按这个次序排。
 * @param {QuestionListProps} props - 题目、作答与交互回调。
 * @returns {import('react').ReactNode} 列表。
 */
function QuestionList({ questions, answers, locked, t, markdownLabels, onToggleOption, onCustom }) {
  return (
    <div className="dsg-list">
      {questions.map((question) => (
        <div className="dsg-item" key={question.id}>
          <div className="dsg-question">
            <span className="dsg-number">{question.number}.</span>
            <div className="dsg-questionText">
              <MarkdownText text={question.question} labels={markdownLabels} variant="compact" />
            </div>
          </div>
          {question.detail === undefined ? null : (
            <div className="dsg-questionDetail">
              <MarkdownText text={question.detail} labels={markdownLabels} variant="compact" />
            </div>
          )}
          <OptionList
            question={question}
            answer={answers[question.id]}
            locked={locked}
            t={t}
            markdownLabels={markdownLabels}
            onToggleOption={onToggleOption}
            onCustom={onCustom}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 一道题的作答区：每个选项是一块整行可点的框（控件在左、文字与它自己的补充说明在右），
 * 底下另有一个自填框——三种题型都有，自由题的选项列表是空的，只剩那个框。
 *
 * 单选与多选的选择器都是本插件画的：`<label>` 里放一个视觉上藏起来的原生勾选框（行为与
 * 开关状态都由它决定），旁边那个圈或方框只是画法。单选一题至多一项由内壳保证。
 *
 * 冻结时整个选项区（选项文字、选项的补充说明、推荐徽标、自填框）压到 0.5 透明，
 * 圈与方框保持原色——回看时一眼看得出勾了什么。
 *
 * 自填框用原生 textarea——ui-primitives 没有多行输入控件，官方那张答题卡也是自己画的 textarea。
 * @param {OptionListProps} props - 题目、当前作答、锁定状态与回调。
 * @returns {import('react').ReactNode} 该题的作答区。
 */
function OptionList({ question, answer, locked, t, markdownLabels, onToggleOption, onCustom }) {
  const selected = answer?.selected ?? [];
  // 自由题与另外两种的差别只在那个框上（高一点、不写提示语）；选项列表由题型自己决定有没有。
  const free = question.type === 'free';
  return (
    <div className="dsg-options">
      {question.options.map((option) => (
        <OptionRow
          key={option.label}
          question={question}
          option={option}
          checked={selected.includes(option.label)}
          locked={locked}
          t={t}
          markdownLabels={markdownLabels}
          onToggleOption={onToggleOption}
        />
      ))}
      <textarea
        className="dsg-custom"
        rows={free ? 4 : 2}
        readOnly={locked}
        value={answer?.custom ?? ''}
        placeholder={free ? undefined : t('row.customPlaceholder')}
        onChange={locked ? () => {} : (event) => onCustom(question, event.target.value)}
      />
    </div>
  );
}

/**
 * 一个选项：整块是一行可点的框。里面依次是视觉上藏起来的原生勾选框、插件画的圈（单选）
 * 或方框（多选），以及选项文字与它自己的补充说明，推荐徽标跟在文字后同一行。
 *
 * 整行可点由这一层自己做，不用 `<label>` 包：`<label>` 的内容模型是行内内容，而选项文字
 * 与补充说明都是 markdown 渲染器给的块级元素。哪些点击不切勾选由 form-model 的
 * selectsOnClick 判（点在链接或按钮上、以及整行锁着时）。
 * @param {{
 *   question: import('../form-model.js').Question,
 *   option: import('../form-model.js').QuestionOption,
 *   checked: boolean,
 *   locked: boolean,
 *   t: Translate,
 *   markdownLabels: MarkdownLabelsLike,
 *   onToggleOption: (question: import('../form-model.js').Question, label: string) => void,
 * }} props - 所属题目、这个选项、当前是否选中、锁定状态与回调。
 * @returns {import('react').ReactNode} 这一项。
 */
function OptionRow({ question, option, checked, locked, t, markdownLabels, onToggleOption }) {
  const single = question.type === 'single';
  /** 整行点击：落在链接或按钮上的那次不切勾选（那是跳转，不是选这一项）。
   * @param {import('react').MouseEvent<HTMLElement>} event - 这次点击。 */
  const select = (event) => {
    if (!selectsOnClick(locked, event.target)) return;
    onToggleOption(question, option.label);
  };
  return (
    <div
      className={single ? 'dsg-option dsg-optionSingle' : 'dsg-option'}
      data-checked={String(checked)}
      onClick={select}
    >
      <input
        className="dsg-optionInput"
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={locked ? () => {} : () => onToggleOption(question, option.label)}
      />
      <span className="dsg-optionControl">
        {checked && !single ? <IconCheckOutlineRegular size={13} /> : null}
      </span>
      <div className="dsg-optionBody">
        <div className="dsg-optionLine">
          <div className="dsg-optionText">
            <MarkdownText text={option.label} labels={markdownLabels} variant="compact" />
          </div>
          {option.recommended ? <Tag tone="info" className="dsg-badge">{t('row.recommended')}</Tag> : null}
        </div>
        {option.detail === undefined ? null : (
          <div className="dsg-optionDetail">
            <MarkdownText text={option.detail} labels={markdownLabels} variant="compact" />
          </div>
        )}
      </div>
    </div>
  );
}