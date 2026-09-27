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
    '自动把回答正文里需要阅读的英文翻成中文（如 {example}），思考卡与工具调用行一律不翻，代码块原样保留。译文挂在原文位置上，点击译文可原地切回原文。回答还在流式输出时不翻，落定后整条转为中文；已经写好的中文段落原样保留。只作用于当前查看的会话，译文不写回会话上下文。',

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
    '需要阅读的回答正文；思考链正文、工具调用标题与折叠摘要永不翻译，代码块及其内部原样保留。',
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
    'Translates the English prose in assistant replies (e.g. {example}) into Chinese. Think cards and tool-call rows are never translated, and code blocks stay untouched. The translation is mounted in place of the original and clicking it switches back to the original in place. A reply that is still streaming is left alone until it settles, and paragraphs already written in Chinese pass through unchanged. Applies to the session you are viewing only; translations never enter the conversation context.',

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
    'The assistant reply prose you have to read. Think-chain text, tool-call titles and folded summaries are never translated; code blocks and their contents stay untouched.',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.chatTranslate': ChatTranslateLocaleKey;
  }
}
