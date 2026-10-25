/**
 * 发给翻译模型的请求前缀，以及「打包成多段」时追加的那一段说明。
 *
 * 这段文字是配置页上可改的一项：Host 的 Config 里 `prompt` 存用户改写过的
 * 那一份，空着就用 {@link DEFAULT_PROMPT}。两半边都读本模块——宿主半边拿它
 * 拼请求前缀，浏览器半边拿它填满提示词输入框、并在「恢复默认」时放回原样。
 *
 * 请求里只有一条 user 消息：前缀在前，待译正文在后（见 `server/adapters/openai.ts`）。
 *
 * 内置默认的写法有几条是承载行为的，改文案时别把它们删掉：
 *
 * - 两个短例排在最前，写成「输入/输出」的对话样式。示例决定模型把中文当
 *   待译内容还是当抄写对象；排到规则后面、或写成「原文/译文」，模型会把示例
 *   连同规则一起搬进译文。
 * - 首句的动词是「原样抄写」，不是「翻译」或「整理」。写成后者时模型回到
 *   改写模式，已经通顺的中文会被换一套说法。
 * - 送来的每一段都交给模型（判据见 `client/chat/conclusion.ts`），所以
 *   抄写后面必须留「只有句子读不通时才改那几句」：那是它唯一被允许改动
 *   中文的入口。
 * - 「保持 Markdown 记号」是必要提醒。宿主会按行签名把结构修回去
 *   （`pipeline/segments.ts`），提示词只管让模型少制造要修的地方，不逐条
 *   规定行数、链接括号这些细节——那些由代码兜底。
 *
 * 「原文分几段的，译文也分几段，一段都不要少」不在默认里，由
 * {@link promptFor} 按待译正文**追加**：小模型会把开头那段当整段交差、后面
 * 几段整段不写，这一句能把丢段压到零；但它同时会让本来就只有一段的中文被
 * 多改一遍（实测同样的五条单段样本，改动率从约 2% 升到约 10%）。所以它只在
 * 正文自己分了段时才出现——那一刻丢段才是真正的风险。
 *
 * 代码围栏在送模型之前就被切掉了（`pipeline/segments.ts`），所以这里不提
 * 围栏本身，只按括号形状描述打包标记：点名具体字符会让模型把整段约定当成
 * 待译内容。
 */
export const DEFAULT_PROMPT = [
  `例：`,
  `输入：The build passed.`,
  `输出：构建通过。`,
  `输入：这一版改好了。`,
  `输出：这一版改好了。`,
  ``,
  `下面这段文字：外文译成简体中文；中文原样抄写，只有句子读不通时才改那几句。`,
  `保持原有的 Markdown 记号不变。只输出结果。`,
].join('\n');

/**
 * 多段正文追加的一句：原文分几段，译文就分几段，一段都不许少。
 *
 * 它单独成句、接在默认指令之后，不并进上面那句话：并进去会失效。待译正文
 * 只有一段时它不出现——那时它没有要保的东西，只会让中文被多改一遍。
 */
export const PARAGRAPH_KEEP_CLAUSE = `原文分几段的，译文也分几段，一段都不要少。`;

/**
 * 打包成多段时追加的一段：说清每段自带一行标记、标记要原样带出、段与段不
 * 许合并。它是请求形状的约定，不是译文风格，所以跟着拼请求时自动追加，配置
 * 页上只让人改上面那段正文指令。
 */
export const BATCH_PROMPT_CLAUSE =
  `下面每段都以单独一行标记开头，标记由两个括号夹着一个编号。每段先原样输出那一行标记，再在下一行写这段的译文，顺序不变，段与段不要合并。`;

/**
 * 当前生效的指令正文：用户改写过的优先，空白视为没写过。
 * @param prompt - Config 里 `prompt` 的值，可能是空串。
 * @returns 拼在待译正文前面的那段文字。
 */
export function resolvePrompt(prompt: string | undefined): string {
  const trimmed = (prompt ?? '').trim();
  return trimmed === '' ? DEFAULT_PROMPT : trimmed;
}

/** 空行分隔的段落数：待译正文自己分了几段。 */
function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).filter((part) => part.trim() !== '').length;
}

/**
 * 拼一条请求真正用的前缀：生效的指令，正文分了段时再接上
 * {@link PARAGRAPH_KEEP_CLAUSE}。
 *
 * 追加的最后一句是给模型看的最后一条要求，所以它排在生效指令的末尾——生效
 * 指令由读者改写时同样如此，成段保真不归读者维护。
 *
 * @param text - 这一次要送出去的待译正文（打包时带标记的整段负载）。
 * @param prompt - the prompt as configured; blank means the built-in default.
 * @returns 拼在待译正文前面的那段文字。
 */
export function promptFor(text: string, prompt?: string): string {
  const base = resolvePrompt(prompt);
  if (paragraphCount(text) < 2) return base;
  return `${base}\n${PARAGRAPH_KEEP_CLAUSE}`;
}

/**
 * 这份草稿是不是就等于内置默认（空着、或一字不差地写着默认都算）。
 *
 * 配置页上有三处要判同一件事：草稿脏不脏、保存时写不写 `unset`、「恢复默认」
 * 该不该置灰。三处共用这一个判断，免得同一个规则有三种写法。
 *
 * @param draft - 输入框里此刻的文字。
 * @returns 生效后就是内置默认则为 true。
 */
export function isDefaultPrompt(draft: string | undefined): boolean {
  return resolvePrompt(draft) === DEFAULT_PROMPT;
}
