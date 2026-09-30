// grilling_form 的共用纯模型：宿主半边的入参校验、界面半边的取数与作答导入，全在这一个模块里。
//
// 两端必须一致的两件事都只有这一份实现：题号并入标题的拼法（宿主不拼、界面拼，但模型自己
// 宣布的 Q 编号要对得上），以及归一化后的 option label 认选项（宿主按它查重、界面按它存勾选、
// 生成导入文本时再换回模型原本写的 label）。各写一份必然漂。
//
// 纯函数：不碰 React、不读时钟、不读会话。localStorage 由调用方传进来（见文件末尾的存储ported 函数）。

import { normalizeOption } from './recommendation.js';

/** 导入块的起止行：重复导入时靠它认出上一次导入的那一段，原地替换。 */
export const IMPORT_BLOCK_START = '【盘问作答】';
export const IMPORT_BLOCK_END = '【/盘问作答】';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
 * 去掉首尾空白后是否为空。空串与纯空白都不值得送进表单。
 * @param {unknown} value - 待判定的值。
 * @returns {boolean} 非字符串或去空白后为空时为 true。
 */
export function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * 把题号并进标题：两者都给写作 `<number> · <header>`，只给一个就是那一个；
 * 标题已经以该题号开头时原样用它（模型常自己写成 "Q2 · Deadline"）。
 * @param {string} [number] - 题号。
 * @param {string} [header] - 标题。
 * @returns {string} 界面标题；两者都缺时为空串（调用方据此退回题干）。
 */
export function mergeNumberIntoHeader(number, header) {
  const num = isBlank(number) ? undefined : number;
  const head = isBlank(header) ? undefined : header;
  if (num === undefined) return head ?? '';
  if (head === undefined) return num;
  return head.startsWith(num) ? head : `${num} · ${head}`;
}

/**
 * 一道题在界面与导入文本里的标题：题号并入后的标题优先，没有就用题干，再没有就用 id。
 * @param {{ id: string, header: string, question: string }} question - 题目模型。
 * @returns {string} 标题。
 */
export function titleOf(question) {
  if (!isBlank(question.header)) return question.header;
  if (!isBlank(question.question)) return question.question;
  return question.id;
}

/**
 * 这一轮的入参能不能画成表单。只拦表单根本表示不了的东西；题干与选项的分工仍是引导，
 * 不做校验（子串匹配会误拒合法题干，坏题干好过假拒绝）。
 * @param {object[]} questions - 模型给的 questions。
 * @returns {string[]} 逐条违规说明；空数组表示这一轮可以投出去。
 */
export function validateRound(questions) {
  const violations = [];
  const seenIds = new Set();
  questions.forEach((question, questionIndex) => {
    const where = `Question ${questionIndex + 1} (id ${JSON.stringify(question.id)})`;
    if (typeof question.id === 'string') {
      if (seenIds.has(question.id)) {
        violations.push(`${where} repeats an id already used in this round; the form keys each answer by id, so ids must be unique`);
      }
      seenIds.add(question.id);
    }
    if (isBlank(question.question)) {
      violations.push(`${where} has an empty question text; write the question itself in question and its body in detail`);
    }
    const seenLabels = new Set();
    (question.options ?? []).forEach((option, optionIndex) => {
      const label = normalizeOption(option).label;
      if (isBlank(label)) {
        violations.push(`${where}, option ${optionIndex + 1} has an empty label; every option needs a label the user can read and pick`);
        return;
      }
      if (seenLabels.has(label)) {
        violations.push(`${where} has two options that render with the same label ${JSON.stringify(label)}; the form identifies a choice by its label, so make them differ`);
        return;
      }
      seenLabels.add(label);
    });
  });
  return violations;
}

/**
 * argsRaw → 模型出的题。解析失败、没有 questions、或 id 重复（界面按 id 配对，重复即无从配对）时返回空数组。
 * @param {unknown} argsRaw - 调用的原始参数文本。
 * @returns {object[]} 题目模型。
 */
function readQuestions(argsRaw) {
  const parsed = parseJson(argsRaw);
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return [];
  const questions = [];
  const ids = new Set();
  for (const question of parsed.questions) {
    if (!isRecord(question) || typeof question.id !== 'string' || ids.has(question.id)) return [];
    ids.add(question.id);
    const options = (Array.isArray(question.options) ? question.options : [])
      .filter((option) => isRecord(option))
      .map((option) => {
        const normalized = normalizeOption(option);
        return {
          // 界面按 label 认选项（宿主已保证同题内唯一），显示用 cleanLabel、徽标另画，
          // 导入文本也用 cleanLabel：模型写的推荐标记不会跟着用户的消息发回去。
          label: normalized.label,
          displayLabel: normalized.cleanLabel,
          description: normalized.description,
          recommended: normalized.recommended,
        };
      });
    questions.push({
      id: question.id,
      header: mergeNumberIntoHeader(question.number, question.header),
      question: typeof question.question === 'string' ? question.question : '',
      detail: isBlank(question.detail) ? undefined : question.detail,
      options,
    });
  }
  return questions;
}

/**
 * 结果文本 → 这一轮投出去之后发生了什么。
 * @param {unknown} resultText - 工具结果里的文本。
 * @returns {{rejected: boolean, pending: boolean, violations: string[], error: string|undefined}|undefined}
 *   形状不认识时返回 undefined（调用方按调用失败处理）。
 */
function readResult(resultText) {
  const parsed = parseJson(resultText);
  if (!isRecord(parsed)) return undefined;
  if (parsed.rejected === true) {
    return {
      rejected: true,
      pending: false,
      violations: stringList(parsed.violations),
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
    };
  }
  if (parsed.pending === true) return { rejected: false, pending: true, violations: [], error: undefined };
  return undefined;
}

/**
 * 读出一个表单行的模型：题面来自 argsRaw，状态来自结果。
 * @param {{ argsRaw?: unknown, resultText?: unknown, failed?: boolean }} input - argsRaw：调用的原始参数；
 *   resultText：结果文本（还没落库时为空）；failed：这次调用是否以失败收场。
 * @returns {{
 *   state: 'running'|'form'|'rejected'|'error',
 *   questions: object[], violations: string[], error: string|undefined,
 * }} 表单模型；questions 为空表示参数还解析不出来（运行中或不是本插件的形状）。
 */
export function readFormModel({ argsRaw, resultText, failed = false }) {
  const questions = readQuestions(argsRaw);
  const result = readResult(resultText);
  let state;
  if (result !== undefined) state = result.rejected ? 'rejected' : 'form';
  else if (failed) state = 'error';
  else if (typeof resultText === 'string' && resultText !== '') state = 'error';
  else state = 'running';
  return {
    state,
    questions,
    violations: result === undefined ? [] : result.violations,
    error: result === undefined ? undefined : result.error,
  };
}

/**
 * 归一化 localStorage 里读回来的作答：只认 `{[id]: {selected, custom}}` 这个形状。
 * @param {unknown} value - 解析出来的值。
 * @returns {object} 干净的作答表。
 */
function sanitizeAnswers(value) {
  if (!isRecord(value)) return {};
  const answers = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!isRecord(answer)) continue;
    const selected = stringList(answer.selected);
    const custom = typeof answer.custom === 'string' ? answer.custom : '';
    if (selected.length === 0 && custom === '') continue;
    answers[id] = { selected, custom };
  }
  return answers;
}

/**
 * 这一轮里一道题的作答，选中的项换回给人看的文字（不带「（推荐）」后缀）。
 * @param {object} question - 题目模型。
 * @param {{selected?: string[], custom?: string}|undefined} answer - 该题的作答。
 * @returns {{selected: string[], custom: string}} 展示用的作答；没作答时两样都空。
 */
export function answerParts(question, answer) {
  if (!isRecord(answer)) return { selected: [], custom: '' };
  const shown = new Map(question.options.map((option) => [option.label, option.displayLabel]));
  return {
    selected: stringList(answer.selected).map((label) => shown.get(label) ?? label),
    custom: typeof answer.custom === 'string' ? answer.custom.trim() : '',
  };
}

/**
 * 这一轮里一道题的作答文本；没作答返回 undefined。
 * @param {object} question - 题目模型。
 * @param {{selected?: string[], custom?: string}|undefined} answer - 该题的作答。
 * @returns {string|undefined} `选的项、自填的字`，只算上真的写了的。
 */
function answerTextOf(question, answer) {
  const { selected, custom } = answerParts(question, answer);
  const parts = [...selected, ...(custom === '' ? [] : [custom])];
  return parts.length === 0 ? undefined : parts.join('、');
}

/**
 * 生成导入文本的正文：逐题一行「标题：你选的项／你自填的字」，只含有作答的题。
 * 一行都没有时返回空串（调用方据此禁用导入、也不显示未导入提醒）。
 * @param {object[]} questions - 题目模型。
 * @param {object} answers - 作答表。
 * @returns {string} 正文（不含导入块的起止行）。
 */
export function importBody(questions, answers) {
  const lines = [];
  for (const question of questions) {
    const text = answerTextOf(question, answers[question.id]);
    if (text === undefined) continue;
    lines.push(`${titleOf(question)}：${text}`);
  }
  return lines.join('\n');
}

/**
 * 导入块在草稿里的位置。起止行不配对时按没有块处理。
 * @param {unknown} draft - 输入框草稿。
 * @returns {{start: number, end: number}|undefined} 块的绝对区间；end 是收尾行之后的位置。
 */
function findImportBlock(draft) {
  if (typeof draft !== 'string') return undefined;
  const start = draft.indexOf(IMPORT_BLOCK_START);
  if (start === -1) return undefined;
  const stop = draft.indexOf(IMPORT_BLOCK_END, start + IMPORT_BLOCK_START.length);
  if (stop === -1) return undefined;
  return { start, end: stop + IMPORT_BLOCK_END.length };
}

function blockTextOf(body) {
  return `${IMPORT_BLOCK_START}\n${body}\n${IMPORT_BLOCK_END}`;
}

/**
 * 把作答导入草稿：草稿里已有导入块就原地替换它本身（块外的字一个不动），
 * 没有就把块放在最前面、用户原有的文字整段接在后面。
 * @param {unknown} draft - 当前草稿。
 * @param {string} body - importBody 的产物；空串时原样返回草稿。
 * @returns {string} 新的草稿文本。
 */
export function applyImport(draft, body) {
  const text = typeof draft === 'string' ? draft : '';
  if (body === '') return text;
  const block = blockTextOf(body);
  const current = findImportBlock(text);
  if (current !== undefined) return text.slice(0, current.start) + block + text.slice(current.end);
  return text === '' ? block : `${block}\n\n${text}`;
}

/**
 * 草稿里那段导入块现在是不是就是这份作答。表单填了东西却没导进去（或导入后又改了）
 * 就为 true——界面据此显示未导入提醒。平台没有发送前的提交钩子，提醒只能是提醒。
 * @param {unknown} draft - 当前草稿。
 * @param {string} body - importBody 的产物；空串（表单里什么都没有）时恒为 false。
 * @returns {boolean} 是否需要提醒。
 */
export function importStale(draft, body) {
  if (body === '') return false;
  const current = findImportBlock(draft);
  if (current === undefined) return true;
  const inner = draft.slice(current.start + IMPORT_BLOCK_START.length, current.end - IMPORT_BLOCK_END.length);
  return inner.replace(/^\n/, '').replace(/\n$/, '') !== body;
}

/**
 * 这一轮是否已经过去：记录里出现了这条调用之后（seq 更大）的用户发言。
 * 认不出这条调用、或界面还拿不到记录时一律返回 false——把表单当只读卡住比多显示一次可编辑
 * 更糟（答案没地方写）。
 * @param {unknown} nodes - chat 视图的 legacy.nodes。
 * @param {unknown} callId - 本次工具调用的 callId。
 * @returns {boolean} 是否转只读。
 */
export function isReadOnlyAfter(nodes, callId) {
  if (!Array.isArray(nodes)) return false;
  const mine = nodes.find((node) => isRecord(node) && node.callId === callId);
  if (mine === undefined || typeof mine.seq !== 'number') return false;
  return nodes.some((node) => (
    isRecord(node)
    && (node.kind === 'user' || node.kind === 'steering')
    && typeof node.seq === 'number'
    && node.seq > mine.seq
  ));
}

// --- 持久化：storage 由调用方传进来（浏览器是 localStorage，测试是假件），本模块不自己取全局 ---

/**
 * 表单状态在 storage 里的键：按会话分一份，一份里按 callId 存每一轮的勾选与自填。
 * @param {unknown} sessionId - 当前会话 id。
 * @returns {string} storage 键。
 */
export function formStorageKey(sessionId) {
  const scope = typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'unknown-session';
  return `dsh-grilling-form.${scope}`;
}

function readStorage(storage, key) {
  if (storage === undefined || storage === null || typeof storage.getItem !== 'function') return {};
  try {
    const parsed = parseJson(storage.getItem(key));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 读回本轮的作答。storage 不可用、键不存在、值形状不对都只是「什么都没选」。
 * @param {object|undefined} storage - 带 getItem/setItem 的存储（可为 undefined）。
 * @param {string} key - formStorageKey 的产物。
 * @param {string} callId - 本次调用的 callId。
 * @returns {object} 作答表。
 */
export function readStoredForm(storage, key, callId) {
  const all = readStorage(storage, key);
  return sanitizeAnswers(all[callId]);
}

/**
 * 存下本轮的作答，不动同一个会话里别的轮次。存不进去（配额、隐私模式）只让这一份活在内存里。
 * @param {object|undefined} storage - 带 getItem/setItem 的存储（可为 undefined）。
 * @param {string} key - formStorageKey 的产物。
 * @param {string} callId - 本次调用的 callId。
 * @param {object} answers - 作答表。
 * @returns {void}
 */
export function writeStoredForm(storage, key, callId, answers) {
  if (storage === undefined || storage === null || typeof storage.setItem !== 'function') return;
  const all = readStorage(storage, key);
  try {
    storage.setItem(key, JSON.stringify({ ...all, [callId]: sanitizeAnswers(answers) }));
  } catch {
    // 配额满 / 隐私模式：表单照常在内存里能填，只是刷新后不恢复
  }
}
