import type { A6ApiConfig } from '../types.js';
/**
 * DSH 原生配置整合（消除插件独立配置文件 dsh-a6api-config.json）：
 * - 凭据（API Key / 系统访问令牌 / userId）→ ~/.dsh/.credentials.yaml（refs，0600）
 * - 非机密状态（baseURL / 模型列表）→ ~/.dsh/settings.yaml 的 llm-pi-ai.providers.a6api 块
 * - 读写优先走 DSH 原生缝 ctx.credentials / ctx.settings（env 优先语义、串行写队列、schema 校验、
 *   热发布）；原生服务缺失或写入失败时回退到直接读写两个文件（格式与 DSH 原生一致）。
 * - 旧版独立配置文件在启动时自动迁移（只填空不覆盖）并归档为 dsh-a6api-config.json.bak。
 */
export declare const A6API_CRED_REF = "A6API_API_KEY";
export declare const A6API_TOKEN_REF = "A6API_ACCESS_TOKEN";
export declare const A6API_USER_REF = "A6API_USER_ID";
/** Read a key from .credentials.yaml */
export declare function readCredentialKey(refKey: string): Promise<string | null>;
/**
 * Write/update a key in .credentials.yaml。
 * DSH credentials-local 对空 ref 值整体拒收文档（parseRefs 抛错），因此
 * 空串/undefined = 删除该键行（与原生 unset 语义一致），绝不写入空值。
 */
export declare function writeCredentialKey(refKey: string, value: string): Promise<void>;
export interface ConfigAccess {
    /** 触发（并等待）旧配置文件的自动迁移；幂等，进程内只执行一次，失败不阻塞 */
    ensureMigrated(): Promise<void>;
    /** 读取当前配置：原生缝优先，逐级兜底到旧文件 */
    readConfig(): Promise<A6ApiConfig>;
    /** 写入凭据字段（空串 = 清除，走 unset）；settings 同步请用 syncModels */
    writeConfig(parts: Partial<Pick<A6ApiConfig, 'apiKey' | 'accessToken' | 'userId'>>): Promise<void>;
    /** 把模型列表（与 baseURL）同步进 DSH settings.yaml 的 llm-pi-ai.providers.a6api 块 */
    syncModels(baseURL: string, modelIds: string[]): Promise<void>;
    /** 当前 DSH 已配置的 a6api 模型 ID 列表 */
    getDshConfiguredModels(): Promise<string[]>;
}
export declare function createConfigAccess(ctx: any): ConfigAccess;
