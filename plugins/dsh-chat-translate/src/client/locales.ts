/** Locale bundles for the chat-translate card inside the shared 「阅读体验」 page. */

/** Dictionary namespace owned by this plugin's settings card. */
export const NS = 'settings.chatTranslate';

/**
 * Chinese copy — the single source of truth for the key set. `{name}` markers
 * are either template params filled through `t(key, params)` / `.replace()`, or
 * inline technical samples rendered by `withSamples` at the call site.
 */
export const zh = {
  pageNav: '阅读体验',
  title: '正文翻译',

  masterTitle: '翻译总开关',
  enableTranslation: '启用翻译',
  masterDesc:
    '自动把助手回答正文翻成中文（如 {example}）：折叠块里的过程正文与最终汇总一视同仁，整段中文的块也照送，由模型一并改写成自然中文、顺掉机器腔。Think 卡与工具调用行不翻，代码块原样保留。正文块的左缘一条竖线报出状态：正在读译文是蓝线，备着译文正读原文是灰细线，没译成是红实线（鼠标悬停热区报出通道细节——超时、断流或空返回；译文的结构漂移由宿主自动修回或重掷，不再因格式问题挂红线），正在请求是灰脉动线，没送过模型或开关关闭没有线。切换不在正文上：贴着那条线的窄带才是操作区，鼠标移到它上面变手型，点一下在译文与原文间切换——正文整块不再响应点击，选字、拖选复制都不会误触；模型认为原样最好、返回一模一样的文字时同样算翻译过、同样可切。挂红线的块右侧常驻一个小 ↻，点那条窄带即整行重新翻译，已成功的块保持显示不打扰。通道失败不自动重试，恢复后由你点那条窄带救活。译文按原 markdown 格式重新渲染，表格、列表、加粗与行内代码保持结构。回答还在流式输出时不翻，落定后按阅读顺序逐段出中文。只作用于当前查看的会话，译文不写回会话上下文。输入框下方那一行有同款开关，两处状态同步。',

  aiTitle: 'AI 翻译（OpenAI 兼容协议）',
  aiRule: '只有这一条通道：Key / Base URL / 模型齐备才会翻译，缺任何一项都保持原文。',
  badgeConfigured: '已配置',
  badgeUnconfigured: '未配置',

  apiKeyTitle: 'API Key',
  apiKeyDesc: '保存至 {home} 的 {ref}，保存后立即生效；留空保存 = 清除',
  apiKeyPlaceholderConfigured: '已配置（如需更换请直接输入）',
  save: '保存',
  saving: '保存中…',
  keySaved: '已保存到 {home}，立即生效',
  keyCleared: '已清除 API Key（未配置时正文保持原文，不会翻译）',
  saveFailed: '保存失败：{error}',
  unknownError: '未知错误',

  baseUrlTitle: 'Base URL',
  baseUrlDesc: '任意 OpenAI 兼容服务端点，如 {url1}、{url2}',
  modelTitle: '模型',
  modelDesc: '如 {model1}、{model2}；留空视为未配置',

  timeoutTitle: '单次请求超时',
  timeoutDesc: '单位毫秒，范围 500-900000。一条长回答可能要几分钟，默认 600000。',

  test: '测试 AI 通道',
  testing: '测试中…',
  testOk: '连接正常，延迟 {latency}ms',
  testFail: '失败：{error}',

  behaviorTitle: '翻译范围',
  behaviorRule:
    '助手回答正文一律翻译，包括最终汇总与整段中文的块：中文块同样交给模型改写成自然中文，意义、术语与数字不变；空白块不送译、不挂线。思考链正文、工具调用标题与折叠摘要不翻译，代码块及其内部原样保留。',

  dockLabel: '译',
  dockOn: '正文翻译已开启，点击关闭',
  dockOff: '正文翻译已关闭，点击开启',

  failTitle: '翻译失败',
  retryAria: '翻译失败，点左缘那条窄带可按 Enter 重试',
  toggleToOriginalAria: '查看原文',
  toggleToTranslatedAria: '查看译文',
  inflightAria: '翻译中，此处暂无动作',
} as const;

/** Locale keys this plugin renders. */
export type ChatTranslateLocaleKey = keyof typeof zh;

/** English copy; the same key set as {@link zh}. */
export const en: Record<ChatTranslateLocaleKey, string> = {
  pageNav: 'Reading',
  title: 'Reply translate',

  masterTitle: 'Translation master switch',
  enableTranslation: 'Enable translation',
  masterDesc:
    'Automatically translates assistant reply prose (e.g. {example}) into Chinese: text inside disclosure blocks and the final summary are treated alike, and blocks written entirely in Chinese go through the model too, which rewrites them into natural Chinese and smooths out machine-flavored phrasing. Think cards and tool-call rows are never translated, and code blocks stay untouched. Each prose block reports its state with a left-edge line: blue while its translation reads, thin grey while the original reads with a translation waiting one click away, solid red when translation failed (hover the slim strip beside the line to read the channel detail — a timeout, a broken stream or an empty return; the answer\'s Markdown shape drift is repaired or re-rolled by the host, so formatting no longer draws a red line), a grey pulse while a request is in flight, and nothing at all when the block was never sent or the switch is off. Switching does not live on the prose: a slim strip hugging that line is the control — the pointer turns into a hand over it, and one click swaps translation and original, while the prose itself no longer reacts to clicks, so selecting or drag-copying text never triggers a swap by accident. A reply the model returned unchanged still counts as translated and stays switchable. A red-lined block keeps a small ↻ beside it; clicking the strip re-runs the whole row, with already-successful blocks kept on screen undisturbed. Channel failures are never retried automatically: once the channel recovers, a click on that strip revives the row. Translations are re-rendered as Markdown, so tables, lists, bold runs and inline code keep their structure. A reply that is still streaming is left alone until it settles, then prose turns to Chinese paragraph by paragraph in reading order. Applies to the session you are viewing only; translations never enter the conversation context. The same switch sits on the row below the composer, sharing its state.',

  aiTitle: 'AI translation (OpenAI-compatible)',
  aiRule:
    'This is the only channel: translation runs when Key, Base URL and model are all present; missing any one leaves the text as it is.',
  badgeConfigured: 'Configured',
  badgeUnconfigured: 'Not configured',

  apiKeyTitle: 'API Key',
  apiKeyDesc: 'Saved as {ref} in {home}; takes effect immediately. Saving an empty value clears it.',
  apiKeyPlaceholderConfigured: 'Configured (type a new value to replace it)',
  save: 'Save',
  saving: 'Saving…',
  keySaved: 'Saved to {home}; takes effect immediately',
  keyCleared: 'API Key cleared (with nothing configured, replies stay in their original language)',
  saveFailed: 'Save failed: {error}',
  unknownError: 'Unknown error',

  baseUrlTitle: 'Base URL',
  baseUrlDesc: 'Any OpenAI-compatible endpoint, e.g. {url1} or {url2}',
  modelTitle: 'Model',
  modelDesc: 'e.g. {model1} or {model2}; empty counts as unconfigured',

  timeoutTitle: 'Per-request timeout',
  timeoutDesc: 'In milliseconds, range 500-900000. One long reply can take minutes; default 600000.',

  test: 'Test the AI channel',
  testing: 'Testing…',
  testOk: 'Connected, {latency}ms latency',
  testFail: 'Failed: {error}',

  behaviorTitle: 'What gets translated',
  behaviorRule:
    'All assistant reply prose, the final summary and Chinese-only blocks included: Chinese blocks are also handed to the model, which rewrites them into natural Chinese while keeping meaning, terms and numbers unchanged; blank blocks are never sent and never marked. Think-chain text, tool-call titles and folded summaries are never translated; code blocks and their contents stay untouched.',

  dockLabel: 'Translate',
  dockOn: 'Translation is on; click to turn it off',
  dockOff: 'Translation is off; click to turn it on',

  failTitle: 'Translation failed',
  retryAria: 'Translation failed — focus the slim strip at the left edge and press Enter to retry',
  toggleToOriginalAria: 'Show the original',
  toggleToTranslatedAria: 'Show the translation',
  inflightAria: 'Translating; Enter does nothing yet',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.chatTranslate': ChatTranslateLocaleKey;
  }
}

/**
 * 助手行渲染器的自带文案通道：行的 `t` 座次是宿主 `chat` 词典（chrome 文案
 * 与宿主逐字一致），插件私有的「重试」词汇不在其中。客户端启动时把本命名
 * 空间的活翻译器绑进来（`locale.bind(NS)`，语言切换即随动），渲染层在渲染时
 * 经 {@link rowCopy} 取。未绑定（单测/无 locale 服务）回退 zh 字面量，与宿主
 * 默认语言一致。
 */
let rowT: (key: ChatTranslateLocaleKey) => string = (key) => zh[key] ?? key;

export function bindRowCopy(
  locale: { bind?(namespace: string): (key: string) => string } | null | undefined
): void {
  if (locale && typeof locale.bind === 'function') {
    const bound = locale.bind(NS);
    if (typeof bound === 'function') rowT = bound as typeof rowT;
  }
}

export function rowCopy(): {
  retryAria: string;
  /** 热区动作的读屏标签：读译文时提示可切回原文，反之亦然。 */
  toggleToOriginalAria: string;
  toggleToTranslatedAria: string;
  /** 在途热区的读屏标签：说清此刻按下去没有动作。 */
  inflightAria: string;
  /** 失败块悬停文案：本地化标签 + 服务端原样带来的技术一句（通道伤）。 */
  failTitle: (detail?: string | null) => string;
} {
  return {
    retryAria: rowT('retryAria'),
    toggleToOriginalAria: rowT('toggleToOriginalAria'),
    toggleToTranslatedAria: rowT('toggleToTranslatedAria'),
    inflightAria: rowT('inflightAria'),
    failTitle: (detail) => {
      const label = rowT('failTitle');
      return detail === undefined || detail === '' || detail === null ? label : `${label} — ${detail}`;
    },
  };
}
