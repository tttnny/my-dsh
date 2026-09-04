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
interface ClientContext {
    effect(factory: () => void | (() => void), label: string): void;
    get?(serviceName: string): unknown;
    slots?: SlotsService | null;
}
/**
 * Mount the「扫码访问」settings section.
 * @param ctx - DSH browser client context.
 */
export declare function apply(ctx: ClientContext): void;
export {};
