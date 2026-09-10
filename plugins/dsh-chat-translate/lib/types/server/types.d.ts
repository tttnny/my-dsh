export interface PluginConfig {
    enabled: boolean;
    concurrency: number;
    timeoutMs: number;
    aiTimeoutMs: number;
    aiEnabled: boolean;
    bingEnabled: boolean;
    baseUrl: string;
    model: string;
    targetLang: string;
}
export interface TranslateItemResult {
    original: string;
    translated: string;
    channel: string;
    cached: boolean;
}
export interface TranslateResponse {
    ok: boolean;
    results: TranslateItemResult[];
    error?: string;
}
export interface ITranslationAdapter {
    readonly id: string;
    readonly name: string;
    isAvailable(config: PluginConfig): boolean;
    translate(text: string, signal: AbortSignal, config: PluginConfig): Promise<string>;
}
