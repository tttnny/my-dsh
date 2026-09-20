// 一次 ask_user_grilling 调用的卡片模型：把线上那两份 JSON（调用的 argsRaw、结果的文本）
// 翻成界面直接能画的结构。纯函数：不碰 React、不读时钟、不读会话，实时渲染与日志重放同一条路径。
//
// 与官方卡（@deepseek-ai/dsh-client-ui-tool 的 AskQuestionRow）的取数差别有两处，都是本插件
// 自己造成的：轮末补充题是宿主追加的，不在 argsRaw 里；detail 也不在官方卡的取数范围内。
// 所以这里按 id 配对之后，把 argsRaw 里没有的答案按轮末补充题另行列出，并把 detail 一起带出去。

import { ROUND_END_QUESTION, isBlank, mergeNumberIntoHeader } from './contract.js';

/** 用户取消 / 中断时宿主工具收到的错误码，界面据此给出未作答的说明。 */
const CANCELLED_CODE = 'ASK_CANCELLED';
const INTERRUPTED_CODE = 'ASK_ABORTED';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON.parse，失败返回 undefined。running 时 argsRaw 是半截 JSON，解析失败是正常态。
 * @param {unknown} text - 原始文本。
 * @returns {unknown} 解析结果，或 undefined。
 */
function parseJson(text) {
  if (typeof text !== 'string' || text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/**
 * argsRaw → 模型出的题。解析失败、没有 questions、或 id 重复（界面按 id 配对，重复即无从配对）时返回空数组。
 * @param {unknown} argsRaw - 调用的原始参数文本。
 * @returns {object[]} 题目条目。
 */
function readQuestions(argsRaw) {
  const parsed = parseJson(argsRaw);
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return [];
  const questions = [];
  const ids = new Set();
  for (const question of parsed.questions) {
    if (!isRecord(question) || typeof question.id !== 'string' || ids.has(question.id)) return [];
    ids.add(question.id);
    questions.push({
      id: question.id,
      header: mergeNumberIntoHeader(question.number, question.header),
      question: typeof question.question === 'string' ? question.question : '',
      detail: isBlank(question.detail) ? undefined : question.detail,
      answers: [],
      supplement: false,
    });
  }
  return questions;
}

/**
 * 结果文本 → 答案记录。形状不认识时返回 undefined（调用方按调用失败处理）。
 * @param {unknown} resultText - 工具结果里的文本。
 * @returns {{rejected: boolean, violations: string[], error: string|undefined, answers: object[]}|undefined}
 */
function readResult(resultText) {
  const parsed = parseJson(resultText);
  if (!isRecord(parsed)) return undefined;
  if (parsed.rejected === true) {
    return {
      rejected: true,
      violations: stringList(parsed.violations),
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
      answers: [],
    };
  }
  if (!Array.isArray(parsed.answers)) return undefined;
  const answers = [];
  for (const entry of parsed.answers) {
    if (!isRecord(entry) || typeof entry.id !== 'string') return undefined;
    answers.push({
      id: entry.id,
      selected: stringList(entry.selected),
      custom: typeof entry.custom === 'string' ? entry.custom : undefined,
    });
  }
  return { rejected: false, violations: [], error: undefined, answers };
}

/**
 * 读出一张卡的模型。
 * @param {{ argsRaw?: unknown, resultText?: unknown, errorCode?: unknown, failed?: boolean }} input
 *   argsRaw：调用的原始参数；resultText：结果文本（running 时为空）；errorCode：失败的 code；
 *   failed：这次调用是否以失败收场（结果既没有答案也不是拒绝时用来区分「运行中」与「失败」）。
 * @returns {{
 *   state: 'running'|'answered'|'rejected'|'cancelled'|'interrupted'|'error',
 *   questions: object[], answered: number, total: number,
 *   violations: string[], error: string|undefined,
 * }} 卡片模型；questions 为空表示参数还解析不出来（运行中或不是本插件的形状）。
 */
export function readAskCard({ argsRaw, resultText, errorCode, failed = false }) {
  const questions = readQuestions(argsRaw);
  const known = new Set(questions.map((question) => question.id));
  const result = readResult(resultText);

  let state;
  if (errorCode === CANCELLED_CODE) state = 'cancelled';
  else if (errorCode === INTERRUPTED_CODE) state = 'interrupted';
  else if (result !== undefined) state = result.rejected ? 'rejected' : 'answered';
  else if (failed) state = 'error';
  else if (typeof resultText === 'string' && resultText !== '') state = 'error';
  else state = 'running';

  if (state === 'answered') {
    for (const answer of result.answers) {
      const lines = [
        ...answer.selected,
        ...answer.custom === undefined || answer.custom === '' ? [] : [answer.custom],
      ];
      const entry = questions.find((question) => question.id === answer.id);
      if (entry !== undefined) {
        entry.answers = lines;
        continue;
      }
      const supplement = answer.id === ROUND_END_QUESTION.id;
      questions.push({
        id: answer.id,
        header: supplement ? ROUND_END_QUESTION.header : '',
        question: supplement ? ROUND_END_QUESTION.question : answer.id,
        detail: undefined,
        answers: lines,
        supplement: true,
      });
    }
  } else if ((state === 'running' || state === 'cancelled' || state === 'interrupted') && questions.length > 0) {
    // 这一轮真的进过表单（正在回答 / 被取消 / 被中断）：补充题也在表单里，按常量补一条出来。
    // 被拒与调用失败都没走到表单，补上去等于报告一道没问过的题；参数还解析不出来时同理——
    // 那是 argsRaw 还在流式传输，界面退回原始文本，不假装读懂了这一轮。
    if (!known.has(ROUND_END_QUESTION.id)) {
      questions.push({
        id: ROUND_END_QUESTION.id,
        header: ROUND_END_QUESTION.header,
        question: ROUND_END_QUESTION.question,
        detail: undefined,
        answers: [],
        supplement: true,
      });
    }
  }

  return finish(state, questions, result);
}

/**
 * 收口：算已答数并带上拒绝信息。
 * @param {string} state - 卡片状态。
 * @param {object[]} questions - 条目列表。
 * @param {object|undefined} result - 解析出的结果记录。
 * @returns {object} 卡片模型。
 */
function finish(state, questions, result) {
  return {
    state,
    questions,
    answered: questions.filter((question) => question.answers.length > 0).length,
    total: questions.length,
    violations: result === undefined ? [] : result.violations,
    error: result === undefined ? undefined : result.error,
  };
}
