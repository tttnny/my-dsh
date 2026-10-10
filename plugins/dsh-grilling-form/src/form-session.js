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
//   3. **冻结**：实发消息在场就是冻结态——显示层按实发消息重画，写操作与导入一律关掉。
//   4. **导入门禁**：没有可导入的作答题时，导入原样返回草稿。
//
// 纯函数：不碰 React、不读时钟、不读全局；storage 与 sessionId 由调用方传进来。

import {
  answerLines,
  applyImport,
  applyRecommendedDefaults,
  formStorageKey,
  frozenAnswers,
  importBody,
  readStoredForm,
  writeStoredForm,
} from './form-model.js';

/** 作答表要的是「记录」形状；给别的形状就当成空表，交给写操作去建。 */
function asAnswerTable(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 从 storage 读回用户自己那份作答。挂载时调一次，作为组件 state 的初值。
 * @param {{ sessionId: unknown, callId: unknown, storage: object|undefined }} input - 会话、轮次与存储。
 * @returns {object} 用户自己那份作答表（可能为空）。
 */
export function initialFormAnswers({ sessionId, callId, storage }) {
  return readStoredForm(storage, formStorageKey(sessionId), callId);
}

/**
 * 组装这一轮的表单会话：显示那份作答、进度、导入门禁，以及三个写操作。
 * 每次渲染重新组装一份即可（纯函数），state 仍由调用方持有。
 * @param {object} input - questions：题面；sessionId / callId：存储与配对；replyText：实发消息
 *   （给了就是冻结态）；storedAnswers：用户自己那份；storage：带 getItem/setItem 的存储。
 * @returns {{
 *   readOnly: boolean, answers: object, answered: number, canImport: boolean,
 *   toggle: (id: string, label: string) => object,
 *   setCustom: (id: string, custom: string) => object,
 *   importInto: (draft: unknown) => string,
 * }} 表单会话。
 */
export function createFormSession({ questions, sessionId, callId, replyText, storedAnswers, storage }) {
  const readOnly = replyText !== undefined;
  const stored = asAnswerTable(storedAnswers);
  // 显示那份：冻结按实发消息重画（反解拿不到才退回本地那份），可填时叠上推荐默认。
  const answers = readOnly
    ? frozenAnswers(questions, stored, replyText)
    : applyRecommendedDefaults(questions, stored);
  const body = importBody(questions, answers);
  const canImport = !readOnly && body !== '';
  const answered = questions.filter((question) => answerLines(question, answers[question.id]).length > 0).length;
  const storageKey = formStorageKey(sessionId);

  /** 写穿：冻结之后一律不写（改不了了），返回的是**用户自己那份**的新表。 */
  const commit = (id, next) => {
    if (readOnly) return stored;
    const merged = { ...stored, [id]: next };
    writeStoredForm(storage, storageKey, callId, merged);
    return merged;
  };
  /** 这一题此刻显示的那份作答；没有就是空的一份。 */
  const shownAnswer = (id) => answers[id] ?? { selected: [], custom: '' };
  /** 改一题：以显示那份为底改一个字段，再整条写进用户自己那份（两表不变量就靠这一条）。 */
  const editAnswer = (id, change) => commit(id, { ...shownAnswer(id), ...change });
  /** 勾选 / 取消一个选项：界面按归一化后的 label 记，同一个 label 就是同一项。 */
  const toggle = (id, label) => {
    const { selected } = shownAnswer(id);
    return editAnswer(id, {
      selected: selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label],
    });
  };
  /** 每题的自填空：选项覆盖不到的情况写在这里。 */
  const setCustom = (id, custom) => editAnswer(id, { custom });
  /** 导入：草稿里那段导入块换成当前作答（没有块就放在最前面），草稿里别的字一个不动。 */
  const importInto = (draft) => (canImport ? applyImport(draft, body) : draft);

  return { readOnly, answers, answered, canImport, toggle, setCustom, importInto };
}
