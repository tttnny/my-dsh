/** Locale bundles for the chat-translate card on the DSH Plugins page. */
import type { BlockFailKind } from './chat/translate-store.ts';

/** Dictionary namespace owned by this plugin's settings card. */
export const NS = 'settings.chatTranslate';

/**
 * Chinese copy — the single source of truth for the key set. `{name}` markers
 * are either template params filled through `t(key, params)` / `.replace()`, or
 * inline technical samples rendered by `withSamples` at the call site.
 */
export const zh = {
  masterTitle: '翻译总开关',
  enableTranslation: '启用翻译',

  aiTitle: 'AI 翻译（OpenAI 兼容协议）',
  aiRule: '只有这一条通道：Key / Base URL / 模型齐备才会翻译，缺任何一项都保持原文。',
  badgeConfigured: '已配置',
  badgeUnconfigured: '未配置',

  apiKeyTitle: 'API Key',
  apiKeyDesc: '保存至 {home} 的 {ref}，离开输入框即保存生效；留空离开 = 清除',
  apiKeyPlaceholderConfigured: '已配置（如需更换请直接输入）',
  saving: '保存中…',
  autoSaveHint: '改动在离开输入框时自动保存',
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

  invalidTimeout: '超时填写不合法：请填 500 到 900000 之间的毫秒数',

  promptTitle: '翻译提示词',
  promptDesc: '拼在待译正文前面的那段指令。点「编辑」可以改写，离开输入框或点「完成」后立即生效；留空等于用内置默认。',
  promptEdit: '编辑',
  promptDone: '完成',
  promptRestore: '恢复默认',

  dockLabel: '译',
  dockOn: '正文翻译已开启，点击关闭',
  dockOff: '正文翻译已关闭，点击开启',

  failTitle: '翻译失败',
  failTitleUnconfigured: '翻译通道还没配好',
  retryAria: '翻译失败，点这个按钮重新翻译这一块',
  retryBusyAria: '正在重新翻译，请等待',
  retryAriaUnconfigured: '翻译通道还没配好：先去「插件」页把 API Key、Base URL 与模型填齐，再回来点这个按钮重试',
  retryBusyAriaUnconfigured: '正在重试，请等待',
  toggleToOriginalAria: '查看原文',
  toggleToTranslatedAria: '查看译文',
  hotspotShowOriginal: '查看原文',
  hotspotShowTranslation: '查看译文',
} as const;

/** Locale keys this plugin renders. */
export type ChatTranslateLocaleKey = keyof typeof zh;

/** English copy; the same key set as {@link zh}. */
export const en: Record<ChatTranslateLocaleKey, string> = {
  masterTitle: 'Translation master switch',
  enableTranslation: 'Enable translation',

  aiTitle: 'AI translation (OpenAI-compatible)',
  aiRule:
    'This is the only channel: translation runs when Key, Base URL and model are all present; missing any one leaves the text as it is.',
  badgeConfigured: 'Configured',
  badgeUnconfigured: 'Not configured',

  apiKeyTitle: 'API Key',
  apiKeyDesc: 'Saved as {ref} in {home}; leaving the field saves it and it takes effect immediately. Leaving it empty clears it.',
  apiKeyPlaceholderConfigured: 'Configured (type a new value to replace it)',
  saving: 'Saving…',
  autoSaveHint: 'Changes are saved when you leave a field',
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

  invalidTimeout: 'Invalid timeout: enter a number of milliseconds between 500 and 900000',

  promptTitle: 'Translation prompt',
  promptDesc: 'The instruction placed ahead of the text to translate. Press Edit to rewrite it; it applies when you leave the field or press Done. An empty field means the built-in default.',
  promptEdit: 'Edit',
  promptDone: 'Done',
  promptRestore: 'Restore default',

  dockLabel: 'Translate',
  dockOn: 'Translation is on; click to turn it off',
  dockOff: 'Translation is off; click to turn it on',

  failTitle: 'Translation failed',
  failTitleUnconfigured: 'The translation channel is not configured yet',
  retryAria: 'Translation failed — press this button to translate this block again',
  retryBusyAria: 'Translating again, please wait',
  retryAriaUnconfigured:
    'The translation channel is not configured yet: fill in the API Key, Base URL and model on the Plugins page, then press this button to retry',
  retryBusyAriaUnconfigured: 'Retrying, please wait',
  toggleToOriginalAria: 'Show the original',
  toggleToTranslatedAria: 'Show the translation',
  hotspotShowOriginal: 'Show the original',
  hotspotShowTranslation: 'Show the translation',
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
  /**
   * 失败块 ↻ 的读屏标签。Tooltip 的气泡只在 `openOnClick` 时才挂
   * `aria-describedby`，所以败因必须进标签本身——读屏用户不悬停，这是他们
   * 唯一能听到「超时 / 断流 / 空返回」的通道。
   */
  retryAria: (detail?: string | null, kind?: BlockFailKind | null) => string;
  /** 补跑在途时 ↻ 的读屏标签：说清此刻按下去没有动作，同样带上败因。 */
  retryBusyAria: (detail?: string | null, kind?: BlockFailKind | null) => string;
  /** 窄带的读屏标签：读译文时提示可切回原文，反之亦然。 */
  toggleToOriginalAria: string;
  toggleToTranslatedAria: string;
  /** 左缘窄带悬停时气泡里的文案：当前能做的那个动作。 */
  hotspotShowOriginal: string;
  hotspotShowTranslation: string;
  /** 失败块悬停文案：本地化标签（按失败类别）+ 服务端带来的技术一句。 */
  failTitle: (kind?: BlockFailKind | null, detail?: string | null) => string;
} {
  const withDetail = (label: string, detail?: string | null): string =>
    detail === undefined || detail === '' || detail === null ? label : `${label} — ${detail}`;
  /** 「设置还没配好」类失败的文案与通道伤不同：它要说清下一步去哪儿改。 */
  const unconfigured = (kind?: BlockFailKind | null): boolean => kind === 'not-configured';
  return {
    retryAria: (detail, kind) => withDetail(rowT(unconfigured(kind) ? 'retryAriaUnconfigured' : 'retryAria'), detail),
    retryBusyAria: (detail, kind) =>
      withDetail(rowT(unconfigured(kind) ? 'retryBusyAriaUnconfigured' : 'retryBusyAria'), detail),
    toggleToOriginalAria: rowT('toggleToOriginalAria'),
    toggleToTranslatedAria: rowT('toggleToTranslatedAria'),
    hotspotShowOriginal: rowT('hotspotShowOriginal'),
    hotspotShowTranslation: rowT('hotspotShowTranslation'),
    failTitle: (kind, detail) =>
      withDetail(rowT(unconfigured(kind) ? 'failTitleUnconfigured' : 'failTitle'), detail),
  };
}
