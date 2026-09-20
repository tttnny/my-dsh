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
  title: '聊天翻译',

  masterTitle: '翻译总开关',
  enableTranslation: '启用翻译',
  masterDesc:
    '自动将当前会话中工具调用标题（如 {example}）翻译为中文，点击译文可原地切换原文/译文。思考正文默认不翻译，由 AI 卡片里的「显示思考链翻译按钮」控制：打开后展开的思考卡右侧出现按钮，点击才翻译。思考卡折叠起来的那一行摘要永不翻译。仅作用于当前查看的会话，回答正文永不翻译。',

  aiTitle: 'AI 翻译（OpenAI 兼容协议）',
  enableAi: '启用 AI 翻译通道',
  badgeConfigured: '已配置',
  badgeUnconfigured: '未配置',
  aiFallbackNote: '未配置时 AI 通道自动跳过，由 Bing 兜底。',

  apiKeyTitle: 'API Key',
  apiKeyDesc: '保存至 {home} 的 {ref}，保存后立即生效；留空保存 = 清除',
  apiKeyPlaceholderConfigured: '已配置（如需更换请直接输入）',
  save: '保存',
  saving: '保存中…',
  keySaved: '已保存到 {home}，立即生效',
  keyCleared: '已清除 API Key（AI 通道将不可用，Bing 兜底）',
  saveFailed: '保存失败：{error}',
  unknownError: '未知错误',

  baseUrlTitle: 'Base URL',
  baseUrlDesc: '任意 OpenAI 兼容服务端点，如 {url1}、{url2}',
  modelTitle: '模型',
  modelDesc: '如 {model1}、{model2}；留空视为未配置',

  test: '测试 AI 通道',
  testing: '测试中…',
  testOk: '连接正常，延迟 {latency}ms',
  testFail: '失败：{error}',

  thinkEnableTitle: '显示思考链翻译按钮',
  thinkEnableDesc:
    '在展开的思考卡的「Think」右侧显示一个按钮，点击才翻译这条思考正文（不会自动翻译）；折叠起来的卡片没有按钮，展开后按钮才出现。翻译中按钮转圈，翻好后实心高亮，再点一下整条切回原文（正文里的点击不切换）。代码块与折叠摘要不动，Bing 通道不参与。关闭此开关会撤掉按钮并还原已翻译内容。',
  thinkTimeoutTitle: '思考链翻译超时',
  thinkTimeoutDesc: '单位毫秒，范围 500-900000。整块思考可能要几分钟，默认 600000。',

  bingTitle: 'Bing 网页翻译（免 Key 兜底）',
  enableBing: '启用 Bing 翻译通道',
  bingDesc:
    '内置免 Key 翻译通道，无需任何配置，只翻译工具调用标题。AI 未配置或请求失败时自动兜底；思考链翻译永远不走这条通道。AI 与 Bing 同时关闭则工具调用标题也不翻译。',

  behaviorTitle: '通道行为',
  behavior1: 'AI 开启且已配置 → AI 优先翻译，失败自动降级 Bing',
  behavior2: 'AI 开启但未配置 + Bing 开启 → 由 Bing 翻译',
  behavior3: 'AI 开启但未配置 + Bing 关闭 → 不翻译',
  behavior4: 'AI 关闭 + Bing 开启 → 直接使用 Bing',
  behavior5: 'AI 关闭 + Bing 关闭 → 不翻译',

  concurrencyTitle: '最大翻译并发数',
  concurrencyDesc: '控制视口滚动与多工具卡片时的最大并行请求数（范围 1-100，推荐 3）。',
} as const;

/** Locale keys this plugin renders. */
export type ChatTranslateLocaleKey = keyof typeof zh;

/** English copy; the same key set as {@link zh}. */
export const en: Record<ChatTranslateLocaleKey, string> = {
  pageNav: 'Reading',
  title: 'Chat translate',

  masterTitle: 'Translation master switch',
  enableTranslation: 'Enable translation',
  masterDesc:
    'Translates tool-call titles in the current session (e.g. {example}) into Chinese; click a translation to switch back to the original in place. Think text stays untranslated by default and is controlled by “show think-chain translate button” in the AI card: once on, a button appears at the right of every expanded think card and translates only when clicked. The collapsed summary line of a think card is never translated. Applies to the session you are viewing only; reply text is never translated.',

  aiTitle: 'AI translation (OpenAI-compatible)',
  enableAi: 'Enable the AI translation channel',
  badgeConfigured: 'Configured',
  badgeUnconfigured: 'Not configured',
  aiFallbackNote: 'When unconfigured the AI channel is skipped and Bing takes over.',

  apiKeyTitle: 'API Key',
  apiKeyDesc: 'Saved as {ref} in {home}; takes effect immediately. Saving an empty value clears it.',
  apiKeyPlaceholderConfigured: 'Configured (type a new value to replace it)',
  save: 'Save',
  saving: 'Saving…',
  keySaved: 'Saved to {home}; takes effect immediately',
  keyCleared: 'API Key cleared (the AI channel becomes unavailable and Bing takes over)',
  saveFailed: 'Save failed: {error}',
  unknownError: 'Unknown error',

  baseUrlTitle: 'Base URL',
  baseUrlDesc: 'Any OpenAI-compatible endpoint, e.g. {url1} or {url2}',
  modelTitle: 'Model',
  modelDesc: 'e.g. {model1} or {model2}; empty counts as unconfigured',

  test: 'Test the AI channel',
  testing: 'Testing…',
  testOk: 'Connected, {latency}ms latency',
  testFail: 'Failed: {error}',

  thinkEnableTitle: 'Show the think-chain translate button',
  thinkEnableDesc:
    'Shows a button to the right of “Think” on every expanded think card; it translates that think text only when clicked, never automatically. Collapsed cards carry no button; it appears once the card is expanded. While translating, the button spins; once done it highlights solid, and clicking it again switches the whole block back to the original (clicks inside the text do not switch). Code blocks and the collapsed summary stay untouched, and the Bing channel is not involved. Turning this off removes the button and restores already translated content.',
  thinkTimeoutTitle: 'Think-chain translation timeout',
  thinkTimeoutDesc: 'In milliseconds, range 500-900000. A whole think block can take minutes; default 600000.',

  bingTitle: 'Bing web translation (key-free fallback)',
  enableBing: 'Enable the Bing translation channel',
  bingDesc:
    'A built-in key-free channel that needs no configuration and translates tool-call titles only. It takes over automatically when AI is unconfigured or a request fails; think-chain translation never uses this channel. With both AI and Bing off, tool-call titles are not translated either.',

  behaviorTitle: 'Channel behavior',
  behavior1: 'AI on and configured → AI translates first, falling back to Bing on failure',
  behavior2: 'AI on but unconfigured + Bing on → Bing translates',
  behavior3: 'AI on but unconfigured + Bing off → nothing is translated',
  behavior4: 'AI off + Bing on → Bing is used directly',
  behavior5: 'AI off + Bing off → nothing is translated',

  concurrencyTitle: 'Max translation concurrency',
  concurrencyDesc: 'Caps parallel requests while the viewport scrolls across multiple tool cards (range 1-100, recommended 3).',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.chatTranslate': ChatTranslateLocaleKey;
  }
}