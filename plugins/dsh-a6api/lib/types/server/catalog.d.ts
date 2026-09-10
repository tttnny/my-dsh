import type { A6ApiModelMeta, CatalogModelEntry } from '../types.js';
/** 当前 catalog 文件路径（v1.4+：插件子目录，不再占用 DSH home 根目录）。
 *  dshHomePath 与 DSH 的 resolveDshHome 完全一致：显式配置 home → $DSH_HOME（~ 展开）→ ~/.dsh。 */
export declare function catalogFile(): string;
export declare function getCatalog(): CatalogModelEntry[];
export declare function getCatalogEntry(id: string): CatalogModelEntry | undefined;
/** 合并新增条目（不覆盖已有条目的既有字段；仅补缺失字段，参数以用户已保存/查询到的为准）。
 *  undefined 字段不参与合并（避免覆盖已有值）；按小写 id 去重（保留首个 casing，避免大小写幽灵重复）。 */
export declare function upsertCatalogEntries(entries: CatalogModelEntry[]): Promise<void>;
/** 清空目录（重新从 A6API 拉取/OpenRouter 填充前使用）。settings.yaml 已启用条目不受影响 */
export declare function clearCatalog(): Promise<void>;
/** 全量替换式更新单个条目（模型目录页保存修改用）；patch 中值为 null 的字段 = 删除该字段。返回更新后的条目 */
export declare function updateCatalogEntry(id: string, patch: Partial<Omit<CatalogModelEntry, 'id'>>): Promise<CatalogModelEntry | null>;
/** 从 A6API 模型名推断品牌（目录无数据时的展示兜底，与旧行为一致） */
export declare function inferBrand(modelId: string): string;
/**
 * 默认推理档位：DSH llm-pi-ai 支持的全部思考档位（THINKING_LEVELS），
 * wire 值取档位名本身（identity），`off` 无 wire 值（null = 发送时不带思考参数）。
 * 新获取的市场模型默认声明全部档位，用户可自行修改。
 */
export declare const DEFAULT_REASONING_EFFORTS: Record<string, string | null>;
/**
 * 解析模型元信息（同步）：目录数据优先，缺失时返回展示兜底值。
 * 注意：写 settings.yaml 时不要用此函数的兜底值——缺字段应省略（见 buildA6apiBlock）。
 */
export declare function resolveModelMeta(modelId: string): A6ApiModelMeta;
/**
 * 拉取 A6API 市场支持的全部模型 ID（含品牌）。
 * 不排除任何模型（图像生成等一并收录，参数由 OpenRouter 查询决定能否填充）。
 */
export declare function fetchMarketplaceModels(userId?: string, accessToken?: string): Promise<{
    models: {
        id: string;
        brand?: string;
        reasoningEfforts: Record<string, string | null>;
    }[];
    failedPages: number;
}>;
export interface OrQueryResult {
    updated: CatalogModelEntry[];
    notFound: string[];
}
/**
 * 对一批模型 ID 查询 OpenRouter 并填充目录（能查到的填充，查不到的保持空参数字段）。
 * 返回更新统计：updated 为本次填充/变更的条目，notFound 为查无的 ID。
 */
export declare function queryOpenRouter(ids: string[]): Promise<OrQueryResult>;
