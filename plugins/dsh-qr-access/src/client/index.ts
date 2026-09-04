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

interface ClientContext {
  effect(factory: () => void | (() => void), label: string): void;
  get?(serviceName: string): unknown;
  slots?: SlotsService | null;
}

/**
 * Mount the「扫码访问」settings section.
 * @param ctx - DSH browser client context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const slots = ctx.slots ?? (typeof ctx.get === 'function' ? (ctx.get('slots') as SlotsService | null | undefined) : null);
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return;
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
          label: () => '扫码访问',
        },
        QrAccessPanel,
      );
    });
  }, 'dsh-qr-access: settings section');
}
