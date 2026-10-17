/** Locale bundles for the composer model menu and the picker it opens. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'modelSubmenu'

/** Locale keys the menu and the picker render. */
export type ModelSubmenuLocaleKey =
  | 'trigger.fallback'
  | 'trigger.loading'
  | 'trigger.selectAria'
  | 'trigger.aria'
  | 'trigger.ariaEffort'
  | 'menu.aria'
  | 'menu.effort'
  | 'menu.more'
  | 'menu.hint'
  | 'effort.providerDefault'
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
  | 'picker.favoriteGroup'
  | 'picker.favoriteGroupAria'
  | 'picker.hintNavigate'
  | 'picker.hintSelect'
  | 'picker.hintClose'
  | 'meta.effort'
  | 'meta.images'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer model menu's copy. */
    modelSubmenu: ModelSubmenuLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<ModelSubmenuLocaleKey, string> = {
  'trigger.fallback': '选择模型',
  'trigger.loading': '正在加载模型…',
  'trigger.selectAria': '选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，思考等级 {effort}',
  'menu.aria': '模型与思考等级',
  'menu.effort': '思考',
  'menu.more': '更多模型…',
  'menu.hint': '提示：切换模型或思考程度会使既有的提示词缓存失效。建议新建会话，避免额外的 token 消耗。',
  'effort.providerDefault': '默认',
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
  'picker.favoriteGroup': '已收藏',
  'picker.favoriteGroupAria': '已收藏的模型',
  'picker.hintNavigate': '导航',
  'picker.hintSelect': '选择',
  'picker.hintClose': '关闭',
  'meta.effort': '思考',
  'meta.images': '图片输入',
}

/** English dictionary, checked complete against the zh key set. */
export const en: Record<ModelSubmenuLocaleKey, string> = {
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, effort {effort}',
  'menu.aria': 'Model and effort',
  'menu.effort': 'Effort',
  'menu.more': 'More models…',
  'menu.hint': 'Changing the model or the effort invalidates the existing prompt cache. Start a new session to avoid the extra token cost.',
  'effort.providerDefault': 'Default',
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
  'picker.favoriteGroup': 'Favorites',
  'picker.favoriteGroupAria': 'Favorited models',
  'picker.hintNavigate': 'navigate',
  'picker.hintSelect': 'select',
  'picker.hintClose': 'close',
  'meta.effort': 'Effort',
  'meta.images': 'Images',
}
