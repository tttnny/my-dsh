/**
 * 配置的唯一源头：一张声明式字段表描述全部可调项。
 *
 * 投影（settings.ts）、配置卡片（card.tsx）与自检都从这张表出发，所以加一个可调项
 * 只需要在这里加一条，不会出现「卡片上有、投影里没有」这种对不上。
 *
 * 配色不在这张表里：本插件不改任何颜色，蓝阶、纸面、语法色全部读宿主的令牌。
 * 可调的只有正文的两个尺寸，与外层的两个开关。
 */

/** 配置分组。顺序就是卡片上的先后。 */
export type GroupId = 'typography' | 'appearance';

/** 一个分组的定义。 */
export interface GroupDef {
  id: GroupId;
  /** 词典里的标题键。 */
  label: string;
}

/** 卡片上的分组顺序。 */
export const GROUPS: readonly GroupDef[] = [
  { id: 'typography', label: 'group.typography' },
  { id: 'appearance', label: 'group.appearance' },
];

interface FieldBase {
  /** 字段名，也是配置里的键。 */
  key: string;
  group: GroupId;
  /** 词典里的标题键。 */
  label: string;
  /** 词典里的说明键，可选。 */
  hint?: string;
}

/** 一个数值字段。 */
export interface NumberField extends FieldBase {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}

/** 一个开关字段。 */
export interface SwitchField extends FieldBase {
  kind: 'switch';
  default: boolean;
}

/** 一个配置字段。 */
export type Field = NumberField | SwitchField;

/** 全部字段。字段顺序就是卡片上的顺序。 */
export const FIELDS: readonly Field[] = [
  { kind: 'number', key: 'lineHeight', group: 'typography', label: 'field.lineHeight', hint: 'hint.lineHeight', min: 1.4, max: 2, step: 0.05, unit: '×', default: 1.75 },
  { kind: 'number', key: 'paragraphGap', group: 'typography', label: 'field.paragraphGap', hint: 'hint.paragraphGap', min: 4, max: 24, step: 1, unit: 'px', default: 10 },

  { kind: 'switch', key: 'shellEnabled', group: 'appearance', label: 'field.shellEnabled', hint: 'hint.shellEnabled', default: true },
  { kind: 'switch', key: 'embedFont', group: 'appearance', label: 'field.embedFont', hint: 'hint.embedFont', default: true },
];

/** 配置值的类型。 */
export type ConfigValue = string | number | boolean;

/** 一份配置就是一个扁平键值表。 */
export type Config = Record<string, ConfigValue>;

/** 一份出厂的扁平配置。 */
export function defaultConfig(): Config {
  const out: Config = {};
  for (const field of FIELDS) out[field.key] = field.default;
  return out;
}

/**
 * 把一个数夹进闭区间；不是有限数就用兜底值。
 * @param value - 候选值。
 * @param min - 下界。
 * @param max - 上界。
 * @param fallback - 不是有限数时用它。
 * @returns 夹好的数。
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 把宿主可能给出的任意值收成一份可信配置：越界夹回来、缺字段补默认、脏类型丢掉。
 * @param raw - 原始配置（可能是手改过的 JSON）。
 * @returns 一份每个键都合法的配置。
 */
export function normalizeConfig(raw: Partial<Record<string, unknown>> | undefined | null): Config {
  const source = raw ?? {};
  const out: Config = {};
  for (const field of FIELDS) {
    if (field.kind === 'number') {
      out[field.key] = clampNumber(source[field.key], field.min, field.max, field.default);
      continue;
    }
    const flag = source[field.key];
    out[field.key] = typeof flag === 'boolean' ? flag : field.default;
  }
  return out;
}
