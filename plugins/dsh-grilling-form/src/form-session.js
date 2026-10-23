// 表单作答过程（内壳）：一轮表单从投出到冻结的全部**组合规则**只有这一个 owner。
//
// 低层纯函数都在 form-model.js（取数、校验、作答块协议、持久化），它们各自直接可测；这个模块
// 把它们的组合方式固定下来，视图组件只持 state 并照着渲染：
//
//   1. **两表不变量**：用户自己那份（storage 里读回来的、写操作交回去的）与页面显示那份不是
//      同一把表：显示层叠了推荐默认（冻结时改成按实发消息重画），写操作只能落到用户自己那份上。
//      把显示层整把存下来，默认就会变成「他的作答」，「取消过」与「没作答」也再分不开
//      （见 form-model 的 sanitizeAnswers）。
//   2. **写穿顺序**：每次改动先写 storage，再把新的用户表交回调用方去更新它那份 state。
//   3. **冻结两种来历分得开**：自己的作答块到了就是「他答的那份」，块坏了才退回本地那份。
//      没有块不算冻结——表还在等作答，调用方也不该把它按只读画。
//   4. **导入门禁与草稿状态**：只要没冻结点下去就能导（空作答也导得出去），所以门禁只剩
//      「冻结了没」一条；草稿里那段已经是当前作答时按键就没用了（没块 = 还没导入、
//      块旧了 = 要更新），状态是算出来的，不是记出来的。
//   5. **取代时的两件搬运**：勾选按题干原文一模一样从旧表搬过来（见 carryOverAnswers），
//      用户点导入时草稿里旧表那块换成新表那块（见 carryImport）——草稿只在用户按键时动，
//      插件不会在他没按的时候往里写。
//
// 纯函数：不碰 React、不读时钟、不读全局；storage 与 sessionId 由调用方传进来。

import {
  applyImport,
  applyRecommendedDefaults,
  carryImport,
  carryOverAnswers,
  draftHasBody,
  formStorageKey,
  frozenFormAnswers,
  importBlockBody,
  importBody,
  readStoredForm,
  writeStoredForm,
} from './form-model.js';

/** 作答表要的是「记录」形状；给别的形状就当成空表，交给写操作去建。
 * @param {unknown} value - 待判定的值。
 * @returns {import('./form-model.js').AnswerTable} 记录形状的那份；不是记录时为空表。 */
function asAnswerTable(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {import('./form-model.js').AnswerTable} */ (value)
    : {};
}

/** 单选的一题：至多留一项——勾上一个就换掉上一个（取最新勾的那个），取消到空就是空。
 * @param {import('./form-model.js').Answer} existing - 该题当前的作答。
 * @param {{selected: string[]}} answers - 这次改动带来的作答。
 * @returns {import('./form-model.js').Answer} 至多一项的作答。 */
function overwriteOne(existing, answers) {
  const { selected } = answers;
  const kept = selected.length <= 1 ? selected : [selected[selected.length - 1]];
  return { selected: kept, custom: existing.custom };
}

/**
 * 从 storage 读回用户自己那份作答。挂载时调一次，作为组件 state 的初值。
 * @param {{
 *   sessionId: unknown, callId: unknown,
 *   storage: import('./form-model.js').StorageLike|undefined,
 *   carried: import('./form-model.js').AnswerTable|undefined,
 * }} input - 会话、轮次、存储，以及从被取代那张表搬过来的作答。
 * @returns {import('./form-model.js').AnswerTable} 用户自己那份作答表（可能为空）。
 */
export function initialFormAnswers({ sessionId, callId, storage, carried }) {
  const own = readStoredForm(storage, formStorageKey(sessionId), callId);
  // 这一轮自己那份优先：用户已经动过的地方，搬运过来的旧勾选不许盖回去。
  return carried === undefined ? own : { ...carried, ...own };
}

/**
 * 从被取代那张表上搬过来的作答：题干原文一模一样的题才有，勾选只留新表还认得的那些。
 * @param {{
 *   sessionId: unknown, storage: import('./form-model.js').StorageLike|undefined,
 *   replaced: { callId: unknown, questions: import('./form-model.js').Question[] }|undefined,
 *   questions: import('./form-model.js').Question[],
 * }} input - 会话与存储、被取代的那张表、新表的题面。
 * @returns {import('./form-model.js').AnswerTable|undefined} 搬过来的作答；没有取代者时 undefined。
 */
export function carriedAnswers({ sessionId, storage, replaced, questions }) {
  if (replaced === undefined) return undefined;
  const old = readStoredForm(storage, formStorageKey(sessionId), replaced.callId);
  return carryOverAnswers(replaced.questions, questions, old);
}

/**
 * 组装这一轮的表单作答过程：显示那份作答、导入门禁与草稿状态，以及几个写操作。
 * 每次渲染重新组装一份即可（纯函数），state 仍由调用方持有。
 * @param {{
 *   questions: import('./form-model.js').Question[],
 *   sessionId: unknown, callId: unknown, replacedCallId: unknown,
 *   replyText: string|undefined, superseded: boolean,
 *   storedAnswers: import('./form-model.js').AnswerTable,
 *   storage: import('./form-model.js').StorageLike|undefined,
 *   draft: unknown,
 * }} input - questions：题面；sessionId / callId：存储与配对；replacedCallId：被这张表取代的那张的
 *   id（用户点导入时把草稿里旧表那块换成这张表的）；replyText：实发消息里那张作答块（给了就是冻结态）；
 *   superseded：后面那张把它取代了；storedAnswers：用户自己那份；storage：带 getItem/setItem 的存储；
 *   draft：当前草稿（用来算「导入了没」「草稿里那份是不是已经旧了」）。
 * @returns {{
 *   readOnly: boolean, superseded: boolean, fallback: boolean,
 *   answers: import('./form-model.js').AnswerTable,
 *   draftState: 'empty'|'none'|'current'|'stale', draftBody: string,
 *   toggle: (id: string, label: string) => import('./form-model.js').AnswerTable,
 *   setCustom: (id: string, custom: string) => import('./form-model.js').AnswerTable,
 *   importInto: (draft: unknown) => string,
 * }} 表单作答过程。
 */
export function createFormSession({ questions, sessionId, callId, replacedCallId, replyText, superseded, storedAnswers, storage, draft }) {
  // 被取代的表只剩一行说明，跟冻结一样不可填、不可导。
  const readOnly = replyText !== undefined || superseded === true;
  const stored = asAnswerTable(storedAnswers);
  // 显示那份：冻结按实发消息重画（块坏了才退回本地那份），可填时叠上推荐默认。
  const frozen = replyText === undefined ? undefined : frozenFormAnswers(questions, stored, replyText, callId);
  const answers = frozen === undefined ? applyRecommendedDefaults(questions, stored) : frozen.answers;
  const body = importBody(questions, answers);
  const storageKey = formStorageKey(sessionId);

  /** 写穿：冻结之后一律不写（改不了了），返回的是**用户自己那份**的新表。
   * @param {string} id - 题目 id。
   * @param {import('./form-model.js').Answer} next - 这一题的新作答。
   * @returns {import('./form-model.js').AnswerTable} 用户自己那份的新表。 */
  const commit = (id, next) => {
    if (readOnly) return stored;
    const merged = { ...stored, [id]: next };
    writeStoredForm(storage, storageKey, callId, merged);
    return merged;
  };
  /** 这一题此刻显示的那份作答；没有就是空的一份。
   * @param {string} id - 题目 id。
   * @returns {import('./form-model.js').Answer} 该题显示中的作答。 */
  const shownAnswer = (id) => answers[id] ?? { selected: [], custom: '' };
  /**
   * 改一题：以显示那份为底改一个字段，再整条写进用户自己那份（两表不变量就靠这一条）。
   * 单选（题面 type 为 single）的勾选是**替换**：至多留一项，再勾一个就换掉上一个。
   * @param {string} id - 题目 id。
   * @param {Partial<import('./form-model.js').Answer> & {selected?: string[]}} change - 这一题要改的字段。
   * @returns {import('./form-model.js').AnswerTable} 用户自己那份的新表。
   */
  const editAnswer = (id, change) => {
    const question = questions.find((candidate) => candidate.id === id);
    const current = shownAnswer(id);
    const next = question?.type === 'single' && change.selected !== undefined
      ? overwriteOne(current, { selected: change.selected })
      : { ...current, ...change };
    return commit(id, next);
  };
  /** 勾选 / 取消一个选项：界面按 label 记，同一个 label 就是同一项。
   * @param {string} id - 题目 id。
   * @param {string} label - 选项身份。
   * @returns {import('./form-model.js').AnswerTable} 用户自己那份的新表。 */
  const toggle = (id, label) => {
    const { selected } = shownAnswer(id);
    return editAnswer(id, {
      selected: selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label],
    });
  };
  /** 每题的自填空：选项覆盖不到的情况写在这里。
   * @param {string} id - 题目 id。
   * @param {string} custom - 自填文字。
   * @returns {import('./form-model.js').AnswerTable} 用户自己那份的新表。 */
  const setCustom = (id, custom) => commit(id, { ...shownAnswer(id), custom });
  /** 导入：草稿里这张表的块换成当前作答（没有就放在最前面），草稿里别的字一个不动；
   * 这一轮取代了前面那张表时，旧表那块一并拿掉换成这张表的。一项作答都没有也照导——
   * 空块本身就是「我明确什么都没选」这一次作答。
   * @param {unknown} draftText - 当前草稿。
   * @returns {string} 新的草稿文本；冻结（含被取代）时原样返回入参（它不是字符串时按空串算）。 */
  const importInto = (draftText) => (
    readOnly
      ? (typeof draftText === 'string' ? draftText : '')
      : replacedCallId === undefined
        ? applyImport(draftText, body, callId)
        : carryImport(draftText, replacedCallId, body, callId)
  );

  return {
    readOnly,
    superseded: superseded === true,
    fallback: frozen === undefined ? false : frozen.fallback,
    answers,
    draftState: draftStateOf({ readOnly, body, draft, callId }),
    draftBody: body,
    toggle,
    setCustom,
    importInto,
  };
}

/**
 * 草稿里这张表的块相对当前作答的状态：`empty` 冻结了没得导、`none` 还没导入、`current` 已经是
 * 当前这份、`stale` 有这张表的块但已经旧了。按键文案由它决定。
 * @param {{readOnly: boolean, body: string, draft: unknown, callId: unknown}} input - 会话算出来的几件事。
 * @returns {'empty'|'none'|'current'|'stale'} 状态。
 */
function draftStateOf({ readOnly, body, draft, callId }) {
  if (readOnly) return 'empty';
  if (draftHasBody(draft, body, callId)) return 'current';
  return importBlockBody(draft, callId) === undefined ? 'none' : 'stale';
}
