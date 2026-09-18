/** Client plugin name, shared with the browser bundle id. */
export declare const name = "dsh-qr-access";
/**
 * Declared services: only `slots`（settings.section 注册孔位）。运行时对未声明
 * 的服务一律 withholding，因此这里只声明真正用到的；其余数据全部走同源 fetch。
 */
export declare const inject: string[];
interface SlotsService {
    inject(slot: string, factory: () => void | (() => void)): () => void;
    register(meta: Record<string, unknown>, component: unknown): () => void;
}
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
export declare function apply(ctx: ClientContext): void;
export {};
