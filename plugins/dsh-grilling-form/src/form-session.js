// 表单会话（内壳）：一轮表单从投出到冻结的全部**组合规则**只有这一个 owner。
//
// 低层纯函数都在 form-model.js（取数、校验、导入协议、持久化），它们各自直接可测；这个模块
// 把它们的组合方式固定下来——此前那些组合方式散在视图组件里，靠注释 + 代码 + 渲染自检三方共守：
//
//   1. **两表不变量**：用户自己那份（storage 里读回来的、写操作交回去的）与页面显示那份不是
//      同一把表：显示层叠了推荐默认（冻结时改成按实发消息重画），写操作只能落到用户自己那份上。
//      把显示层整把存下来，默认就会变成「他的作答」，「取消过」与「没作答」也再分不开
//      （见 form-model 的 sanitizeAnswers）。
//   2. **写穿顺序**：每次改动先写 storage，再把新的用户表交回调用方去更新它那份 state。
//   3. **冻结三种来历分得开**：实发消息里有块就是「他答的那份」，块坏了才是退回本地那份，
//      根本没有块就是「没作答」——最后一种由内壳直接给空表，本地勾选（含推荐默认）不许冒充。
//   4. **导入门禁与草稿状态**：没有可导入的作答题时导入原样返回草稿；草稿里那段已经是当前
//      作答时按键就没用了（没块 = 还没导入、块旧了 = 要更新），状态是算出来的，不是记出来的。
//
// 纯函数：不碰 React、不读时钟、不读全局；storage 与 sessionId 由调用方传进来。

import {
  answerItems,
  applyImport,
  applyRecommendedDefaults,
  draftHasBody,
  formStorageKey,
  frozenFormAnswers,
  IMPORT_BLOCK_END,
  IMPORT_BLOCK_START,
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
 * @param {{ sessionId: unknown, callId: unknown, storage: import('./form-model.js').StorageLike|undefined }} input - 会话、轮次与存储。
 * @returns {import('./form-model.js').AnswerTable} 用户自己那份作答表（可能为空）。
 */
export function initialFormAnswers({ sessionId, callId, storage }) {
  return readStoredForm(storage, formStorageKey(sessionId), callId);
}

/**
 * 组装这一轮的表单会话：显示那份作答、导入门禁与草稿状态，以及几个写操作。
 * 每次渲染重新组装一份即可（纯函数），state 仍由调用方持有。
 * @param {{
 *   questions: import('./form-model.js').Question[],
 *   sessionId: unknown, callId: unknown,
 *   replyText: string|undefined,
 *   storedAnswers: import('./form-model.js').AnswerTable,
 *   storage: import('./form-model.js').StorageLike|undefined,
 *   draft: unknown,
 * }} input - questions：题面；sessionId / callId：存储与配对；replyText：实发消息
 *   （给了就是冻结态）；storedAnswers：用户自己那份；storage：带 getItem/setItem 的存储；
 *   draft：当前草稿（用来算「导入了没」「草稿里那份是不是已经旧了」，也是单选按回项的来源）。
 * @returns {{
 *   readOnly: boolean, unanswered: boolean, answers: import('./form-model.js').AnswerTable,
 *   canImport: boolean, draftState: 'empty'|'none'|'current'|'stale', draftBody: string,
 *   toggle: (id: string, label: string) => import('./form-model.js').AnswerTable,
 *   setCustom: (id: string, custom: string) => import('./form-model.js').AnswerTable,
 *   importInto: (draft: unknown) => string,
 * }} 表单会话。
 */
export function createFormSession({ questions, sessionId, callId, replyText, storedAnswers, storage, draft }) {
  const readOnly = replyText !== undefined;
  const stored = asAnswerTable(storedAnswers);
  // 显示那份：冻结按实发消息重画（块坏了才退回本地那份；没有块就是没作答），可填时叠上推荐默认。
  const frozen = readOnly ? frozenFormAnswers(questions, stored, replyText) : undefined;
  const answers = frozen === undefined ? applyRecommendedDefaults(questions, stored) : frozen.answers;
  const body = importBody(questions, answers);
  const canImport = !readOnly && body !== '';
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
   * 单选（题面上 multi_select: false）的勾选是**替换**：至多留一项，再勾一个就换掉上一个。
   * @param {string} id - 题目 id。
   * @param {Partial<import('./form-model.js').Answer> & {selected?: string[]}} change - 这一题要改的字段。
   * @returns {import('./form-model.js').AnswerTable} 用户自己那份的新表。
   */
  const editAnswer = (id, change) => {
    const question = questions.find((candidate) => candidate.id === id);
    const current = shownAnswer(id);
    const next = question?.multiSelect === false && change.selected !== undefined
      ? overwriteOne(current, { selected: change.selected })
      : { ...current, ...change };
    return commit(id, next);
  };
  /** 勾选 / 取消一个选项：界面按归一化后的 label 记，同一个 label 就是同一项。
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
  /** 导入：草稿里那段导入块换成当前作答（没有块就放在最前面），草稿里别的字一个不动。
   * @param {unknown} draftText - 当前草稿。
   * @returns {string} 新的草稿文本；没有可导入的作答时原样返回入参（它不是字符串时按空串算，
   *   与 applyImport 自己的兜底同一条）。 */
  const importInto = (draftText) => (
    canImport ? applyImport(draftText, body) : typeof draftText === 'string' ? draftText : ''
  );

  return {
    readOnly,
    unanswered: frozen === undefined ? false : frozen.unanswered,
    answers,
    canImport,
    draftState: draftStateOf({ readOnly, canImport, body, draft }),
    draftBody: body,
    toggle,
    setCustom,
    importInto,
  };
}

/**
 * 草稿里那段导入块相对当前作答的状态：`empty` 没有作答可导、`none` 还没导入、`current` 已经是
 * 当前这份、`stale` 有块但已经旧了。按键文案与「要不要提醒」都由它决定。
 * @param {{readOnly: boolean, canImport: boolean, body: string, draft: unknown}} input - 会话算出来的几件事。
 * @returns {'empty'|'none'|'current'|'stale'} 状态。
 */
function draftStateOf({ readOnly, canImport, body, draft }) {
  if (readOnly || !canImport) return 'empty';
  if (draftHasBody(draft, body)) return 'current';
  return draftHasBlock(draft) ? 'stale' : 'none';
}

/** 草稿里有没有一个起止行配对的导入块（内容是旧的也算有）。
 * @param {unknown} draft - 当前草稿。
 * @returns {boolean} 有配对的块时为 true。 */
function draftHasBlock(draft) {
  if (typeof draft !== 'string') return false;
  const start = draft.indexOf(IMPORT_BLOCK_START);
  if (start === -1) return false;
  return draft.indexOf(IMPORT_BLOCK_END, start + IMPORT_BLOCK_START.length) !== -1;
}
