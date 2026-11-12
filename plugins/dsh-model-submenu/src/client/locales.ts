/** Locale bundles for the all-provider model picker. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'modelSubmenu'

/** Locale keys the picker renders. */
export type ModelSubmenuLocaleKey =
  | 'status.loading'
  | 'status.empty'
  | 'status.failed'
  | 'status.providerFailed'
  | 'action.reload'
  | 'error.action'
  | 'error.sessionInUse'
  | 'picker.title'
  | 'picker.close'
  | 'picker.search'
  | 'picker.searchEmpty'
  | 'picker.all'
  | 'picker.favorite'
  | 'picker.unfavorite'
  | 'picker.hintNavigate'
  | 'picker.hintSelect'
  | 'picker.hintClose'
  | 'meta.effort'
  | 'meta.images'
  | 'effort.label'
  | 'effort.providerDefault'
  | 'effort.useDefault'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The all-provider model picker's copy. */
    modelSubmenu: ModelSubmenuLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<ModelSubmenuLocaleKey, string> = {
  'status.loading': '正在加载模型…',
  'status.empty': '没有可用的模型。',
  'status.failed': '模型列表加载失败：{message}',
  'status.providerFailed': '{name} 加载失败：{message}',
  'action.reload': '重新加载',
  'error.action': '模型操作失败：{message}',
  'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
  'picker.title': '切换模型',
  'picker.close': '关闭',
  'picker.search': '搜索模型或提供商…',
  'picker.searchEmpty': '没有匹配的模型。',
  'picker.all': '全部',
  'picker.favorite': '收藏 {model}',
  'picker.unfavorite': '取消收藏 {model}',
  'picker.hintNavigate': '导航',
  'picker.hintSelect': '选择',
  'picker.hintClose': '关闭',
  'meta.effort': '思考',
  'meta.images': '图片输入',
  'effort.label': '推理等级',
  'effort.providerDefault': 'Default',
  'effort.useDefault': '切换为默认档位',
}

/** English dictionary, checked complete against the zh key set. */
export const en: Record<ModelSubmenuLocaleKey, string> = {
  'status.loading': 'Loading models…',
  'status.empty': 'No models available.',
  'status.failed': 'Model list failed to load: {message}',
  'status.providerFailed': '{name} failed to load: {message}',
  'action.reload': 'Reload',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
  'picker.title': 'Switch model',
  'picker.close': 'Close',
  'picker.search': 'Search models or providers…',
  'picker.searchEmpty': 'No matching models.',
  'picker.all': 'All',
  'picker.favorite': 'Favorite {model}',
  'picker.unfavorite': 'Remove {model} from favorites',
  'picker.hintNavigate': 'navigate',
  'picker.hintSelect': 'select',
  'picker.hintClose': 'close',
  'meta.effort': 'Effort',
  'meta.images': 'Images',
  'effort.label': 'Reasoning effort',
  'effort.providerDefault': 'Default',
  'effort.useDefault': 'Switch to the provider default',
}
