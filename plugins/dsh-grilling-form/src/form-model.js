// grilling_form 的共用纯模型：宿主半边的入参校验、界面半边的取数与作答导入，全在这一个模块里。
//
// 两端必须一致的两件事都只有这一份实现：题号并入标题的拼法（宿主不拼、界面拼，但模型自己
// 宣布的 Q 编号要对得上），以及归一化后的 option label 认选项（宿主按它查重、界面按它存勾选、
// 生成导入文本时再换回模型原本写的 label）。各写一份必然漂。
//
// 纯函数：不碰 React、不读时钟、不读会话。localStorage 由调用方传进来（见文件末尾那组以 storage 为参数的函数）。

import { normalizeOption } from './recommendation.js';

/** 导入块的起止行：重复导入时靠它认出上一次导入的那一段，原地替换。
 *
 * **改协议（这两个常量、工具名、字段语义、作答段的行形）时的联动点**——机械细节只归本包，
 * 技能正文那边不写这些，只需要核对它有没有引用旧格式：
 *   1. `src/index.js`：工具的 description / 各字段说明 / PENDING_MESSAGE（模型的运行时自述）；
 *   2. `scripts/test-form-model.mjs`、`scripts/smoke-host.mjs`、`scripts/test-form-session.mjs`、
 *      `scripts/test-render.mjs` 里的字面量钉（起止行、作答段的逐行形状、会话键）；
 *   3. 本包 `README.md` 与仓库根 `README.md` 的插件表；
 *   4. matt-skills 的 grilling 技能正文（`skills/productivity/grilling/SKILL.md`）：工具改名时
 *      正文里那句工具名要跟着改。它不随本包发布、也没有任何测试看得见它，漂移只会以模型行为
 *      静默表现出来。
 * 新增任何写死这些字面量的测试或文档，都要补进这份清单。 */
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
/** 作答回填里一项的开头：每项独占一行、行首带这个记号，所以项与项之间不靠任何字符分拆，
 * 选项名里出现什么标点都读得回来（旧格式的顿号分隔限制已随之删除）。 */
const ANSWER_ITEM_PREFIX = '- ';

/** 旧格式（0.10.0 及更早）的项分隔符：老会话里已发出去的消息带着它，反解要照样认。
 * 新格式不再用它分项，所以选项名里带顿号不再是问题——这条只服务读回旧消息。 */
const LEGACY_ITEM_SEPARATOR = '、';

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
 * 坏题干好过假拒绝——只有一处例外：展开正文里把选项又列一遍（那会让同一批选项在页面上
 * 出现两遍，一遍带选择器、一遍不带，见 detailRestatesOption）。命中即返回可修复的拒绝，
 * 模型改完重投。
 *
 * 选项名里的标点早先也是拒收项（作答靠顿号分项）；作答格式改成「一项一行」之后，任何标点
 * 都读得回来，这条规则连同它的联动点一并删除。
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
      // 多选题是缺省；只有显式写 multi_select: false 才是单选（原生那套叫 multiSelect，两种写法都认）。
      multiSelect: question.multi_select !== false && question.multiSelect !== false,
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
 * 一道题的**项**：选中的选项各一项、自填整段算一项。导入块按这个逐项写行，反解也按项回填；
 * 与 answerLines 的分工是——那里逐行展开是给人看的（只读展示按行），这里逐项是给协议用的
 * （自填里的回车属于同一项，不拆）。
 * @param {object} question - 题目模型。
 * @param {{selected?: string[], custom?: string}|undefined} answer - 该题的作答。
 * @returns {{kind: 'option'|'custom', text: string}[]} 逐项；没作答时为空数组。
 */
export function answerItems(question, answer) {
  const { selected, custom } = answerParts(question, answer);
  return [
    ...selected.map((label) => ({ kind: 'option', text: label })),
    ...(custom === '' ? [] : [{ kind: 'custom', text: custom }]),
  ];
}

/**
 * 一道题的导入段：标题行 + 每一项一行（行首记号见 ANSWER_ITEM_PREFIX）。没作答时是空数组。
 * 导入文本与草稿里的「这段是不是当前作答」共用这一份，两处不会各写一套。
 * @param {object} question - 题目模型。
 * @param {{selected?: string[], custom?: string}|undefined} answer - 该题的作答。
 * @returns {string[]} 段内各行。
 */
export function importSegmentLines(question, answer) {
  const items = answerItems(question, answer);
  if (items.length === 0) return [];
  return [`${titleOf(question)}：`, ...items.map((item) => `${ANSWER_ITEM_PREFIX}${item.text}`)];
}

/**
 * 「推荐的选项默认勾上」落到一份作答表上：用户没动过的题，标了推荐的选项就是选中态。
 * 用户动过（storage 里有这题的记录）的题一律以他的为准——包括他把默认项取消掉、只留一个空记录，
 * 所以这里只补**缺席**的题，绝不覆盖已有的作答。单选（`multi_select: false`）的题另把已有的作答
 * 收敛到至多一项——不分它是推荐默认、用户勾的、还是从实发消息里反解出来的。
 * @param {object[]} questions - 题目模型。
 * @param {object} answers - 用户自己的作答表（readStoredForm 的产物），或反解出来的那份。
 * @returns {object} 表单上真正显示、导入、计数的作答表。
 */
export function applyRecommendedDefaults(questions, answers) {
  const merged = { ...(isRecord(answers) ? answers : {}) };
  for (const question of questions) {
    if (merged[question.id] === undefined) {
      const selected = question.options.filter((option) => option.recommended).map((option) => option.label);
      if (selected.length > 0) merged[question.id] = { selected, custom: '' };
    }
    if (question.multiSelect === false && merged[question.id] !== undefined) {
      merged[question.id] = selectOne(merged[question.id]);
    }
  }
  return merged;
}

/** 单选：一题的作答至多留一项（保留第一项，不是追加）。没选中时自填照旧。 */
function selectOne(existing) {
  const [kept] = existing.selected;
  return { selected: kept === undefined ? [] : [kept], custom: existing.custom };
}

/**
 * 生成导入文本的正文：有作答的题各占一段——标题一行，每个选中的项与自填各占一行、行首带
 * 记号（见 ANSWER_ITEM_PREFIX）。一项作答都没有时返回空串（调用方据此禁用导入键）。
 *
 * 新格式的项与项之间不靠任何字符分拆，所以选项名或自填里出现顿号、冒号、换行都读得回来。
 * @param {object[]} questions - 题目模型。
 * @param {object} answers - 作答表。
 * @returns {string} 正文（不含导入块的起止行）。
 */
export function importBody(questions, answers) {
  const blocks = [];
  for (const question of questions) {
    const lines = importSegmentLines(question, answers[question.id]);
    if (lines.length > 0) blocks.push(lines.join('\n'));
  }
  return blocks.join('\n');
}

/** 草稿里那一段导入块现在长什么样；没有块、或起止行不配对时 undefined。 */
function importBlockBodyOf(draft) {
  const block = findImportBlock(draft);
  if (block === undefined) return undefined;
  const text = draft.slice(block.start + IMPORT_BLOCK_START.length, block.end - IMPORT_BLOCK_END.length);
  return text.replace(/^\n/, '').replace(/\n$/, '');
}

/**
 * 草稿里那段导入块是不是**当前这份作答**。用户点了导入之后又改表单，两边就不一致了——
 * 页面上据此把按键提示成「更新输入框」，而不是让他把旧答案发出去。
 *
 * 比的是逐行文本：手改过的块（多一个空行、改了一个字）算不一致，与导入键的语义一致
 * （再点一次就是覆盖）。
 * @param {unknown} draft - 当前草稿。
 * @param {string} body - 当前作答的正文（importBody 的产物）。
 * @returns {boolean} 草稿里正是这一份时为 true。
 */
export function draftHasBody(draft, body) {
  if (body === '') return false;
  return importBlockBodyOf(draft) === body;
}

/**
 * 草稿里那段导入块逐题回到作答表；没有块、或一题都认不出时 undefined（调用方照旧重建）。
 * @param {unknown} draft - 当前草稿。
 * @param {object[]} questions - 题目模型。
 * @returns {object|undefined} 作答表。
 */
export function parseImportedDraft(draft, questions) {
  const body = importBlockBodyOf(draft);
  if (body === undefined || isBlank(body)) return undefined;
  const answers = splitImportedBody(questions, body);
  return answers.length === 0 ? undefined : answers;
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
 * 反解一段用户发言里的作答块，回到作答表。解析失败时退回调用方给的 `fallback`——
 * 这条链上的三种来历（旧格式的块、单行旧格式、认不出题的块）分不出来，也不能编一个
 * 「用户没作答」的结论出来；显式区分那三种的判据在 parseImportedAnswersResult。
 * @param {unknown} text - 用户发言的文字。
 * @param {object[]} questions - 题目模型。
 * @param {object} [fallback={}] - 反解不出来时交回的作答表；缺省是空表。
 * @returns {object} 作答表；块缺失、起止行不配对、或一条都还原不出来时就是 fallback。
 */
export function parseImportedAnswers(text, questions, fallback = {}) {
  return parseImportedAnswersResult(text, questions).answers ?? fallback;
}

/**
 * 反解一段用户发言里的作答块，并把「为什么没有」也交回来。
 *
 * 三种结果分得开（冻结算的画法与记录是否失真全看它）：
 *  - `none`：根本没有块——用户没走表单（自己打字、贴图、或说别的事），**没有作答**；
 *  - `malformed`：有起止行，但块里认不出一道题（或起止行不配对）——形态坏了，退回本地那份；
 *  - `parsed`：块里的题按标题认回来，`answers` 把块里没出现的题也显式记成**没作答**。
 *
 * 认法都是**给人看**的格式，没有隐藏协议。块的形状由块自己说，不靠全局：
 *  - 起止行那一行以 `：` 结尾（本轮导入的形态）⇒ 本次格式：该行只是题目标题，其后的行凡是
 *    以项记号开头的，按「行首第一个记号」切开、其余整行归一项（且不 trim，多行自填连换行
 *    一起读回来）；不以记号开头的行是标题行不带项的写法，按旧格式读那一行；
 *  - 块里出现任何带项记号的行 ⇒ 本次格式：**所有**标题行都只当标题（没带项就是这题没作答）；
 *  - 否则整块按旧格式（「标题：项、项」一行一题）读。
 *
 * 标题认题都是「题号并入的标题 → 题干 → id」，标题本身可能含「：」，所以逐个分隔符试着认。
 * @param {unknown} text - 用户发言的文字。
 * @param {object[]} questions - 题目模型。
 * @returns {{ kind: 'none'|'malformed'|'parsed', answers: object|undefined }} 反解结果。
 */
export function parseImportedAnswersResult(text, questions) {
  const current = findImportBlock(text);
  if (current === undefined) return { kind: 'none', answers: undefined };
  const inner = text.slice(current.start + IMPORT_BLOCK_START.length, current.end - IMPORT_BLOCK_END.length);
  // 块内的行一律按 \n 分，行尾的 \r 四处都去掉：手打的草稿、别处粘进来的文本都可能带 CRLF，
  // 不处理的话「- 甲\r」与选项名「甲」就对不上，会整题落进自填。
  const body = inner.replace(/^\n/, '').replace(/\n$/, '');
  if (isBlank(body)) return { kind: 'parsed', answers: blankAnswers(questions) };
  const entries = splitImportedBody(questions, body);
  return entries.length === 0
    ? { kind: 'malformed', answers: undefined }
    : { kind: 'parsed', answers: asAnswerTable(questions, entries) };
}

/**
 * 逐条条目回到按 id 取用的作答表：块里没出现的题显式记成**没作答**（推荐默认因此不会被勾回来）。
 * @param {object[]} questions - 题目模型。
 * @param {object[]} entries - splitImportedBody 的产物。
 * @returns {object} 作答表。
 */
function asAnswerTable(questions, entries) {
  const answers = blankAnswers(questions);
  for (const entry of entries) {
    answers[entry.question.id] = { selected: entry.selected, custom: entry.custom };
  }
  return answers;
}

/** 一题的**没作答**：显式记一条空作答，推荐默认因此不会被勾回来。
 * @param {object[]} questions - 题目模型。
 * @returns {object} 每题都是空作答的作答表。 */
function blankAnswers(questions) {
  const answers = {};
  for (const question of questions) answers[question.id] = { selected: [], custom: '' };
  return answers;
}

/** 现在（新格式）的标题行以这个收尾：行尾那个全角冒号只是它自己写的分隔符，不是内容。 */
const NEW_FORMAT_HEADER_END = '：';
/** 旧格式（0.10.0 及更早）的行首列表符号：`- 选 A` 与 `-选 A` 都算一项。 */
const LEGACY_ITEM_PREFIX = /^-\s+/;
/** 一行的项记号：新格式写成「- 项」，行首的空格不改变它是哪一项（手打时容易缩进）；
 * 切开后后半段不 trim——多行自填的回车就靠它读回来。 */
const ANSWER_ITEM_LINE = /^[ \t]*- /;

/**
 * 把导入块里的各行拆成逐题的作答。
 *
 * 格式按块的形状自己认，不靠全局开关：出现带项记号的行就是本次格式，标题行只当标题；
 * 一行都没有记号（含旧格式的「标题：项、项」）就整块按旧格式读。两种格式混在一块的块，
 * 旧格式的那些行按旧格式读、新格式的那些行按新格式读，谁也不吃掉谁。
 * @param {object[]} questions - 题目模型。
 * @param {string} body - 块内文本（起止行已剥掉）。
 * @returns {object[]} 每条是 `{ question, selected, custom }`；认不出题的行不产出条目。
 */
function splitImportedBody(questions, body) {
  const lines = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  const newFormat = lines.some((line) => ANSWER_ITEM_LINE.test(line) || LEGACY_ITEM_PREFIX.test(line));
  const found = new Map();
  let current;
  const flush = () => {
    if (current === undefined) return;
    found.set(current.question.id, current);
  };
  for (const line of lines) {
    if (newFormat && !ANSWER_ITEM_LINE.test(line)) {
      const title = line.trim();
      const question = questionByTitle(questions, title)
        // 新格式的标题行以「：」收尾（那是它自己写的分隔符），剥掉之后照样认一次，
        // 于是「标题里本来就有冒号」也不必特判。
        ?? (title.endsWith(NEW_FORMAT_HEADER_END) ? questionByTitle(questions, title.slice(0, -1).trim()) : undefined);
      if (question !== undefined) {
        flush();
        current = { question, selected: [], custom: '' };
        continue;
      }
      // 认不出题的行：当前题的**续行**（自填按了回车）照旧算它的，其余忽略。
      if (current !== undefined && line.trim() !== '') current.custom += `\n${line}`;
      continue;
    }
    if (newFormat) {
      if (current === undefined) continue;
      const item = line.slice(line.match(ANSWER_ITEM_LINE)[0].length);
      const option = optionByDisplayLabel(current.question, item);
      if (option === undefined) current.custom = current.custom === '' ? item : `${current.custom}\n${item}`;
      else current.selected.push(option.label);
      continue;
    }
    if (LEGACY_ITEM_PREFIX.test(line)) continue; // 旧格式混了一块：这里的项记号行没有题目接着，忽略
    for (const entry of legacyEntriesOfLine(questions, line)) {
      flush();
      const existing = found.get(entry.question.id);
      current = existing === undefined
        ? entry
        : { question: entry.question, selected: [...existing.selected, ...entry.selected], custom: entry.custom };
    }
  }
  flush();
  return [...found.values()].map((entry) => ({
    question: entry.question,
    selected: entry.selected,
    custom: entry.custom.trim(),
  }));
}

/**
 * 新格式的项：去掉项记号之后整行就是展示文字。先按该题的选项精确匹配，匹配不上就是自填。
 * @param {object} question - 题目模型。
 * @param {string} item - 去掉记号之后的整行。
 * @returns {object|undefined} 命中的选项；不是选项时 undefined。
 */
function optionByDisplayLabel(question, item) {
  return (question.options ?? []).find((candidate) => candidate.displayLabel === item);
}

/**
 * 旧格式（一行一题）的一行回到作答。顺序是先认题、再按顿号分项——与旧版的读法逐字一致，
 * 所以老会话里已发出去的消息照样重画得出。
 * @param {object[]} questions - 题目模型。
 * @param {string} line - 块里的一行。
 * @returns {object[]} 认出的条目；这一行认不出题时为空数组。
 */
function legacyEntriesOfLine(questions, line) {
  for (const cut of separatorCuts(line)) {
    const question = questionByTitle(questions, line.slice(0, cut).trim());
    if (question === undefined) continue;
    const selected = [];
    const rest = [];
    for (const raw of line.slice(cut + 1).split(LEGACY_ITEM_SEPARATOR)) {
      const item = raw.trim();
      if (item === '') continue;
      const option = optionByDisplayLabel(question, item);
      if (option === undefined) rest.push(item);
      else selected.push(option.label);
    }
    return [{ question, selected, custom: rest.join(LEGACY_ITEM_SEPARATOR) }];
  }
  return [];
}

/**
 * 一行里每个全角冒号的位置。标题本身可能含「：」（「落点：插件页」这种），所以逐个分隔符
 * 试着认题，认得出的那一个才算分隔符。
 * @param {string} line - 块里的一行。
 * @returns {number[]} 分隔符位置，从左到右。
 */
function separatorCuts(line) {
  const cuts = [];
  let cut = line.indexOf('：');
  while (cut !== -1) {
    cuts.push(cut);
    cut = line.indexOf('：', cut + 1);
  }
  return cuts;
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
 * 冻结那一刻表单上显示的作答。以实发消息里的作答块为准（用户在原生输入框里改过、增删过的
 * 都以那条消息为准），块的来历分三种（见 parseImportedAnswersResult）：
 *
 *  - 块在 ⇒ 就以块为准，块里没出现的题就是**没作答**；
 *  - 块在但形态坏了 ⇒ 退回本地那份（含推荐默认）：内容不凭空消失，但那只是本地记录；
 *  - 根本没有块 ⇒ **没作答**：用户没走表单，把推荐默认当他的作答显示出来就是编答案，
 *    记录会失真（冻结态正是给人回看的）。
 * @param {object[]} questions - 题目模型。
 * @param {object} storedAnswers - 用户自己的作答表（readStoredForm 的产物）。
 * @param {unknown} text - 实发消息的文字。
 * @returns {{
 *   answers: object, unanswered: boolean, fallback: boolean,
 * }} 冻结渲染要用的作答表、它是不是「没作答」、以及它是不是退回的本地那份。
 */
export function frozenFormAnswers(questions, storedAnswers, text) {
  const parsed = parseImportedAnswersResult(text, questions);
  if (parsed.kind === 'parsed') {
    // 反解出来的那份照样过一遍收敛：块的形状是用户手写的，单选那题写了两行选项也只会留一项。
    return { answers: applyRecommendedDefaults(questions, parsed.answers), unanswered: false, fallback: false };
  }
  if (parsed.kind === 'malformed') {
    return { answers: applyRecommendedDefaults(questions, storedAnswers), unanswered: false, fallback: true };
  }
  return { answers: blankAnswers(questions), unanswered: true, fallback: false };
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
