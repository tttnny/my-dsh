import z from '@deepseek-ai/schemastery';

/**
 * `@lynn123411/dsh-maple-theme` —— 把 Maple 的配色与聊天正文排版带进 DSH。
 *
 * 宿主半边只声明这份配置的形状：界面全部由浏览器半边画（注入样式表 + 插件页上的配置卡片），
 * 这里不碰任何界面，也不注册工具。配置项落进本插件那一行的 config，浏览器半边经
 * `ctx.configForms.get('dsh-maple-theme')` 读写同一份值。
 *
 * 每个字段都标 `volatile()`：改一个开关不该重挂整条 loader entry，浏览器半边收到通知后
 * 自己改 <html> 上的属性与变量，样式表不重建。
 */
export const name = 'dsh-maple-theme';

/** 只需要 settings 服务：它承载这一行的配置，也是「不自动生成设置页」那条策略的入口。 */
export const inject = ['settings'];

/** 标题配色的三种取材方式。 */
export const HEADING_MODES = ['colorful', 'accent', 'text'] as const;

/** 标题配色：六色依次换 / 全用强调色 / 全用正文色。 */
export type HeadingMode = typeof HEADING_MODES[number];

/** 本插件在 profile 里的 loader 行 id，同时是设置的命名空间。 */
export const SETTINGS_NAMESPACE = name;

/** 配置的形状与默认值。默认值取 Maple 自己的出厂值（基础色相 35 / 207、行高 1.75）。 */
export const Config = z.object({
  /** 浅色基础色相（度）：整套浅色从它推导。 */
  hueLight: z.number().step(1).min(0).max(360).default(35).volatile(),
  /** 深色基础色相（度）。 */
  hueDark: z.number().step(1).min(0).max(360).default(207).volatile(),
  /** 正文行高倍数。 */
  lineHeight: z.number().step(0.05).min(1.4).max(2).default(1.75).volatile(),
  /** 段落间距（px）。 */
  paragraphGap: z.number().step(1).min(4).max(24).default(10).volatile(),
  /** 标题配色方式。 */
  headingColor: z.union([...HEADING_MODES]).default('colorful').volatile(),
  /** 悬停时在标题左侧显示 H1…H6 等级标记。 */
  headingIndicator: z.boolean().default(true).volatile(),
  /** 代码块使用 Maple 的语法配色。 */
  codePalette: z.boolean().default(true).volatile(),
  /** 外壳装饰：侧栏与标签条的圆角、输入卡填充、去掉会话头部那条分隔线。 */
  shellSkin: z.boolean().default(true).volatile(),
});

/** 宿主交给 apply 的那份已解析配置。 */
export type MapleConfig = {
  hueLight: number;
  hueDark: number;
  lineHeight: number;
  paragraphGap: number;
  headingColor: HeadingMode;
  headingIndicator: boolean;
  codePalette: boolean;
  shellSkin: boolean;
};

/** 宿主上下文里本插件用到的那两个成员。 */
interface HostContext {
  fiber: unknown;
  settings: {
    /** 登记这一行在设置页上的自动生成策略；`auto: false` 表示不生成。 */
    configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
  };
}

/**
 * 插件本体：声明本行的设置页策略。
 *
 * 配置界面在宿主「插件」页上（浏览器半边注册 `plugins.bundle.config`），
 * 所以这里要显式关掉内核按 Config schema 自动生成的设置页，否则同一批字段会出现两次。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx: HostContext): void {
  ctx.settings.configure({ auto: false }, ctx.fiber);
}
