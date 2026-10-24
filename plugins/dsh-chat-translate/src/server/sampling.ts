/**
 * 采样参数：Hy-MT2-1.8B 官方推荐值。
 *
 * 同一段原文今天翻两次可能不一样，但同一段只翻一次（译文池按原文内容命中），
 * 所以差异只会出现在不同段落之间，不会在同一段上来回跳。
 *
 * 官方参数里还有 `top_k 20` 与 `repetition_penalty 1.05`，这里登记但不随请求
 * 发出：它们是 vLLM 系服务的扩展，严格的 OpenAI 兼容端点收到会直接 400，那会
 * 把翻译整个打死。要用的人在自己的服务上按这两个值配。
 */
export const SAMPLING_TEMPERATURE = 0.7;
export const SAMPLING_TOP_P = 0.6;
export const SAMPLING_TOP_K = 20;
export const SAMPLING_REPETITION_PENALTY = 1.05;
