/** Locale bundles for the composer model seat this plugin takes over. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'modelSubmenu'

/** Locale keys the seat renders. */
export type ModelSubmenuLocaleKey =
  | 'back'
  | 'provider.modelCount'
  | 'action.reload'
  | 'trigger.fallback'
  | 'trigger.loading'
  | 'trigger.selectAria'
  | 'trigger.aria'
  | 'trigger.ariaEffort'
  | 'menu.aria'
  | 'menu.provider'
  | 'menu.effort'
  | 'effort.providerDefault'
  | 'status.loading'
  | 'error.action'
  | 'error.sessionInUse'
  | 'warning.groupLoad'
  | 'empty.models'
  | 'empty.efforts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer model seat's copy. */
    modelSubmenu: ModelSubmenuLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<ModelSubmenuLocaleKey, string> = {
  'back': '返回',
  'provider.modelCount': '{count} 个模型',
  'action.reload': '重新加载',
  'trigger.fallback': '选择模型',
  'trigger.loading': '正在加载模型…',
  'trigger.selectAria': '选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'menu.aria': '供应商与推理等级',
  'menu.provider': '供应商',
  'menu.effort': '推理等级',
  'effort.providerDefault': 'Default',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失败：{message}',
  'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'empty.models': '没有可用的模型。',
  'empty.efforts': '当前模型未提供推理等级。',
}

/** English dictionary, checked complete against the zh key set. */
export const en: Record<ModelSubmenuLocaleKey, string> = {
  'back': 'Back',
  'provider.modelCount': '{count} models',
  'action.reload': 'Reload',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Provider and reasoning effort',
  'menu.provider': 'Provider',
  'menu.effort': 'Effort',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'empty.efforts': 'This model provides no reasoning effort levels.',
}