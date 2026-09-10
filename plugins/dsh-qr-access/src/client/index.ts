import { QrAccessPanel } from './panel.tsx';

/** Client plugin name, shared with the browser bundle id. */
export const name = 'dsh-qr-access';

/**
 * Declared services: only `slots`（settings.section 注册孔位）。运行时对未声明
 * 的服务一律 withholding，因此这里只声明真正用到的；其余数据全部走同源 fetch。
 */
export const inject = ['slots'];

interface SlotsService {
  inject(slot: string, factory: () => void | (() => void)): () => void;
  register(meta: Record<string, unknown>, component: unknown): () => void;
}

/** 分区文案的 locale 命名空间（dsh-client-locale 的 register/bind 契约）。 */
const NS = 'dsh-qr-access';

/** zh/en 双语字典：英文界面下分区名不再回落中文。 */
const DICTS: Record<'zh' | 'en', Record<string, string>> = {
  zh: { section: '扫码访问' },
  en: { section: 'QR Access' },
};

/**
 * `ctx.locale`（@deepseek-ai/dsh-client-locale）的最小契约面：双语 register +
 * bind（bind 返回稳定引用，调用时读当前语言；分区导航在 locale revision 变化时
 * 重新解析 label）。0.1.5-rc.1 由 dsh-web-app 补丁层（cordis.patch.yml 的
 * `locale` 行）随 web 端无条件提供。
 */
interface LocaleService {
  register(ns: string, dicts: Record<'zh' | 'en', Record<string, string>>): () => void;
  bind(ns: string): (key: string, params?: Record<string, unknown>) => string;
}

interface ClientContext {
  effect(factory: () => void | (() => void), label: string): void;
  get?(serviceName: string): unknown;
  slots?: SlotsService | null;
  locale?: LocaleService | null;
}

/**
 * Mount the「扫码访问」settings section.
 * @param ctx - DSH browser client context.
 */
export function apply(ctx: ClientContext): void {
  // locale 只做可选查找（不写进 inject）：宿主换代若缺 locale，插件仍要挂载分区，
  // 仅退化为中文文案并留痕，而不是被 cordis 拦在 apply 之外静默失效。
  const lookup = typeof ctx.get === 'function' ? ctx.get.bind(ctx) : null;
  const candidate = ctx.locale ?? (lookup ? (lookup('locale') as LocaleService | null | undefined) : null);
  const locale = candidate && typeof candidate.register === 'function' && typeof candidate.bind === 'function' ? candidate : null;
  if (locale) {
    ctx.effect(() => locale.register(NS, DICTS), 'dsh-qr-access: locale dictionaries');
  } else {
    console.warn('[dsh-qr-access] locale service unavailable — section label falls back to Chinese');
  }
  const t = locale ? locale.bind(NS) : (key: string): string => DICTS.zh[key] ?? key;

  ctx.effect(() => {
    const slots = ctx.slots ?? (lookup ? (lookup('slots') as SlotsService | null | undefined) : null);
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
      console.warn('[dsh-qr-access] slots service unavailable — settings panel not mounted');
      return;
    }
    // 注意：slots 的 inject / register 是 SlotRegistry 的原型方法，实现首行读取
    // `this.ctx`（ctx.effect 落到调用方 fiber）。必须以 `slots.xxx(...)` 方法调用
    // 保持接收者——解构成裸函数会让 this 变 undefined，直接 TypeError
    // "Cannot read properties of undefined (reading 'ctx')"，整个插件 apply 失败。
    return slots.inject('settings.section', () => {
      return slots.register(
        {
          name: 'settings.section',
          id: 'dsh-qr-access',
          // 约定：自有插件设置项 order 从 110 起步进 10（原生最大 100=桌面设置）。
          // 已占用：聊天翻译 110、A6api 120 → 本插件取 130，保证排在所有自有项之后。
          order: 130,
          label: () => t('section'),
        },
        QrAccessPanel,
      );
    });
  }, 'dsh-qr-access: settings section');
}
