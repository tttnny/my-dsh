// grilling_form 的共用纯模型：宿主半边的入参校验与闸门折叠、界面半边的取数与作答导入，
// 全在这一个模块里。
//
// 两端必须一致的几件事只有这一份实现：题号（界面画「1.」，作答块也写「1.」）、
// 作答块的身份记号（宿主按它判「用户答了没」，界面按它判「哪条发言是这张表的作答」）、
// 以及选项 label 即选项身份（宿主按它查同重、界面按它存勾选、导入文本按它写回）。
//
// 纯函数：不碰 React、不读时钟、不读会话。localStorage 由调用方传进来（见文件末尾那组以 storage 为参数的函数）。

import { normalizeOption, readExplanation } from './recommendation.js';

// 本包的类型词汇表。纯 JS 包的类型信息只有 JSDoc 这一处，所以这几个 typedef 是整个包的
// 契约：宿主半边（src/index.js）、内壳（src/form-session.js）与浏览器半边
// （src/client/*）都 `import('./form-model.js')` 取这里的名字，不各写一份形状。
//
// 门槛低是故意的：只声明本包真的读写的成员。平台那半边（chat 视图快照、槽位 props、
// cordis 服务）没有可导入的类型，给它们复制一份影子类型只会把 JSDoc 变成平台的镜像，
// 所以那些结构在本包就地少量声明（见 ChatSnapshotLike）。

/**
 * 一个选项归一化之后的形状（normalizeOption 的产物）。
 * @typedef {object} QuestionOption
 * @property {string} label 选项身份，也是给用户看的文字：界面照它渲染与存勾选，导入文本照它写回。
 * @property {boolean} recommended 是否推荐；界面据此另画徽标并默认勾上。
 * @property {string} [description] 这个选项的补充说明（去掉首尾空白）；没写时没有这个键。
 *   只负责显示：它不参与选项身份，也不进作答块。
 */

/**
 * 一道题的题型：单选、多选、自由（只有一个自己打字的框）。
 * @typedef {'single'|'multi'|'free'} QuestionType
 */

/**
 * 一道题的模型（readQuestions 的产物）。
 * @typedef {object} Question
 * @property {string} id 题目身份，就是题号的字符串形式；作答表按它取用。
 * @property {number} number 题号：页面画在题干同一行（`1.`），作答块里只写它。
 * @property {string} question 题干。
 * @property {string} [detail] 题目的补充说明（去掉首尾空白）；没写时没有这个键。只负责显示。
 * @property {QuestionType} type 题型。
 * @property {QuestionOption[]} options 选项；自由题没有。
 */

/**
 * 一道题的作答。
 * @typedef {object} Answer
 * @property {string[]} selected 选中的选项身份（label）。
 * @property {string} custom 自填文字。
 */

/**
 * 作答表：按题目 id 取用。
 * @typedef {Record<string, Answer>} AnswerTable
 */

/**
 * 拷问作答块里一条认出来的作答条目（splitImportedBody 的产物）。
 * @typedef {object} AnswerEntry
 * @property {Question} question 命中这一条的题。
 * @property {string[]} selected 命中的选项身份。
 * @property {string} custom 自填文字。
 */

/**
 * 反解一段发言的结果。两个成员是**相关**的：`parsed` 必有作答表，另两种必没有。
 * `none` 是这段发言里根本没有这张表的块；`malformed` 是块在、但一条题号都认不出来。
 * @typedef {{ kind: 'parsed', answers: AnswerTable }} ParseHit
 * @typedef {{ kind: 'none'|'malformed', answers: undefined }} ParseMiss
 */

/**
 * 工具结果读出来的形状：表单投出去没有，以及没投出去时给模型的那句话。
 * @typedef {{ shown: boolean, message: string|undefined }} FormResult
 */

/**
 * 表单模型的状态：还没落库 / 投出去了 / 没投出去 / 调用失败 / 结果形状不认识。
 *
 * 最后一态是「这次调用的结果不是本插件的形状」（例如会话里更早那几轮留下的旧结果）：
 * 两个注册项都什么都不画——轮次里没有可画的表，工具行也没有可说的话。
 * @typedef {'running'|'form'|'notShown'|'error'|'unknown'} FormState
 */

/**
 * 闸门投影里那张表的记录：一次投出去的 grilling_form 调用。
 * @typedef {object} FormCall
 * @property {string} callId 那次调用的 id；作答块的身份记号由它推出来（见 importBlockStart）。
 * @property {string[]} questions 它问了什么，按题序；拦下后来那张表时抄给模型看。
 * @property {number} seq 那次调用事件在会话里的位置。
 */

/**
 * 闸门投影的状态：`pending` 是投出去还没等到作答的那张表，`call` 是刚发出、结果还没落库的那次调用。
 * 两个槽位都要有：读闸门发生在调用事件之后、结果事件之前，那时新调用已经进了 `call`，
 * 而它有没有真的投出去还不知道——照 `call` 判会把旧表误判成没人等着。
 * @typedef {{ call: FormCall|null, pending: FormCall|null }} FormGate
 */

/**
 * storage 的最小形状：浏览器里是 localStorage，测试里是假件。
 * 只声明本包用到的两个方法，所以 DOM 的 Storage 与测试假件都直接对得上。
 * @typedef {object} StorageLike
 * @property {(key: string) => (string | null)} getItem 读一项。
 * @property {(key: string, value: string) => void} setItem 写一项。
 */

/**
 * chat 视图快照里本模块用到的那几件：轮次位置索引、节点表，以及 compat 视图里的发言节点。
 * 平台没有可导入的类型，这里按**实际读到的成员**就地声明（见文件顶部的说明）。
 *
 * `nodes` 写成「只要有 get」而不是 `Map`：真实快照给的是 Map，测试假件给的是同样形状的普通
 * 对象，声明用法而不是声明实现，两边都对得上。
 * @typedef {object} ChatSnapshotLike
 * @property {{ getTurn: (turn: unknown) => unknown }} locations 轮次 → 本轮节点键的索引。
 * @property {{ get: (key: string) => unknown }} nodes 节点键 → 节点。
 * @property {{ nodes?: unknown }} [legacy] 兼容视图：发言节点摊在这里。
 */

/**
 * 会话事件里本模块用到的那两件。宿主半边的闸门折叠只看这两类事件，别的原样放过。
 * @typedef {{ type: string, seq: number, data: Record<string, unknown> }} SessionEventLike
 */

/**
 * 本插件的 wire 工具名：浏览器半边靠它在本轮里认出那次调用，闸门靠它认出该记的事件。
 */
export const TOOL_NAME = 'grilling_form';

/**
 * 闸门投影在会话投影表里的键。宿主自己读写，不上客户端快照（它只是拦下一次调用的判据）。
 */
export const GATE_KEY = 'grillingFormPending';

/** 作答块的收尾行。开头的起止行带这张表的身份记号，见 importBlockStart。
 *
 * **改这份协议（起止行的形状、题号行的写法、项记号、空作答应导出成什么样）时，副本住在这几处**：
 *   1. `src/index.js`：工具描述与那条投出后的说明里对作答行形的说法（模型照着它认这块文本）；
 *   2. 写死这些字面量的自检：`scripts/test-form-model.mjs`、`scripts/test-form-session.mjs`、
 *      `scripts/test-render.mjs`、`scripts/smoke-host.mjs`；
 *   3. 本包 `README.md`、`DETAILS.md` 与仓库根 `README.md` 的插件表；
 *   4. 仓库根 `GLOSSARY.md` 的「拷问作答块」词条；
 *   5. matt-skills-dsh 的 grilling 技能正文：工具改名时正文里那句工具名要跟着改。它不随本包发布、
 *      也没有任何测试看得见它，漂移只会以模型行为静默表现出来。
 * 新增任何写死这些字面量的测试或文档，都要补进这份清单。 */
export const IMPORT_BLOCK_END = '【/拷问作答】';

/** 三种题型的取值：工具 schema 的 enum 与页面分派共用这一份（schema 里写第二份字面量必然在加题型时漂）。
 * @type {readonly QuestionType[]} */
export const QUESTION_TYPES = ['single', 'multi', 'free'];

/**
 * 一张表的身份记号：调用 id 里的 4 位小写字母数字。它只出现在作答块的起止行里，
 * 用户看不见也不用管；两张表、两个轮次之间靠它互相不认领。
 * @param {unknown} callId - 那次调用的 id。
 * @returns {string} 4 位记号。
 */
export function shortFormId(callId) {
  const text = typeof callId === 'string' ? callId : '';
  const compact = text.replace(/[^0-9a-z]/gi, '').toLowerCase();
  return compact.length >= 4 ? compact.slice(-4) : compact.padStart(4, '0');
}

/**
 * 这张表的作答块开头那一行。
 * @param {unknown} callId - 那次调用的 id。
 * @returns {string} 起止行。
 */
export function importBlockStart(callId) {
  return `【拷问作答 ${shortFormId(callId)}】`;
}

/**
 * 是不是一个普通记录（不是数组、不是 null）。
 *
 * 写成**类型谓词**而不是返回 boolean：本模块到处从 JSON 里读「未知」形状，判定与收窄
 * 合成一步，调用方在 `if (isRecord(x))` 之后就能直接读字段，不必到处重复断言。
 * @param {unknown} value - 待判定的值。
 * @returns {value is Record<string, unknown>} 是普通记录时为 true。
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 解析 JSON 文本；不是字符串、空串、解析失败都返回 undefined（调用方按「没有」处理）。
 * @param {unknown} text - 待解析的文本。
 * @returns {unknown} 解析结果；解析不出来时 undefined。
 */
function parseJson(text) {
  if (typeof text !== 'string' || text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
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
 * 一题的题型；不是那三个字符串之一时 undefined（缺省由调用方按有没有选项兜底）。
 * @param {Record<string, unknown>} question - 模型给的一题。
 * @returns {QuestionType|undefined} 题型。
 */
function readQuestionType(question) {
  return QUESTION_TYPES.find((candidate) => question.type === candidate);
}

/**
 * 一份模型给的 options → 归一化之后的选项表。不是对象的项丢掉（宿主 schema 先拦）。
 * @param {unknown} options - 模型给的选项。
 * @returns {QuestionOption[]} 归一化之后的选项。
 */
function readOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.filter(isRecord).map((option) => normalizeOption(option));
}

/**
 * argsRaw → 这一轮问了什么、是不是点名要取代前一张表。
 *
 * 读不出来、没有 questions、某题不是对象、或 questions 是空数组时给空题表（界面据此什么都不画）。
 * 题型缺省**不是**作废的理由：有选项按多选、没选项按自由——模型漏写题型不该整轮被拒。
 * @param {unknown} argsRaw - 调用的原始参数文本。
 * @returns {{ questions: Question[], replace: boolean }} 题面与取代标记。
 */
function readRound(argsRaw) {
  const parsed = parseJson(argsRaw);
  if (!isRecord(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return { questions: [], replace: false };
  }
  /** @type {Question[]} */
  const questions = [];
  for (const [index, question] of parsed.questions.entries()) {
    if (!isRecord(question)) return { questions: [], replace: false };
    const options = readOptions(question.options);
    const detail = readExplanation(question.detail);
    questions.push({
      id: String(index + 1),
      number: index + 1,
      question: typeof question.question === 'string' ? question.question : '',
      ...detail === undefined ? {} : { detail },
      type: readQuestionType(question) ?? (options.length > 0 ? 'multi' : 'free'),
      options,
    });
  }
  return { questions, replace: parsed.replace === true };
}

/**
 * argsRaw → 模型出的题（readRound 的题面那一半，界面用）。
 * @param {unknown} argsRaw - 调用的原始参数文本。
 * @returns {Question[]} 题目模型。
 */
export function readQuestions(argsRaw) {
  return readRound(argsRaw).questions;
}

/**
 * argsRaw 里这次调用有没有点名取代前一张待答的表（界面用它认「后面那张把这张取代了」）。
 * @param {unknown} argsRaw - 调用的原始参数文本。
 * @returns {boolean} 带 replace: true 时为 true。
 */
export function replacesEarlier(argsRaw) {
  return readRound(argsRaw).replace;
}

/**
 * 这一轮的入参能不能画成表单。只留表单表示不了的三件事：空题干、空选项文字、
 * 同一题里去掉推荐标记后同文的两个选项（选项身份就是那段文字，同文即无从分辨选的是哪个）。
 * 其余一律交给兜底与宿主：模型漏写题型按有选项多选、没选项自由，选项与题型搭不搭由页面自己画。
 *
 * 前置：questions 应当来自调用参数（schema 保证是数组）。真给了别的形状也不抛，而是当成
 * 什么都没有——抛异常会让这一轮以「工具坏了」收场，而不是「改一改重投」。所以入参类型是
 * `unknown`：它确实是没验过的模型输出，逐字段判过再用才是这里的正经写法。
 * @param {unknown} questions - 模型给的 questions。
 * @returns {string[]} 逐条违规说明；空数组表示这一轮可以投出去。
 */
export function validateRound(questions) {
  /** @type {string[]} */
  const violations = [];
  if (!Array.isArray(questions)) return violations;
  questions.forEach((question, questionIndex) => {
    if (!isRecord(question)) return;
    const where = `Question ${questionIndex + 1}`;
    if (isBlank(question.question)) {
      violations.push(`${where} has an empty question text; write the question itself in question`);
    }
    const optionList = Array.isArray(question.options) ? question.options : [];
    const seenLabels = new Set();
    optionList.forEach((option, optionIndex) => {
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
    });
  });
  return violations;
}

/**
 * 结果文本 → 这一轮投出去之后发生了什么。
 * @param {unknown} resultText - 工具结果里的文本。
 * @returns {FormResult|undefined} 形状不认识时 undefined（调用方按调用失败处理）。
 */
function readResult(resultText) {
  const parsed = parseJson(resultText);
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') return undefined;
  return { shown: parsed.ok, message: typeof parsed.message === 'string' ? parsed.message : undefined };
}

/**
 * 读出一个表单行的模型：题面来自 argsRaw，状态来自结果。
 * @param {{ argsRaw?: unknown, resultText?: unknown, failed?: boolean }} input - argsRaw：调用的原始参数；
 *   resultText：结果文本（还没落库时为空）；failed：这次调用是否以失败收场。
 * @returns {{
 *   state: FormState,
 *   questions: Question[], message: string|undefined,
 * }} 表单模型；questions 为空表示参数还解析不出来（运行中或不是本插件的形状）。
 */
export function readFormModel({ argsRaw, resultText, failed = false }) {
  const questions = readQuestions(argsRaw);
  const result = readResult(resultText);
  /** @type {FormState} */
  let state;
  if (failed) state = 'error';
  else if (result !== undefined) state = result.shown ? 'form' : 'notShown';
  else if (typeof resultText === 'string' && resultText !== '') state = 'unknown';
  else state = 'running';
  return {
    state,
    questions,
    message: result === undefined ? undefined : result.message,
  };
}

/**
 * 这个模型该不该画成一张表：投出去了、而且题面读得出来（窗口把调用头截断时读不出题面）。
 *
 * 「哪种状态画什么」的两个判据只有这一份：轮次尾部与工具行都照着它决定画不画，
 * 免得两处各自解释同一批状态字面量。
 * @param {{ state: FormState, questions: Question[] }} model - readFormModel / readCallModel 的产物。
 * @returns {boolean} 画表时为 true。
 */
export function drawsForm(model) {
  return model.state === 'form' && model.questions.length > 0;
}

/**
 * 这个模型该不该画一行说明（入参被拒、被闸门拦下，或调用失败）。
 * @param {{ state: FormState }} model - readFormModel / readCallModel 的产物。
 * @returns {boolean} 画说明时为 true。
 */
export function drawsNote(model) {
  return model.state === 'notShown' || model.state === 'error';
}

/**
 * 结果里的第一段文本。本工具只渲染一段，形状不对就当没有结果。
 * @param {unknown} content - 结果 content 数组。
 * @returns {string|undefined} 文本。
 */
function firstText(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content.find((block) => isRecord(block) && block.type === 'text');
  return isRecord(text) && typeof text.text === 'string' ? text.text : undefined;
}

/**
 * 一次调用的 argsRaw：结果节点（有 `kind`）的调用头挂在 `call` 上（窗口截断时是 null），
 * 还没落结果的那次调用把 `argsRaw` 直接摊在自己身上。
 * @param {unknown} block - 工具调用块。
 * @returns {unknown} 原始参数文本；读不到时 undefined。
 */
function argsRawOf(block) {
  if (!isRecord(block)) return undefined;
  const settled = 'kind' in block;
  const call = isRecord(block.call) ? block.call : undefined;
  return (settled ? call?.argsRaw : block.argsRaw) ?? '';
}

/**
 * 失败行要显示的文字：结果里那段文本优先，没有就用错误的 name/code 拼一行。
 * @param {string|undefined} resultText - 结果文本。
 * @param {Record<string, unknown>|undefined} error - 结果节点上的错误。
 * @returns {string|undefined} 失败说明。
 */
function failureText(resultText, error) {
  if (resultText !== undefined && resultText !== '') return resultText;
  const parts = [error?.name, error?.code].filter((part) => typeof part === 'string' && part !== '');
  return parts.length === 0 ? undefined : parts.join(': ');
}

/**
 * 一个工具调用块 → 这个块自己的表单模型。取数规则全在这里，两个注册项（轮次尾部的表与
 * 工具行）都不许自己去猜块形状。
 *
 * `failure` 是失败行要显示的文字，只有真的以失败收场时才有。
 * @param {unknown} block - 工具调用块：结果节点，或还在跑/正在准备的那次调用。
 * @returns {{
 *   state: FormState,
 *   questions: Question[], message: string|undefined, failure: string|undefined,
 * }} 表单模型与失败说明。
 */
export function readCallModel(block) {
  if (!isRecord(block)) {
    return { ...readFormModel({ argsRaw: '', resultText: undefined, failed: false }), failure: undefined };
  }
  const settled = 'kind' in block;
  const resultText = settled ? firstText(block.content) : undefined;
  const failed = settled && block.isError === true;
  const error = isRecord(block.error) ? block.error : undefined;
  return {
    ...readFormModel({ argsRaw: argsRawOf(block), resultText, failed }),
    failure: failed ? failureText(resultText, error) : undefined,
  };
}

/**
 * 这一下点击算不算「选这一项」。两件不算：整行锁着的时候（冻结之后改不了了），以及点落在
 * 链接或按钮上（那是一次跳转，不是选这一项）。
 *
 * 放在这里而不是视图里，是为了能直接测：这是整行可点这个交互里唯一一条判断。
 * @param {boolean} locked - 这一行锁着没有。
 * @param {unknown} target - 点击落到的那个元素（拿不到时按普通点击算）。
 * @returns {boolean} 该切换勾选时为 true。
 */
export function selectsOnClick(locked, target) {
  if (locked) return false;
  const element = /** @type {{ closest?: (selector: string) => unknown }|null} */ (target);
  if (element === null || typeof element?.closest !== 'function') return true;
  return element.closest('a, button') === null;
}

/**
 * 归一化 localStorage 里读回来的作答：只认 `{[id]: {selected, custom}}` 这个形状。
 *
 * **形状对得上的空作答也留着**：一条「selected 是数组、且与 custom 都空」的记录不是脏数据，
 * 而是「用户把这题清空了」（最常见的是取消掉推荐项的默认勾选）。它与「用户没动过这题」必须
 * 分得开，否则默认勾选会在他取消之后又勾回来。不是这个形状的记录（比如 selected 是个字符串）
 * 一律丢掉：那种记录不是本插件写的，认成「清空过」会白白吃掉默认勾选。
 * @param {unknown} value - 解析出来的值。
 * @returns {AnswerTable} 干净的作答表。
 */
function sanitizeAnswers(value) {
  if (!isRecord(value)) return {};
  /** @type {AnswerTable} */
  const answers = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!isRecord(answer)) continue;
    const shaped = Array.isArray(answer.selected) || typeof answer.custom === 'string';
    const selected = Array.isArray(answer.selected) ? answer.selected.filter((item) => typeof item === 'string') : [];
    const custom = typeof answer.custom === 'string' ? answer.custom : '';
    if (!shaped && selected.length === 0 && custom === '') continue;
    answers[id] = { selected, custom };
  }
  return answers;
}

/**
 * 这一轮里一道题的作答：选中的项就是选项 label 本身，自填去掉首尾空白。
 * @param {unknown} answer - 该题的作答。
 * @returns {{selected: string[], custom: string}} 展示用的作答；没作答时两样都空。
 */
export function answerParts(answer) {
  if (!isRecord(answer)) return { selected: [], custom: '' };
  return {
    selected: Array.isArray(answer.selected) ? answer.selected.filter((item) => typeof item === 'string') : [],
    custom: typeof answer.custom === 'string' ? answer.custom.trim() : '',
  };
}

/**
 * 一道题的**项**：选中的选项各一项、自填整段算一项。拷问作答块按这个逐项写行，冻结摘要按它数
 * 「答了几题」；自填里的回车属于同一项，不拆。
 * @param {unknown} answer - 该题的作答。
 * @returns {{kind: 'option'|'custom', text: string}[]} 逐项；没作答时为空数组。
 */
export function answerItems(answer) {
  const { selected, custom } = answerParts(answer);
  return [
    ...selected.map((label) => /** @type {{kind: 'option'|'custom', text: string}} */ ({ kind: 'option', text: label })),
    ...(custom === '' ? [] : [/** @type {{kind: 'option'|'custom', text: string}} */ ({ kind: 'custom', text: custom })]),
  ];
}

/**
 * 一道题的导入段：题号一行 + 每一项一行。没作答时是空数组（题号也不写——块里没出现的题就是没作答）。
 *
 * 项文字里带换行的（多行自填）按行拆成多个项行：块里只许出现题号行与项行两种，
 * 落单的第三行是「块坏了」，所以这里不往外写这种行。反解把相邻的项行按换行拼回同一段自填，
 * 一来一回是同一份文字。
 * @param {Question} question - 题目模型。
 * @param {unknown} answer - 该题的作答。
 * @returns {string[]} 段内各行。
 */
export function importSegmentLines(question, answer) {
  const items = answerItems(answer);
  if (items.length === 0) return [];
  return [
    `${question.number}.`,
    ...items.flatMap((item) => item.text.split('\n').map((line) => `- ${line}`)),
  ];
}

/**
 * 「推荐的选项默认勾上」落到一份作答表上：用户没动过的题，标了推荐的选项就是选中态。
 * 用户动过（storage 里有这题的记录）的题一律以他的为准——包括他把默认项取消掉、只留一个空记录，
 * 所以这里只补**缺席**的题，绝不覆盖已有的作答。单选（`type: 'single'`）的题另把已有的作答
 * 收敛到至多一项——不分它是推荐默认、用户勾的、还是从实发消息里反解出来的。
 * @param {Question[]} questions - 题目模型。
 * @param {AnswerTable} answers - 用户自己的作答表（readStoredForm 的产物），或反解出来的那份。
 * @returns {AnswerTable} 表单上真正显示、导入、计数的作答表。
 */
export function applyRecommendedDefaults(questions, answers) {
  /** @type {AnswerTable} */
  const merged = isRecord(answers) ? { ...answers } : {};
  for (const question of questions) {
    if (merged[question.id] === undefined) {
      const selected = question.options.filter((option) => option.recommended).map((option) => option.label);
      if (selected.length > 0) merged[question.id] = { selected, custom: '' };
    }
    if (question.type === 'single' && merged[question.id] !== undefined) {
      merged[question.id] = selectOne(merged[question.id]);
    }
  }
  return merged;
}

/** 单选：一题的作答至多留一项（保留第一项，不是追加）。没选中时自填照旧。
 * @param {Answer} existing - 该题当前的作答。
 * @returns {Answer} 至多一项的作答。 */
function selectOne(existing) {
  const [kept] = existing.selected;
  return { selected: kept === undefined ? [] : [kept], custom: existing.custom };
}

/**
 * 生成导入文本的正文：有作答的题各占一段——题号一行，每个选中的项与自填各占一行、行首带记号。
 * 一项作答都没有时返回空串（空作答也是一种作答，块照样导出去，只是块里只有起止行）。
 *
 * 项与项之间不靠任何字符分拆，所以选项名或自填里出现顿号、冒号、换行都读得回来。
 * @param {Question[]} questions - 题目模型。
 * @param {AnswerTable} answers - 作答表。
 * @returns {string} 正文（不含拷问作答块的起止行）。
 */
export function importBody(questions, answers) {
  /** @type {string[]} */
  const blocks = [];
  for (const question of questions) {
    const lines = importSegmentLines(question, answers[question.id]);
    if (lines.length > 0) blocks.push(lines.join('\n'));
  }
  return blocks.join('\n');
}

/**
 * 这张表的作答块在草稿里的位置。起止行不配对、或块不属于这张表（身份记号不符）时按没有块处理。
 * @param {unknown} draft - 输入框草稿。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {{start: number, end: number}|undefined} 块的绝对区间；end 是收尾行之后的位置。
 */
function findImportBlock(draft, callId) {
  if (typeof draft !== 'string') return undefined;
  const start = draft.indexOf(importBlockStart(callId));
  if (start === -1) return undefined;
  const stop = draft.indexOf(IMPORT_BLOCK_END, start + importBlockStart(callId).length);
  if (stop === -1) return undefined;
  return { start, end: stop + IMPORT_BLOCK_END.length };
}

/**
 * 一整个拷问作答块（起止行都带上）。空作答也成块：两行起止行之间什么都没有。
 * @param {string} body - 块内正文。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {string} 含起止行的块文本。
 */
function blockTextOf(body, callId) {
  const start = importBlockStart(callId);
  return body === '' ? `${start}\n${IMPORT_BLOCK_END}` : `${start}\n${body}\n${IMPORT_BLOCK_END}`;
}

/** 草稿里这张表的块现在长什么样；没有块、或起止行不配对时 undefined（块内正文，不含起止行）。
 * @param {unknown} draft - 当前草稿。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {string|undefined} 块内正文。 */
export function importBlockBody(draft, callId) {
  const block = findImportBlock(draft, callId);
  if (block === undefined) return undefined;
  const text = /** @type {string} */ (draft).slice(block.start + importBlockStart(callId).length, block.end - IMPORT_BLOCK_END.length);
  return text.replace(/^\n/, '').replace(/\n$/, '');
}

/**
 * 把作答导入草稿：草稿里已有这张表的块就原地替换它本身（块外的字一个不动，别的表的块也不动），
 * 没有就把块放在最前面、用户原有的文字整段接在后面。空作答照导——导出去的是一块只有起止行的空块。
 * @param {unknown} draft - 当前草稿。
 * @param {string} body - importBody 的产物；空串时导出空块。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {string} 新的草稿文本。
 */
export function applyImport(draft, body, callId) {
  const text = typeof draft === 'string' ? draft : '';
  const block = blockTextOf(body, callId);
  const current = findImportBlock(text, callId);
  if (current !== undefined) return text.slice(0, current.start) + block + text.slice(current.end);
  return text === '' ? block : `${block}\n\n${text}`;
}

/**
 * 草稿里那张块是不是**当前这份作答**。用户点了导入之后又改表单，两边就不一致了——
 * 页面上据此把按键提示成「更新输入框」，而不是让他把旧答案发出去。
 *
 * 比的是逐行文本：手改过的块（多一个空行、改了一个字）算不一致，与导入键的语义一致
 * （再点一次就是覆盖）。
 * @param {unknown} draft - 当前草稿。
 * @param {string} body - 当前作答的正文（importBody 的产物）。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {boolean} 草稿里正是这一份时为 true；空作答的块也算一份（块在、里面什么都没有）。
 */
export function draftHasBody(draft, body, callId) {
  return importBlockBody(draft, callId) === body;
}

/** 现在（新格式）的问题行：一行只有题号与句点。 */
const QUESTION_LINE = /^(\d+)\.$/;
/** 一行的项记号：写成「- 项」，行首的空格不改变它是哪一项；切开后后半段不 trim——多行自填的回车就靠它读回来。 */
const ANSWER_ITEM_LINE = /^[ \t]*- /;

/**
 * 把拷问作答块里的各行拆成逐题的作答。
 *
 * 块里只认两种行：题号行（`1.`）起一题，项记号行（`- 项`）归上面那一题（匹配不上选项文字的并进自填，
 * 相邻的几行用换行拼回去）；空行不算内容。除了这两种行以外还有别的话、或一条题号都认不出来，
 * 整块就是坏的（交回空数组，调用方退回本地那份）——块内不许写说明文字。
 *
 * 认题只按题号对回题序，不认题干：题干重复或被改写都不影响回填。
 * @param {Question[]} questions - 题目模型。
 * @param {string} body - 块内文本（起止行已剥掉）。
 * @returns {AnswerEntry[]} 每条是 `{ question, selected, custom }`；一条都认不出时为空数组。
 */
function splitImportedBody(questions, body) {
  const lines = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  /** @type {Map<string, AnswerEntry>} */
  const found = new Map();
  /** @type {AnswerEntry|undefined} */
  let current;
  const flush = () => {
    if (current === undefined) return;
    found.set(current.question.id, current);
  };
  let stray = false;
  for (const line of lines) {
    const header = QUESTION_LINE.exec(line.trim());
    if (header !== null) {
      flush();
      const question = questions[/** @type {number} */ (Number(header[1])) - 1];
      current = question === undefined ? undefined : { question, selected: [], custom: '' };
      continue;
    }
    if (line.trim() === '') continue;
    const marker = ANSWER_ITEM_LINE.exec(line);
    if (marker === null) {
      stray = true;
      continue;
    }
    if (current === undefined) continue;
    const item = line.slice(marker[0].length);
    const option = current.question.options.find((candidate) => candidate.label === item);
    if (option === undefined) current.custom = current.custom === '' ? item : `${current.custom}\n${item}`;
    else current.selected.push(option.label);
  }
  flush();
  if (stray) return [];
  return [...found.values()].map((entry) => ({
    question: entry.question,
    selected: entry.selected,
    custom: entry.custom.replace(/^\n/, '').trim(),
  }));
}

/**
 * 逐条条目回到按 id 取用的作答表：块里没出现的题显式记成**没作答**（推荐默认因此不会被勾回来）。
 * @param {Question[]} questions - 题目模型。
 * @param {AnswerEntry[]} entries - splitImportedBody 的产物。
 * @returns {AnswerTable} 作答表。
 */
function asAnswerTable(questions, entries) {
  const answers = blankAnswers(questions);
  for (const entry of entries) {
    answers[entry.question.id] = { selected: entry.selected, custom: entry.custom };
  }
  return answers;
}

/** 一题的**没作答**：显式记一条空作答，推荐默认因此不会被勾回来。
 * @param {Question[]} questions - 题目模型。
 * @returns {AnswerTable} 每题都是空作答的作答表。 */
function blankAnswers(questions) {
  /** @type {AnswerTable} */
  const answers = {};
  for (const question of questions) answers[question.id] = { selected: [], custom: '' };
  return answers;
}

/**
 * 反解一段用户发言里**这张表**的作答块。三种结果分得开：
 *  - `none`：这段发言里没有这张表的块（用户没走表单、聊别的事、或答的是另一张表）；
 *  - `malformed`：块在，但一条题号都认不出来——形态坏了，调用方退回本地那份；
 *  - `parsed`：按题号认回来，块里没出现的题显式记成**没作答**。
 *
 * 起止行必须配对且身份相符：块由它自己说它是哪张表的，不靠全局。
 * @param {unknown} text - 用户发言的文字。
 * @param {Question[]} questions - 题目模型。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {ParseHit|ParseMiss} 反解结果。
 */
export function parseImportedAnswersResult(text, questions, callId) {
  const body = importBlockBody(text, callId);
  if (body === undefined) return { kind: 'none', answers: undefined };
  if (isBlank(body)) return { kind: 'parsed', answers: blankAnswers(questions) };
  const entries = splitImportedBody(questions, body);
  return entries.length === 0
    ? { kind: 'malformed', answers: undefined }
    : { kind: 'parsed', answers: asAnswerTable(questions, entries) };
}

/**
 * 冻结那一刻表单上显示的作答。以实发消息里那张块为准（用户在原生输入框里改过、增删过的都以那条
 * 消息为准），块里没出现的题就是**没作答**；块在但形态坏了才退回本地那份（内容不凭空消失，
 * 但那只是本地记录）。
 * @param {Question[]} questions - 题目模型。
 * @param {AnswerTable} storedAnswers - 用户自己的作答表（readStoredForm 的产物）。
 * @param {unknown} text - 实发消息的文字。
 * @param {unknown} callId - 这张表那次调用的 id。
 * @returns {{ answers: AnswerTable, fallback: boolean }} 冻结渲染要用的作答表，以及它是不是退回的本地那份。
 */
export function frozenFormAnswers(questions, storedAnswers, text, callId) {
  const parsed = parseImportedAnswersResult(text, questions, callId);
  if (parsed.kind === 'parsed') {
    // 反解出来的那份照样过一遍收敛：块的形状是用户手写的，单选那题写了两行选项也只会留一项。
    return { answers: applyRecommendedDefaults(questions, parsed.answers), fallback: false };
  }
  return { answers: applyRecommendedDefaults(questions, storedAnswers), fallback: true };
}

// --- 闸门：会话事件 → 有没有一张表在等用户作答（宿主半边用，界面不读） ---

/**
 * 闸门投影的初值：没有调用、也没有表在等。
 * @returns {FormGate} 初值。
 */
export function initialFormGate() {
  return { call: null, pending: null };
}

/**
 * 会话事件往前走一步。只认三件事，其余原样返回**同一个引用**（投影的驱动按引用判有没有变）：
 *
 *  - `tool/call` 是本工具且题面读得出来 ⇒ 记下这次调用（还只是候选，投没投出去要等结果）；
 *  - 它的 `tool/result` 说 `ok: true` ⇒ 这张表投出去了，进 `pending`；说别的（入参被拒、被闸门
 *    拦下）⇒ 候选丢掉，**前一张待答的表不动**；
 *  - 用户发言里出现这张表的身份记号 ⇒ 它被答了，`pending` 清空。转向消息、聊别的事、答别的表
 *    都不清空它。
 *
 * 读闸门发生在调用事件之后、结果事件之前，所以两个槽位必须分开：那时新调用已经进了 `call`，
 * 而它有没有真的投出去还不知道。
 * @param {FormGate} state - 当前状态。
 * @param {SessionEventLike} event - 会话事件。
 * @returns {FormGate} 新状态；不关本插件的事件时是入参本身。
 */
export function foldFormGate(state, event) {
  if (!isRecord(event) || typeof event.type !== 'string') return state;
  const data = isRecord(event.data) ? event.data : {};
  if (event.type === 'tool/call' && data.name === TOOL_NAME) {
    const questions = readQuestions(data.arguments);
    if (questions.length === 0) return state;
    const callId = typeof data.callId === 'string' ? data.callId : String(data.callId ?? '');
    return {
      ...state,
      call: {
        callId,
        questions: questions.map((question) => question.question),
        seq: typeof event.seq === 'number' ? event.seq : -1,
      },
    };
  }
  if (event.type === 'tool/result') {
    const call = state.call;
    if (call === null) return state;
    const message = isRecord(data.message) ? data.message : undefined;
    if (message === undefined || String(message.toolCallId) !== call.callId) return state;
    const result = readResult(firstText(message.content));
    return result !== undefined && result.shown
      ? { call: null, pending: call }
      : { ...state, call: null };
  }
  if (event.type === 'user/message') {
    const pending = state.pending;
    if (pending === null) return state;
    // 认的是**配对的块**，不是那行开头：只有一句开头（没有收尾行）什么都没答。
    return importBlockBody(messageText(data), pending.callId) === undefined
      ? state
      : { ...state, pending: null };
  }
  return state;
}

/**
 * 这一轮是否已经过去：记录里出现了这条调用之后（seq 更大）、且**带着这张表的作答块**的用户发言。
 * 认不出这条调用、或界面还拿不到记录时一律返回 undefined——把表单当只读卡住比多显示一次可编辑
 * 更糟（答案没地方写）。转向消息、聊别的事、答别的表都不算：它们不是这张表的作答。
 *
 * 交回的是**最早的那一条**：更晚的发言属于后面的轮次，拿它重画这一轮必然串味。
 * 认的是**配对且记号相符的块**（起止行都在），不是那行开头：转向消息里顺口提起开头那行也不算数。
 * @param {unknown} nodes - chat 视图的 legacy.nodes。
 * @param {unknown} callId - 本次工具调用的 callId。
 * @returns {unknown} 那条用户发言节点；这张表还没被作答时为 undefined。
 */
export function formReplyAfter(nodes, callId) {
  if (!Array.isArray(nodes)) return undefined;
  const mine = nodes.find((node) => isRecord(node) && node.callId === callId);
  if (!isRecord(mine) || typeof mine.seq !== 'number') return undefined;
  const mineSeq = mine.seq;
  /** @type {Record<string, unknown>|undefined} */
  let reply;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.kind !== 'user' && node.kind !== 'steering') continue;
    if (typeof node.seq !== 'number' || node.seq <= mineSeq) continue;
    if (importBlockBody(messageText(node), callId) === undefined) continue;
    if (reply === undefined || node.seq < /** @type {number} */ (reply.seq)) reply = node;
  }
  return reply;
}

/**
 * 一条发言的文字：内容块里的文本段接起来（附件、图片这些段没有文字可反解）。
 * 发过来的既可以是 chat 视图里的发言节点，也可以是会话事件里的 `user/message`——两者都摊着
 * `content`，所以这一份实现两处共用。
 * @param {unknown} node - 用户发言节点或消息本体。
 * @returns {string} 发言文字；没有文字时为空串。
 */
export function messageText(node) {
  const content = isRecord(node) && Array.isArray(node.content) ? node.content : [];
  return content
    .filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => /** @type {string} */ (isRecord(block) ? block.text : ''))
    .join('\n');
}

/**
 * 本轮里那次 `grilling_form` 调用。位置由 chat 的位置索引给出（按轮次取本轮的节点键），
 * 所以不靠 seq 猜边界；投出即结束本轮，取**最后一次**——被拒之后又投的那一次才算数。
 * @param {unknown} chat - chat 视图快照（ChatSnapshotLike）。
 * @param {unknown} turn - 轮次号。
 * @returns {{ block: unknown, toolName: unknown, callId: unknown }|undefined} 本轮的表单调用；没有就不画。
 */
export function roundCall(chat, turn) {
  if (!isRecord(chat)) return undefined;
  const snapshot = /** @type {ChatSnapshotLike} */ (chat);
  const keys = snapshot.locations?.getTurn?.(turn);
  if (!Array.isArray(keys)) return undefined;
  const getNode = snapshot.nodes?.get;
  if (typeof getNode !== 'function') return undefined;
  /** @type {{ block: unknown, toolName: unknown, callId: unknown }|undefined} */
  let found;
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const node = getNode.call(snapshot.nodes, key);
    if (!isRecord(node) || node.kind !== 'tool-call') continue;
    const data = isRecord(node.data) ? node.data : undefined;
    const block = data?.root;
    if (!isRecord(block)) continue;
    const call = isRecord(block.call) ? block.call : undefined;
    const toolName = typeof call?.name === 'string' ? call.name : block.name;
    if (toolName !== TOOL_NAME) continue;
    found = { block, toolName, callId: block.callId };
  }
  return found;
}

/** 往后找替代者时最多看这么多轮：翻过头就停，不拿一张坏快照把页面拖住。 */
const LATER_TURN_LIMIT = 200;

/**
 * 这张表后来有没有被**明确取代**：后面某一轮又投出了一张带 `replace: true` 的表。
 * 只认投出去的那一次（被判违规或拦下的那次不算）；后面没有轮次了就停。
 *
 * 已答的表不算被取代——它自己那份作答块到了就锁在自己那条发言上（调用方先判作答、再判这个）。
 * @param {unknown} chat - chat 视图快照（ChatSnapshotLike）。
 * @param {unknown} turn - 这张表所在的轮次号。
 * @returns {boolean} 后面那张把它取代了时为 true。
 */
export function supersededAfter(chat, turn) {
  if (!isRecord(chat) || typeof turn !== 'number') return false;
  const snapshot = /** @type {ChatSnapshotLike} */ (chat);
  for (let later = turn + 1; later <= turn + LATER_TURN_LIMIT; later++) {
    const keys = snapshot.locations?.getTurn?.(later);
    if (!Array.isArray(keys) || keys.length === 0) return false;
    const round = roundCall(chat, later);
    if (round === undefined) continue;
    if (readCallModel(round.block).state !== 'form') continue;
    if (replacesEarlier(argsRawOf(round.block))) return true;
  }
  return false;
}


/**
 * 这一轮取代的是哪一张：往前找最近一张**投出去过、自己的作答块还没到**的表——它此刻被这一轮顶掉。
 * 只有带 \`replace: true\` 的那一轮才有「被取代者」（别的轮次只是又投了一张，闸门根本不会让它投出）。
 * 已答的表不算：它锁在自己那条发言上（调用方先判作答、再判这个）。
 *
 * 交回它的题面：新表要把题干一模一样的那些题的勾选搬过来。
 * @param {unknown} chat - chat 视图快照（ChatSnapshotLike）。
 * @param {unknown} turn - 这一轮的轮次号。
 * @returns {{ callId: unknown, questions: Question[] }|undefined} 被取代的那张表。
 */
export function replacedForm(chat, turn) {
  if (!isRecord(chat) || typeof turn !== 'number') return undefined;
  const mine = roundCall(chat, turn);
  if (mine === undefined || !replacesEarlier(argsRawOf(mine.block))) return undefined;
  const snapshot = /** @type {ChatSnapshotLike} */ (chat);
  for (let earlier = turn - 1; earlier >= turn - LATER_TURN_LIMIT && earlier >= 0; earlier--) {
    const keys = snapshot.locations?.getTurn?.(earlier);
    if (!Array.isArray(keys) || keys.length === 0) continue;
    const round = roundCall(chat, earlier);
    if (round === undefined) continue;
    const model = readCallModel(round.block);
    if (model.state !== 'form' || model.questions.length === 0) continue;
    if (formReplyAfter(snapshot.legacy?.nodes, round.callId) !== undefined) return undefined;
    return { callId: round.callId, questions: model.questions };
  }
  return undefined;
}

/**
 * 把旧表里那些**题干原文一模一样**的题的作答搬到新表上：改一个字就不搬。
 *
 * 搬过来的勾选只留新表还认得的那几项——选项被改名或去掉之后，那个勾选在新表上已经不存在，
 * 照搬会写出一条用户没勾过的作答。自填原样带过来。旧表上「用户把这题清空了」那条记录也照搬，
 * 新表的推荐默认因此不会在他没动过的地方替他勾回来。
 * @param {Question[]} oldQuestions - 被取代那张表的题面。
 * @param {Question[]} newQuestions - 新表的题面。
 * @param {AnswerTable} oldAnswers - 旧表上用户自己那份作答（readStoredForm 的产物）。
 * @returns {AnswerTable} 落到新表题目 id 上的作答；没有可搬的题时是空表。
 */
export function carryOverAnswers(oldQuestions, newQuestions, oldAnswers) {
  /** @type {AnswerTable} */
  const carried = {};
  for (const question of newQuestions) {
    const source = oldQuestions.find((candidate) => candidate.question === question.question);
    if (source === undefined) continue;
    const answer = isRecord(oldAnswers) ? oldAnswers[source.id] : undefined;
    if (!isRecord(answer)) continue;
    const { selected, custom } = answerParts(answer);
    carried[question.id] = {
      selected: selected.filter((label) => question.options.some((option) => option.label === label)),
      custom,
    };
  }
  return carried;
}

/**
 * 这一轮取代了前面那张表时，用户点导入把草稿里旧表那块换成新表那块：旧块整段拿掉，新的放在
 * 它原来占的位置；旧块不在草稿里就等价于一次普通导入（表里有新表的块就原地换，没有就放在最前面）。
 *
 * 用户自己手打的那几段字一个不动——换掉的只有这两张表的块。
 * @param {unknown} draft - 当前草稿。
 * @param {unknown} fromCallId - 被取代那张表的调用 id。
 * @param {string} body - 新表的作答正文（importBody 的产物）。
 * @param {unknown} callId - 新表那次调用的 id。
 * @returns {string} 新的草稿文本。
 */
export function carryImport(draft, fromCallId, body, callId) {
  const text = typeof draft === 'string' ? draft : '';
  const from = findImportBlock(text, fromCallId);
  if (from === undefined) return applyImport(text, body, callId);
  const without = text.slice(0, from.start) + text.slice(from.end);
  const current = findImportBlock(without, callId);
  const block = blockTextOf(body, callId);
  if (current !== undefined) return without.slice(0, current.start) + block + without.slice(current.end);
  return without.slice(0, from.start) + block + without.slice(from.start);
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

/**
 * 读回整份存储并解析成记录；storage 不可用、键不存在、值形状不对都只是空表。
 * @param {unknown} storage - 带 getItem 的存储。
 * @param {string} key - formStorageKey 的产物。
 * @returns {Record<string, unknown>} 记录形状的那份存储；读不出来时为空表。
 */
function readStorage(storage, key) {
  if (!isRecord(storage) || typeof storage.getItem !== 'function') return {};
  try {
    const parsed = parseJson(storage.getItem(key));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 读回本轮的作答。storage 不可用、键不存在、值形状不对都只是「什么都没选」。
 * @param {StorageLike|undefined} storage - 带 getItem/setItem 的存储（可为 undefined）。
 * @param {string} key - formStorageKey 的产物。
 * @param {unknown} callId - 本次调用的 callId。
 * @returns {AnswerTable} 作答表。
 */
export function readStoredForm(storage, key, callId) {
  const all = readStorage(storage, key);
  return sanitizeAnswers(all[storageCallId(callId)]);
}

/**
 * storage 里那层的键。对象取值本来就会把键强制成字符串，`String()` 与原来的写法逐字等价
 * （`undefined` → `"undefined"`、`7` → `"7"`），只是把一个 `unknown` 收成可索引的类型。
 * @param {unknown} callId - 本次调用的 callId。
 * @returns {string} storage 里用的键。
 */
function storageCallId(callId) {
  return String(callId);
}

/**
 * 存下本轮的作答，不动同一个会话里别的轮次。存不进去（配额、隐私模式）只让这一份活在内存里。
 * @param {StorageLike|undefined} storage - 带 getItem/setItem 的存储（可为 undefined）。
 * @param {string} key - formStorageKey 的产物。
 * @param {unknown} callId - 本次调用的 callId。
 * @param {AnswerTable} answers - 作答表。
 * @returns {void}
 */
export function writeStoredForm(storage, key, callId, answers) {
  if (!isRecord(storage) || typeof storage.setItem !== 'function') return;
  const all = readStorage(storage, key);
  try {
    storage.setItem(key, JSON.stringify({ ...all, [storageCallId(callId)]: sanitizeAnswers(answers) }));
  } catch {
    // 配额满 / 隐私模式：表单照常在内存里能填，只是刷新后不恢复
  }
}

/**
 * 一个记录是不是那张表的记录。storage 与投影都可能读回别人写的东西，判过形状再用。
 * @param {unknown} value - 待判定的值。
 * @returns {value is FormCall} 是那张表的记录时为 true。
 */
function isFormCall(value) {
  return isRecord(value)
    && typeof value.callId === 'string'
    && Array.isArray(value.questions)
    && value.questions.every((question) => typeof question === 'string')
    && typeof value.seq === 'number';
}

/**
 * 投影状态从存储里读回来时的收口：形状不对就还原成初值（那只会让闸门松一格，不会拦错人）。
 * @param {unknown} value - 读回来的状态。
 * @returns {FormGate} 闸门状态。
 */
function normalizeGate(value) {
  if (!isRecord(value)) return initialFormGate();
  return {
    call: isFormCall(value.call) ? value.call : null,
    pending: isFormCall(value.pending) ? value.pending : null,
  };
}

/**
 * 闸门状态里那张还在等作答的表；没有就返回 null。
 * @param {unknown} state - 投影读出来的状态。
 * @returns {FormCall|null} 待答的表。
 */
export function pendingFormOf(state) {
  return isRecord(state) && isFormCall(state.pending) ? state.pending : null;
}

/**
 * 闸门这个会话投影单元。宿主半边把它注册进投影表：`stateSchema` 只服务「从存储里读回来」这一条
 * 路（契约要一个带 parse 的 schema），这里的取值只可能是本包自己写出去的那一份。
 *
 * `stateVersion` 在状态字段或折叠语义变化时加一——加一之后旧存储里的那份会被丢掉重折。
 * @type {{ key: string, stateVersion: number, stateSchema: { parse: (value: unknown) => FormGate }, init: () => FormGate, apply: (state: FormGate, event: SessionEventLike) => FormGate }}
 */
export const FORM_GATE_UNIT = {
  key: GATE_KEY,
  stateVersion: 1,
  stateSchema: { parse: (value) => normalizeGate(value) },
  init: () => initialFormGate(),
  apply: (state, event) => foldFormGate(state, event),
};

