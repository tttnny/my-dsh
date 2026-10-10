// grilling_form 的共用纯模型：宿主半边的入参校验、界面半边的取数与作答导入，全在这一个模块里。
//
// 两端必须一致的两件事都只有这一份实现：题号并入标题的拼法（宿主不拼、界面拼，但模型自己
// 宣布的 Q 编号要对得上），以及归一化后的 option label 认选项（宿主按它查重、界面按它存勾选、
// 生成导入文本时再换回模型原本写的 label）。各写一份必然漂。
//
// 纯函数：不碰 React、不读时钟、不读会话。localStorage 由调用方传进来（见文件末尾那组以 storage 为参数的函数）。

import { normalizeOption } from './recommendation.js';

/** 导入块的起止行：重复导入时靠它认出上一次导入的那一段，原地替换。 */
export const IMPORT_BLOCK_START = '【盘问作答】';
export const IMPORT_BLOCK_END = '【/盘问作答】';

/** 本插件的 wire 工具名：浏览器半边靠它在本轮里认出那次调用。 */
export const TOOL_NAME = 'grilling_form';

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

/** 展开正文里一行的排版符号：列表符号（含「1）」这种全角写法）、小标题、引用块，去掉之后才看得出它是不是从选项名开的头。 */
const LINE_MARKERS = /^\s*(?:[-*+]\s+|\d+[.)、）]\s*|#{1,6}\s+|>\s*)+/;
/** 行内强调符号：`**甲**`、`*甲*` 与 `甲` 是同一个选项名。 */
const INLINE_MARKERS = /[*_`]/g;
/** 选项标签里第一个分隔符之前的那一段，就是它在展开正文里会以什么样子开头。 */
const LABEL_ALIAS_END = /[：:·、，,。;；!！?？(（)）\-–—\s]/;
/** 别名（其后可以有一个空格）跟这些符号才算同一个条目。只认「名：解释」那一类分隔符：
 * 顿号与逗号不算，否则正文里「甲、乙两种做法各有代价」这种正经的共用背景会被误拒。 */
const ALIAS_FOLLOW_CHAR = /[：:·）)\-–—>]/;
/** 作答回填的项分隔符：导入文本用它连接（importBody）、反解按它拆分（parseImportedAnswers），
 * 所以选项的展示文字里带它就没法原样回填，见 validateRound 的这条规则。 */
const IDEOGRAPHIC_COMMA = '、';

function shorten(text) {
  return text.length <= 60 ? text : `${text.slice(0, 60)}…`;
}

/**
 * 一个选项标签的别名：到第一个分隔符为止的那一段。「甲：详情页里的配置入口」→「甲」，
 * 「保留现状」→「保留现状」。模型在展开正文里重述选项时，开头写的通常就是这个别名。
 * @param {string} label - 归一化后的展示文字（不含「（推荐）」后缀）。
 * @returns {string} 别名；空标签时为空串（调用方跳过）。
 */
function labelAlias(label) {
  const cut = label.search(LABEL_ALIAS_END);
  return cut === -1 ? label : label.slice(0, cut);
}

/**
 * 展开正文里有没有把某个选项又列了一遍。认的是**行首**：去掉列表符号与强调符号后，
 * 一行以某个选项的别名开头、后面（可空一格）紧跟分隔符或直接结束，就是同一件事写了第二遍。
 *
 * 只认行首、且要求别名后面就是分隔符，是为了把误拒面压到最小：正文里顺口提到某个选项名
 * （「选甲：…」）不算，只有「一条以选项名开头的条目」才算。代价是漏放与误拒都还可能发生，
 * 所以技能正文那半边（tttnny/matt-skills 的 grilling 技能，字段映射段）是第一道闸。
 * @param {string} detail - 展开正文（markdown）。
 * @param {string[]} aliases - 该题各选项的别名。
 * @returns {string|undefined} 命中的那一行；没命中时 undefined。
 */
function detailRestatesOption(detail, aliases) {
  if (isBlank(detail)) return undefined;
  for (const raw of detail.split('\n')) {
    const line = raw.replace(LINE_MARKERS, '').replace(INLINE_MARKERS, '').trim();
    if (line === '') continue;
    for (const alias of aliases) {
      if (alias === '' || !line.startsWith(alias)) continue;
      const rest = line.slice(alias.length).trimStart();
      if (rest === '' || ALIAS_FOLLOW_CHAR.test(rest[0])) return line;
    }
  }
  return undefined;
}

/**
 * 这一轮的入参能不能画成表单。题干与选项的分工整体上是引导——子串匹配会误拒合法题干，
 * 坏题干好过假拒绝——只有两处例外：展开正文里把选项又列一遍（那会让同一批选项在页面上
 * 出现两遍，一遍带选择器、一遍不带，见 detailRestatesOption），以及选项的展示文字里带顿号
 * （作答回填按顿号分项，带它的名字读不回来）。命中即返回可修复的拒绝，模型改完重投。
 *
 * 前置：questions 应当来自调用参数（schema 保证是数组）。真给了别的形状也不抛，而是当成一条
 * 违规交回去——抛异常会让这一轮以「工具坏了」收场，而不是「改一改重投」。
 * @param {object[]} questions - 模型给的 questions。
 * @returns {string[]} 逐条违规说明；空数组表示这一轮可以投出去。
 */
export function validateRound(questions) {
  if (!Array.isArray(questions)) {
    return ['questions must be an array of question objects; this call carried no round to validate'];
  }
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
    const aliases = [];
    (question.options ?? []).forEach((option, optionIndex) => {
      const normalized = normalizeOption(option);
      if (isBlank(normalized.label)) {
        violations.push(`${where}, option ${optionIndex + 1} has an empty label; every option needs a label the user can read and pick`);
        return;
      }
      if (seenLabels.has(normalized.label)) {
        violations.push(`${where} has two options that render with the same label ${JSON.stringify(normalized.label)}; the form identifies a choice by its label, so make them differ`);
        return;
      }
      seenLabels.add(normalized.label);
      if (normalized.cleanLabel.includes(IDEOGRAPHIC_COMMA)) {
        violations.push(`${where}, option ${optionIndex + 1} has an ideographic comma in its label ${JSON.stringify(normalized.cleanLabel)}; the form joins a question's answers with "${IDEOGRAPHIC_COMMA}" and reads them back by splitting on it, so this label cannot survive the round trip — reword the label without it`);
        return;
      }
      aliases.push(labelAlias(normalized.cleanLabel));
    });
    const restated = detailRestatesOption(question.detail, aliases);
    if (restated !== undefined) {
      violations.push(`${where} restates its options in detail: the line ${JSON.stringify(shorten(restated))} begins like one of the option labels, so the form would show those options twice; options go only in options, and detail is for what all of them share`);
    }
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
 * @returns {{rejected: boolean, violations: string[], error: string|undefined}|undefined}
 *   形状不认识时返回 undefined（调用方按调用失败处理）。
 */
function readResult(resultText) {
  const parsed = parseJson(resultText);
  if (!isRecord(parsed)) return undefined;
  if (parsed.rejected === true) {
    return {
      rejected: true,
      violations: stringList(parsed.violations),
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
    };
  }
  if (parsed.pending === true) return { rejected: false, violations: [], error: undefined };
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
 * 一个工具调用块 → 这个块自己的表单模型。取数规则全在这里，两个注册项（轮次尾部的表与
 * 工具行）都不许自己去猜块形状：
 *
 *  - 结果节点（有 `kind`）的调用头挂在 `call` 上（窗口截断时是 null），结果文本在 `content` 里；
 *  - 还没落结果的那次调用把 `name` / `argsRaw` 直接摊在自己身上。
 *
 * `failure` 是失败行要显示的文字，只有真的以失败收场时才有。
 * @param {unknown} block - 工具调用块：结果节点，或还在跑/正在准备的那次调用。
 * @returns {{
 *   state: 'running'|'form'|'rejected'|'error',
 *   questions: object[], violations: string[], error: string|undefined, failure: string|undefined,
 * }} 表单模型与失败说明。
 */
export function readCallModel(block) {
  const settled = isRecord(block) && 'kind' in block;
  const argsRaw = (settled ? block.call?.argsRaw : block?.argsRaw) ?? '';
  const resultText = settled ? firstText(block.content) : undefined;
  const failed = settled && block.isError === true;
  return {
    ...readFormModel({ argsRaw, resultText, failed }),
    failure: failed ? failureText(resultText, block.error) : undefined,
  };
}

/**
 * 结果里的第一段文本。本工具只渲染一段，形状不对就当没有结果。
 * @param {unknown} content - 结果 content 数组。
 * @returns {string|undefined} 文本。
 */
function firstText(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content.find((block) => isRecord(block) && block.type === 'text');
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
 * 归一化 localStorage 里读回来的作答：只认 `{[id]: {selected, custom}}` 这个形状。
 *
 * **形状对得上的空作答也留着**：一条「selected 是数组、且与 custom 都空」的记录不是脏数据，
 * 而是「用户把这题清空了」（最常见的是取消掉推荐项的默认勾选）。它与「用户没动过这题」必须
 * 分得开，否则默认勾选会在他取消之后又勾回来。不是这个形状的记录（比如 selected 是个字符串）
 * 一律丢掉：那种记录不是本插件写的，认成「清空过」会白白吃掉默认勾选。
 * @param {unknown} value - 解析出来的值。
 * @returns {object} 干净的作答表。
 */
function sanitizeAnswers(value) {
  if (!isRecord(value)) return {};
  const answers = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!isRecord(answer)) continue;
    const shaped = Array.isArray(answer.selected) || typeof answer.custom === 'string';
    const selected = stringList(answer.selected);
    const custom = typeof answer.custom === 'string' ? answer.custom : '';
    if (!shaped && selected.length === 0 && custom === '') continue;
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
 * 一道题的作答逐行展开（选中的项在前、自填的字在后）。导入文本与只读展示共用这一份，
 * 两处的行序与取舍不会各写一套。
 * @param {object} question - 题目模型。
 * @param {{selected?: string[], custom?: string}|undefined} answer - 该题的作答。
 * @returns {string[]} 逐行文字；没作答时为空数组。
 */
export function answerLines(question, answer) {
  const { selected, custom } = answerParts(question, answer);
  return [...selected, ...(custom === '' ? [] : [custom])];
}

/**
 * 「推荐的选项默认勾上」落到一份作答表上：用户没动过的题，标了推荐的选项就是选中态。
 * 用户动过（storage 里有这题的记录）的题一律以他的为准——包括他把默认项取消掉、只留一个空记录，
 * 所以这里只补**缺席**的题，绝不覆盖已有的作答。
 * @param {object[]} questions - 题目模型。
 * @param {object} answers - 用户自己的作答表（readStoredForm 的产物）。
 * @returns {object} 表单上真正显示、导入、计数的作答表。
 */
export function applyRecommendedDefaults(questions, answers) {
  const merged = { ...(isRecord(answers) ? answers : {}) };
  for (const question of questions) {
    if (merged[question.id] !== undefined) continue;
    const selected = question.options.filter((option) => option.recommended).map((option) => option.label);
    if (selected.length > 0) merged[question.id] = { selected, custom: '' };
  }
  return merged;
}

/**
 * 生成导入文本的正文：逐题一行「标题：你选的项／你自填的字」，只含有作答的题。
 * 一行都没有时返回空串（调用方据此禁用导入键）。
 * @param {object[]} questions - 题目模型。
 * @param {object} answers - 作答表。
 * @returns {string} 正文（不含导入块的起止行）。
 */
export function importBody(questions, answers) {
  const lines = [];
  for (const question of questions) {
    const answer = answerLines(question, answers[question.id]);
    if (answer.length === 0) continue;
    lines.push(`${titleOf(question)}：${answer.join('、')}`);
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
 * 这一轮是否已经过去：记录里出现了这条调用之后（seq 更大）的用户发言——把本轮带过去的就是它。
 * 认不出这条调用、或界面还拿不到记录时一律返回 undefined——把表单当只读卡住比多显示一次可编辑
 * 更糟（答案没地方写）。
 *
 * 交回的是**紧接着这条调用的那一条**：更晚的发言属于后面的轮次，拿它重画这一轮必然串味
 * （旧轮次的表会去解析新一轮的作答）。只有一条时就是它。
 * @param {unknown} nodes - chat 视图的 legacy.nodes。
 * @param {unknown} callId - 本次工具调用的 callId。
 * @returns {object|undefined} 那条用户发言节点；本轮还没过去时为 undefined。
 */
export function userReplyAfter(nodes, callId) {
  if (!Array.isArray(nodes)) return undefined;
  const mine = nodes.find((node) => isRecord(node) && node.callId === callId);
  if (mine === undefined || typeof mine.seq !== 'number') return undefined;
  let reply;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.kind !== 'user' && node.kind !== 'steering') continue;
    if (typeof node.seq !== 'number' || node.seq <= mine.seq) continue;
    if (reply === undefined || node.seq < reply.seq) reply = node;
  }
  return reply;
}

/**
 * 一条发言的文字：内容块里的文本段接起来（附件、图片这些段没有文字可反解）。
 * @param {unknown} node - 用户发言节点。
 * @returns {string} 发言文字；没有文字时为空串。
 */
export function messageText(node) {
  const content = isRecord(node) && Array.isArray(node.content) ? node.content : [];
  return content
    .filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/**
 * 本轮里那次 `grilling_form` 调用。位置由 chat 的位置索引给出（按轮次取本轮的节点键），
 * 所以不靠 seq 猜边界；投出即结束本轮，取**最后一次**——被拒之后又投的那一次才算数。
 * @param {unknown} chat - chat 视图快照（ChatSnapshot）。
 * @param {unknown} turn - 轮次号。
 * @returns {{ block: object, toolName: string, callId: string }|undefined} 本轮的表单调用；没有就不画。
 */
export function roundCall(chat, turn) {
  const keys = chat?.locations?.getTurn?.(turn);
  if (!Array.isArray(keys)) return undefined;
  let found;
  for (const key of keys) {
    const node = chat.nodes.get(key);
    if (!isRecord(node) || node.kind !== 'tool-call') continue;
    const block = node.data?.root;
    if (!isRecord(block)) continue;
    const toolName = typeof block.call?.name === 'string' ? block.call.name : block.name;
    if (toolName !== TOOL_NAME) continue;
    found = { block, toolName, callId: block.callId };
  }
  return found;
}

/**
 * 反解一段用户发言里的作答块，回到作答表。
 *
 * 匹配规则（都是**给人看**的格式，没有隐藏协议）：标题按「题号并入的标题 → 题干 → id」认题；
 * 每一项先按该题选项的展示文字精确匹配，匹配不上的并进自填。块里没出现的题就是**没作答**
 * （显式记一条空作答，推荐默认因此不会被勾回来）。
 *
 * 已知代价（刻意接受）：选项名或自填内容本身含「、」时可能多算/少算一项。
 * @param {unknown} text - 用户发言的文字。
 * @param {object[]} questions - 题目模型。
 * @returns {object|undefined} 作答表；块缺失、起止行不配对、或一条都还原不出来时 undefined（调用方退回本地那份）。
 */
export function parseImportedAnswers(text, questions) {
  const current = findImportBlock(text);
  if (current === undefined) return undefined;
  const inner = text.slice(current.start + IMPORT_BLOCK_START.length, current.end - IMPORT_BLOCK_END.length);
  const body = inner.replace(/^\n/, '').replace(/\n$/, '');
  if (isBlank(body)) return undefined;
  const answers = {};
  for (const question of questions) answers[question.id] = { selected: [], custom: '' };
  let matched = 0;
  for (const line of body.split('\n')) {
    const entry = splitImportedLine(questions, line);
    if (entry === undefined) continue;
    matched++;
    const { question, items } = entry;
    const selected = [];
    const rest = [];
    for (const raw of items.split('、')) {
      const item = raw.trim();
      if (item === '') continue;
      const option = (question.options ?? []).find((candidate) => candidate.displayLabel === item);
      if (option === undefined) rest.push(item);
      else selected.push(option.label);
    }
    answers[question.id] = { selected, custom: rest.join('、') };
  }
  return matched === 0 ? undefined : answers;
}

/**
 * 反解出的一行拆成「哪道题」与「它的项」。标题本身可能含「：」（「落点：插件页」这种），
 * 所以逐个分隔符试着认题，认得出的那一个才算分隔符。
 * @param {object[]} questions - 题目模型。
 * @param {string} line - 导入块里的一行。
 * @returns {{ question: object, items: string }|undefined} 认不出题时 undefined。
 */
function splitImportedLine(questions, line) {
  let cut = line.indexOf('：');
  while (cut !== -1) {
    const question = questionByTitle(questions, line.slice(0, cut).trim());
    if (question !== undefined) return { question, items: line.slice(cut + 1) };
    cut = line.indexOf('：', cut + 1);
  }
  return undefined;
}

/**
 * 题面里的一道题按标题认回来：题号并入的标题优先，其次题干，最后 id。
 * @param {object[]} questions - 题目模型。
 * @param {string} title - 反解出来的标题。
 * @returns {object|undefined} 命中的题。
 */
function questionByTitle(questions, title) {
  if (title === '') return undefined;
  const readers = [(question) => question.header, (question) => question.question, (question) => question.id];
  for (const read of readers) {
    const hit = questions.find((question) => typeof read(question) === 'string' && read(question) === title);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * 冻结那一刻表单上显示的作答：以实发消息里的作答块为准（用户在原生输入框里改过、增删过的
 * 都以那条消息为准）；块拿不到时退回本地那份（含推荐默认），内容不会凭空消失。
 * @param {object[]} questions - 题目模型。
 * @param {object} storedAnswers - 用户自己的作答表（readStoredForm 的产物）。
 * @param {unknown} text - 实发消息的文字。
 * @returns {object} 冻结渲染要用的作答表。
 */
export function frozenAnswers(questions, storedAnswers, text) {
  return parseImportedAnswers(text, questions) ?? applyRecommendedDefaults(questions, storedAnswers);
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
